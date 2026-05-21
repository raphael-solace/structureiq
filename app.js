const promptInput = document.getElementById("prompt-input");
const generateBtn = document.getElementById("generate-btn");
const paramsGrid = document.getElementById("params-grid");
const discoveryOutput = document.getElementById("discovery-output");
const topicTrail = document.getElementById("topic-trail");
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const settingsSave = document.getElementById("settings-save");
const settingsClose = document.getElementById("settings-close");

let isRunning = false;
let sessionId = null;

function newSession() {
  return Math.random().toString(36).slice(2, 10);
}

function generateProductRef() {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Math.random() * 99999)).padStart(5, "0");
  return `SIQ-${year}-${seq}`;
}

function getConfig() {
  return {
    endpoint: localStorage.getItem("siq_endpoint") || "",
    apiKey: localStorage.getItem("siq_apikey") || "",
    model: localStorage.getItem("siq_model") || "anthropic/claude-sonnet-4-20250514",
  };
}

function saveConfig() {
  localStorage.setItem("siq_endpoint", document.getElementById("cfg-endpoint").value.trim());
  localStorage.setItem("siq_apikey", document.getElementById("cfg-apikey").value.trim());
  localStorage.setItem("siq_model", document.getElementById("cfg-model").value.trim());
  settingsModal.classList.add("hidden");
  updateConnectionStatus();
}

function updateConnectionStatus() {
  const cfg = getConfig();
  const indicator = document.getElementById("conn-status");
  if (cfg.endpoint && cfg.apiKey) {
    indicator.className = "conn-indicator connected";
    indicator.title = "Connected to " + cfg.endpoint;
  } else {
    indicator.className = "conn-indicator disconnected";
    indicator.title = "Not configured. Click settings.";
  }
}

function openSettings() {
  const cfg = getConfig();
  document.getElementById("cfg-endpoint").value = cfg.endpoint;
  document.getElementById("cfg-apikey").value = cfg.apiKey;
  document.getElementById("cfg-model").value = cfg.model;
  settingsModal.classList.remove("hidden");
}

settingsBtn.addEventListener("click", openSettings);
settingsSave.addEventListener("click", saveConfig);
settingsClose.addEventListener("click", () => settingsModal.classList.add("hidden"));

document.querySelectorAll(".example-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    promptInput.value = btn.dataset.prompt;
    promptInput.focus();
  });
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
  });
});

generateBtn.addEventListener("click", runWorkflow);

function emitTopic(topic, payload, type = "pub") {
  const ts = new Date().toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const entry = document.createElement("div");
  entry.className = `trail-entry ${type}`;

  const dirLabel = type === "tool" ? "TOOL" : type === "deny" ? "DENY" : type === "sub" ? "SUB" : "PUB";

  entry.innerHTML = `
    <span class="trail-ts">${ts}</span>
    <span class="trail-topic"><span class="trail-direction ${type}">${dirLabel}</span>${topic}</span>
    <span class="trail-payload">${payload}</span>
  `;

  topicTrail.appendChild(entry);
  topicTrail.scrollTop = topicTrail.scrollHeight;
}

function renderParams(data) {
  discoveryOutput.classList.add("visible");
  paramsGrid.innerHTML = "";
  const fields = [
    ["Risk Profile", data.riskProfile],
    ["Notional", `${data.currency} ${Number(data.notional).toLocaleString()}`],
    ["Underlying", data.underlying],
    ["Tenor", data.tenor],
    ["Protection", `${data.protectionLevel}%`],
    ["Yield Target", data.yieldTarget],
    ["Regulatory", data.regulatoryProfile],
    ["Currency", data.currency],
  ];

  fields.forEach(([label, value], i) => {
    setTimeout(() => {
      const item = document.createElement("div");
      item.className = "param-item populating";
      item.innerHTML = `<div class="param-label">${label}</div><div class="param-value">${value || "-"}</div>`;
      paramsGrid.appendChild(item);
    }, i * 80);
  });
}

function renderTermSheet(termSheet) {
  const container = document.getElementById("tab-termsheet");
  if (!termSheet) {
    container.innerHTML = '<div class="placeholder">No term sheet generated</div>';
    return;
  }
  let html = "<table>";
  const displayOrder = [
    "productName", "issuer", "isin", "underlying", "tenor", "notional",
    "currency", "protectionLevel", "coupon", "barrier", "strikeDate",
    "maturityDate", "settlementType", "dayCount", "businessDays"
  ];
  displayOrder.forEach((key) => {
    if (termSheet[key] !== undefined) {
      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
      html += `<tr><td>${label}</td><td>${termSheet[key]}</td></tr>`;
    }
  });
  html += "</table>";
  container.innerHTML = html;
}

function renderPricing(pricing) {
  const container = document.getElementById("tab-pricing");
  if (!pricing) {
    container.innerHTML = '<div class="placeholder">No pricing data</div>';
    return;
  }
  let html = '<div class="pricing-report">';
  html += `<div class="pricing-header"><span class="pricing-label">Indicative Price</span><span class="pricing-value">${pricing.indicativePrice || "-"}</span></div>`;
  html += `<div class="pricing-header"><span class="pricing-label">Issuer Margin</span><span class="pricing-value">${pricing.issuerMargin || "-"}</span></div>`;
  html += `<div class="pricing-header"><span class="pricing-label">Est. Revenue</span><span class="pricing-value highlight">${pricing.estimatedRevenue || "-"}</span></div>`;
  html += "<table>";
  const fields = [
    ["hedgingCost", "Hedging Cost"],
    ["fundingSpread", "Funding Spread"],
    ["creditCharge", "Credit Charge (CVA)"],
    ["distributionFee", "Distribution Fee"],
    ["totalCostToClient", "Total Cost to Client"],
    ["breakEvenLevel", "Break-Even Level"],
    ["impliedVol", "Implied Volatility"],
    ["deltaHedge", "Delta Hedge Ratio"],
    ["vegaExposure", "Vega Exposure"],
  ];
  fields.forEach(([key, label]) => {
    if (pricing[key] !== undefined) {
      html += `<tr><td>${label}</td><td>${pricing[key]}</td></tr>`;
    }
  });
  html += "</table></div>";
  container.innerHTML = html;
}

function renderSalesMemo(memo) {
  const container = document.getElementById("tab-sales");
  if (!memo) {
    container.innerHTML = '<div class="placeholder">No sales memo generated</div>';
    return;
  }
  let html = '<div class="sales-memo">';
  if (memo.headline) html += `<h4>${memo.headline}</h4>`;
  if (memo.clientBenefit) html += `<p class="memo-section"><strong>Client Benefit:</strong> ${memo.clientBenefit}</p>`;
  if (memo.keySellingPoints && memo.keySellingPoints.length) {
    html += '<p class="memo-section"><strong>Key Selling Points:</strong></p><ul>';
    memo.keySellingPoints.forEach((p) => { html += `<li>${p}</li>`; });
    html += "</ul>";
  }
  if (memo.objectionHandling && memo.objectionHandling.length) {
    html += '<p class="memo-section"><strong>Objection Handling:</strong></p><ul>';
    memo.objectionHandling.forEach((o) => { html += `<li>${o}</li>`; });
    html += "</ul>";
  }
  if (memo.competitivePositioning) html += `<p class="memo-section"><strong>Competitive Positioning:</strong> ${memo.competitivePositioning}</p>`;
  if (memo.suggestedPitch) html += `<p class="memo-section"><strong>Suggested Pitch:</strong> <em>${memo.suggestedPitch}</em></p>`;
  html += "</div>";
  container.innerHTML = html;
}

function renderSuitability(text) {
  const container = document.getElementById("tab-suitability");
  container.innerHTML = text
    ? `<div class="suitability-text">${text}</div>`
    : '<div class="placeholder">No suitability statement generated</div>';
}

function renderEPricer(xml) {
  const container = document.getElementById("tab-epricer");
  container.innerHTML = xml
    ? `<pre>${xml.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`
    : '<div class="placeholder">No E-Pricer payload generated</div>';
}

function updateGovernanceBadge(id, passed) {
  const el = document.getElementById(id);
  el.classList.remove("passed", "failed", "active");
  if (passed === true) {
    el.classList.add("passed");
    el.querySelector(".badge-icon").textContent = "✅";
  } else if (passed === false) {
    el.classList.add("failed");
    el.querySelector(".badge-icon").textContent = "❌";
  }
}

function resetUI() {
  discoveryOutput.classList.remove("visible");
  paramsGrid.innerHTML = "";
  document.getElementById("product-ref").textContent = "";
  document.getElementById("instrument-header").style.display = "none";
  document.getElementById("instrument-ref").textContent = "";
  document.getElementById("instrument-name").textContent = "";
  document.getElementById("status-risk").textContent = "PENDING";
  document.getElementById("status-risk").className = "status-badge";
  document.getElementById("status-approval").textContent = "PENDING";
  document.getElementById("status-approval").className = "status-badge";
  document.getElementById("tab-termsheet").innerHTML = '<div class="placeholder">Awaiting document generation...</div>';
  document.getElementById("tab-pricing").innerHTML = '<div class="placeholder">Awaiting pricing analysis...</div>';
  document.getElementById("tab-sales").innerHTML = '<div class="placeholder">Awaiting sales memo...</div>';
  document.getElementById("tab-suitability").innerHTML = '<div class="placeholder">Awaiting document generation...</div>';
  document.getElementById("tab-epricer").innerHTML = '<div class="placeholder">Awaiting document generation...</div>';
  document.getElementById("badge-rules").innerHTML = '<span class="badge-icon">&#9744;</span> Business rules pending';
  document.getElementById("badge-schema").innerHTML = '<span class="badge-icon">&#9744;</span> Output schema pending';
  document.getElementById("badge-rules").classList.remove("passed", "failed");
  document.getElementById("badge-schema").classList.remove("passed", "failed");
  topicTrail.innerHTML = "";
}

async function callLLM(systemPrompt, userMessage) {
  const cfg = getConfig();
  if (!cfg.endpoint || !cfg.apiKey) {
    throw new Error("LLM endpoint not configured. Click the settings icon.");
  }

  const url = cfg.endpoint.replace(/\/$/, "") + "/chat/completions";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 4096,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error (${response.status}): ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices[0].message.content;

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Agent returned non-JSON response");
  }
}

const DISCOVERY_SYSTEM = `You are a Discovery Agent specializing in parsing financial client briefs for structured products. You extract structured parameters and perform initial market context analysis.

You MUST return ONLY valid JSON with no markdown formatting, no code fences, no explanation. Just the raw JSON object.

Extract these fields:
- riskProfile: "conservative" | "moderate" | "aggressive"
- notional: number (in base currency units)
- currency: "EUR" | "USD" | "GBP" | "CHF"
- underlying: the reference asset or index
- tenor: string (e.g., "3Y", "18M", "5Y")
- protectionLevel: number 0-100 (percentage of capital protected, infer from context)
- yieldTarget: string (e.g., "4-6% p.a.", "8-12% p.a.")
- regulatoryProfile: "retail" | "professional" | "institutional"
- marketContext: string (1-2 sentences about current market conditions for this underlying)
- volatilityRegime: "low" | "medium" | "high" (infer from underlying type and market)
- clientObjective: string (primary goal: "capital preservation" | "yield enhancement" | "leveraged exposure" | "diversification")

Infer values intelligently from context. For conservative clients, default protectionLevel to 90-100. For aggressive, 0-70. For pension funds, regulatoryProfile is "institutional".`;

const STRUCTURING_SYSTEM = `You are a Structuring Agent specializing in structured product selection, compliance validation, and pricing analysis. You receive discovery parameters, select the optimal product structure, validate business rules, and provide detailed pricing estimates.

You MUST return ONLY valid JSON with no markdown formatting, no code fences, no explanation. Just the raw JSON object.

Product selection logic:
- Conservative + high protection: Capital Protected Note
- Aggressive + single stocks: Autocall or Reverse Convertible
- Yield enhancement focus: Barrier Note or Reverse Convertible
- Institutional + large notional: Capital Protected Note or Barrier Note

Return JSON with:
- productType: "Capital Protected Note" | "Autocall" | "Reverse Convertible" | "Barrier Note"
- coupon: string (e.g., "5.2% p.a.")
- barrier: number (percentage, e.g., 65 means 65% barrier)
- knockInType: "European" | "American" | "None"
- rules: array of 3 objects, each with:
  - name: string (the rule name)
  - passed: boolean
  - reason: string (brief explanation)
- pricing: object with:
  - indicativePrice: string (e.g., "98.45%" or "100.20%")
  - issuerMargin: string (e.g., "1.85%" or "2.30%")
  - estimatedRevenue: string (the margin applied to notional, e.g., "EUR 9,250" or "$23,000")
  - hedgingCost: string (e.g., "3.2% of notional")
  - fundingSpread: string (e.g., "45bps")
  - creditCharge: string (e.g., "12bps (CVA)")
  - distributionFee: string (e.g., "0.75%")
  - totalCostToClient: string (embedded cost percentage)
  - breakEvenLevel: string (e.g., "97.2% of initial")
  - impliedVol: string (e.g., "22.4%")
  - deltaHedge: string (e.g., "-0.45")
  - vegaExposure: string (e.g., "EUR 1,200 per 1vol")

The 3 business rules to validate:
1. "Minimum Protection Threshold": For conservative profiles, protectionLevel must be >= 80%. For moderate >= 50%. Always passes for aggressive.
2. "Notional Tier Limit": Retail <= 1M, Professional <= 10M, Institutional <= 50M.
3. "Product Suitability": Autocalls and Reverse Convertibles are NOT approved for conservative retail clients. Capital Protected Notes are approved for all profiles.

If a rule fails, set passed: false and explain why. The structuring STILL returns a product suggestion but marks the failing rules clearly.

For pricing, generate realistic values based on current market conditions. Higher vol = higher option premiums = better coupons. Revenue should be the issuer margin applied to the notional amount.`;

const DOCUMENT_SYSTEM = `You are a Document Agent specializing in comprehensive financial document generation for structured products. You generate term sheets, suitability assessments, e-pricer payloads, and detailed sales memos for the distribution team.

You MUST return ONLY valid JSON with no markdown formatting, no code fences, no explanation. Just the raw JSON object.

Return JSON with four fields:

1. termSheet: object with keys: productName, issuer, isin, underlying, tenor, notional, currency, protectionLevel, coupon, barrier, strikeDate, maturityDate, settlementType, dayCount, businessDays, autocallFrequency (if applicable), memoryFeature (if applicable), earlyRedemption (if applicable)

2. suitabilityStatement: string (3-4 professional sentences explaining why this product suits the client's profile, risk tolerance, and investment objectives. Reference specific regulatory requirements met.)

3. ePricerXml: string containing valid XML with structure:
  <StructuredNote>
    <ISIN>XS + 10 random digits</ISIN>
    <Issuer>Solace Capital Markets</Issuer>
    <Underlying>...</Underlying>
    <Currency>...</Currency>
    <Notional>...</Notional>
    <Tenor>...</Tenor>
    <ProtectionLevel>...</ProtectionLevel>
    <Coupon>...</Coupon>
    <BarrierLevel>...</BarrierLevel>
    <KnockInType>...</KnockInType>
    <SettlementType>Cash</SettlementType>
    <PricingDate>today's date</PricingDate>
    <StrikeDate>T+2</StrikeDate>
    <MaturityDate>calculated from tenor</MaturityDate>
  </StructuredNote>

4. salesMemo: object with:
  - headline: string (punchy 1-line product summary for sales desk, e.g., "3Y Euro Stoxx 50 CPN | 95% Protection | 4.8% p.a.")
  - clientBenefit: string (2-3 sentences on why this product is compelling for the client right now given market conditions)
  - keySellingPoints: array of 3-4 strings (concise bullet points for the sales pitch)
  - objectionHandling: array of 2-3 strings (common client objections and suggested responses)
  - competitivePositioning: string (how this compares to alternatives: deposits, bonds, direct equity)
  - suggestedPitch: string (2-3 sentence elevator pitch the salesperson can use verbatim with the client)

Generate realistic values. Use today's date for pricing. ISIN should look real (XS followed by 10 digits). The sales memo should be actionable and ready for a relationship manager to use in their next client meeting.`;

async function runWorkflow() {
  const prompt = promptInput.value.trim();
  if (!prompt || isRunning) return;

  const cfg = getConfig();
  if (!cfg.endpoint || !cfg.apiKey) {
    openSettings();
    return;
  }

  isRunning = true;
  sessionId = newSession();
  generateBtn.disabled = true;
  generateBtn.classList.add("loading");
  generateBtn.innerHTML = '<span class="btn-icon">&#8635;</span> Processing...';

  resetUI();

  const refNumber = generateProductRef();
  document.getElementById("product-ref").textContent = refNumber;
  document.getElementById("instrument-ref").textContent = refNumber;

  emitTopic(
    `sam/v1/request/orchestrator/${sessionId}`,
    `User brief received. Initiating 5-phase structuring workflow.`,
    "pub"
  );

  try {
    // === PHASE 1: DISCOVERY ===
    await delay(300);

    emitTopic(
      `sam/v1/request/discovery/${sessionId}`,
      `Orchestrator delegates: extract parameters and market context`,
      "pub"
    );

    emitTopic(
      `sam/v1/tool/discovery/nlp_extraction/${sessionId}`,
      `Tool call: parse_client_brief(text="${prompt.slice(0, 50)}...")`,
      "tool"
    );

    emitTopic(
      `sam/v1/tool/discovery/market_data_lookup/${sessionId}`,
      `Tool call: get_market_context(query=underlying, vol_regime)`,
      "tool"
    );

    const discoveryResult = await callLLM(DISCOVERY_SYSTEM, prompt);

    emitTopic(
      `sam/v1/response/discovery/${sessionId}`,
      `Parameters extracted: ${discoveryResult.underlying}, ${discoveryResult.tenor}, ${discoveryResult.riskProfile}, vol=${discoveryResult.volatilityRegime}`,
      "pub"
    );

    renderParams(discoveryResult);

    emitTopic(
      `sam/v1/acl/deny/discovery/${sessionId}`,
      `ACL BLOCK: discovery cannot publish to sam/v1/request/document/>`,
      "deny"
    );

    emitTopic(
      `sam/v1/acl/deny/discovery/${sessionId}`,
      `TOOL DENY: discovery cannot invoke pricing_model (restricted to structuring)`,
      "deny"
    );

    // === PHASE 2: STRUCTURING + PRICING ===
    await delay(500);

    emitTopic(
      `sam/v1/request/structuring/${sessionId}`,
      `Orchestrator delegates: product selection, rule validation, and pricing analysis`,
      "pub"
    );

    emitTopic(
      `sam/v1/tool/structuring/rule_engine/${sessionId}`,
      `Tool call: validate_business_rules(profile=${discoveryResult.riskProfile}, notional=${discoveryResult.notional})`,
      "tool"
    );

    emitTopic(
      `sam/v1/tool/structuring/pricing_model/${sessionId}`,
      `Tool call: run_pricing_model(underlying=${discoveryResult.underlying}, vol=${discoveryResult.volatilityRegime}, tenor=${discoveryResult.tenor})`,
      "tool"
    );

    emitTopic(
      `sam/v1/tool/structuring/risk_calc/${sessionId}`,
      `Tool call: compute_greeks(delta, vega, gamma) and CVA charge`,
      "tool"
    );

    const structUserMsg = `Client parameters:\n${JSON.stringify(discoveryResult, null, 2)}\n\nSelect the optimal product structure, validate all 3 business rules, and provide full pricing breakdown including issuer margin, hedging costs, and estimated revenue.`;
    const structuringResult = await callLLM(STRUCTURING_SYSTEM, structUserMsg);

    const allRulesPassed = structuringResult.rules && structuringResult.rules.every((r) => r.passed);

    emitTopic(
      `sam/v1/response/structuring/${sessionId}`,
      `Product: ${structuringResult.productType} | Price: ${structuringResult.pricing?.indicativePrice || "-"} | Revenue: ${structuringResult.pricing?.estimatedRevenue || "-"}`,
      "pub"
    );

    document.getElementById("instrument-header").style.display = "block";
    document.getElementById("instrument-name").textContent = structuringResult.productType;
    document.getElementById("status-risk").textContent = allRulesPassed ? "RISK ASSESSED" : "RISK FLAG";
    document.getElementById("status-risk").className = "status-badge " + (allRulesPassed ? "assessed" : "rejected");

    if (allRulesPassed) {
      updateGovernanceBadge("badge-rules", true);
      document.getElementById("badge-rules").innerHTML = `<span class="badge-icon">✅</span> ${structuringResult.rules.length}/${structuringResult.rules.length} business rules passed`;
    } else {
      const failedRules = structuringResult.rules.filter((r) => !r.passed);
      failedRules.forEach((r) => {
        emitTopic(
          `sam/v1/governance/violation/${sessionId}`,
          `Rule failed: ${r.name} - ${r.reason}`,
          "error"
        );
      });
      updateGovernanceBadge("badge-rules", false);
      document.getElementById("badge-rules").innerHTML = `<span class="badge-icon">❌</span> ${structuringResult.rules.filter((r) => r.passed).length}/${structuringResult.rules.length} business rules passed`;
    }

    renderPricing(structuringResult.pricing);

    emitTopic(
      `sam/v1/acl/check/client_tier/${sessionId}`,
      `Client tier: ${discoveryResult.regulatoryProfile} | Product: ${structuringResult.productType} | ACCESS GRANTED`,
      "pub"
    );

    if (discoveryResult.regulatoryProfile === "retail") {
      emitTopic(
        `sam/v1/acl/deny/client_tier/${sessionId}`,
        `TIER BLOCK: retail clients denied access to sam/v1/tool/*/exotic_payoff`,
        "deny"
      );
    }

    // === PHASE 3: DOCUMENT GENERATION ===
    await delay(500);

    emitTopic(
      `sam/v1/acl/deny/document/${sessionId}`,
      `TOOL DENY: document agent cannot invoke rule_engine (restricted to structuring)`,
      "deny"
    );

    emitTopic(
      `sam/v1/request/document/${sessionId}`,
      `Orchestrator delegates: generate term sheet, suitability, e-pricer XML, and sales memo`,
      "pub"
    );

    emitTopic(
      `sam/v1/tool/document/term_sheet_gen/${sessionId}`,
      `Tool call: generate_term_sheet(product=${structuringResult.productType}, isin=XS...)`,
      "tool"
    );

    emitTopic(
      `sam/v1/tool/document/suitability_assessment/${sessionId}`,
      `Tool call: assess_suitability(profile=${discoveryResult.regulatoryProfile}, risk=${discoveryResult.riskProfile})`,
      "tool"
    );

    emitTopic(
      `sam/v1/tool/document/xml_builder/${sessionId}`,
      `Tool call: build_epricer_payload(product=${structuringResult.productType})`,
      "tool"
    );

    emitTopic(
      `sam/v1/tool/document/sales_memo_gen/${sessionId}`,
      `Tool call: generate_sales_memo(product=${structuringResult.productType}, revenue=${structuringResult.pricing?.estimatedRevenue || "-"})`,
      "tool"
    );

    const docUserMsg = `Generate all four document artifacts for this structured product.\n\nDiscovery Parameters:\n${JSON.stringify(discoveryResult, null, 2)}\n\nStructuring Result (including pricing):\n${JSON.stringify(structuringResult, null, 2)}\n\nProduct Reference: ${refNumber}\n\nGenerate: (1) comprehensive term sheet, (2) detailed suitability statement, (3) e-pricer XML, (4) actionable sales memo for the distribution desk.`;
    const documentResult = await callLLM(DOCUMENT_SYSTEM, docUserMsg);

    emitTopic(
      `sam/v1/response/document/${sessionId}`,
      `Artifacts generated: term_sheet, suitability, epricer_xml, sales_memo`,
      "pub"
    );

    renderTermSheet(documentResult.termSheet);
    renderSuitability(documentResult.suitabilityStatement);
    renderEPricer(documentResult.ePricerXml);
    renderSalesMemo(documentResult.salesMemo);

    document.getElementById("status-approval").textContent = "APPROVED";
    document.getElementById("status-approval").className = "status-badge approved";

    updateGovernanceBadge("badge-schema", true);
    document.getElementById("badge-schema").innerHTML = '<span class="badge-icon">✅</span> 5 artifacts validated and delivered';

    emitTopic(
      `sam/v1/response/orchestrator/${sessionId}`,
      `Workflow complete. 5 artifacts delivered: term sheet, pricing, sales memo, suitability, e-pricer.`,
      "pub"
    );

    emitTopic(
      `sam/v1/audit/replay/${sessionId}`,
      `Full session replay: ${topicTrail.children.length} events | Ref: ${refNumber}`,
      "sub"
    );

  } catch (err) {
    emitTopic(
      `sam/v1/error/orchestrator/${sessionId}`,
      `ERROR: ${err.message}`,
      "error"
    );
  } finally {
    isRunning = false;
    generateBtn.disabled = false;
    generateBtn.classList.remove("loading");
    generateBtn.innerHTML = '<span class="btn-icon">&#9654;</span> Generate Structure';
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

updateConnectionStatus();
