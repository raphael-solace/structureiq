# StructureIQ

Interactive demo of a structured product generator powered by **Solace Agent Mesh**. Three specialist AI agents (Discovery, Structuring, Document) collaborate in real-time to produce validated structured note proposals from natural language client briefs.

## Live Demo

Hosted on GitHub Pages. Open `index.html` or visit the deployed URL.

## Setup

1. Open the app in your browser
2. Click the gear icon (top right) to configure your LLM endpoint
3. Enter your OpenAI-compatible API endpoint, key, and model name
4. Click "Save" and start generating

### Compatible Endpoints

Any OpenAI-compatible `/v1/chat/completions` endpoint works:

| Provider | Example endpoint |
|----------|-----------------|
| LiteLLM Proxy | `https://your-proxy.com/v1` |
| Anthropic (via LiteLLM) | Model: `anthropic/claude-sonnet-4-20250514` |
| OpenAI | `https://api.openai.com/v1` |
| vLLM | `http://localhost:8000/v1` |

## Architecture

```
Browser -> OpenAI-compatible API (LiteLLM / vLLM / etc.)
              |
     Agent 1: Discovery     (parameter extraction from natural language)
     Agent 2: Structuring   (product selection + business rule validation)
     Agent 3: Document      (term sheet, suitability, e-pricer XML)
```

All configuration is stored in browser localStorage. No server required.

## Solace Agent Mesh Concepts Demonstrated

- Orchestrator routing between specialist agents
- Business rule validation blocking workflow on failure
- Parallel artifact generation
- Timestamped audit trail
- Data governance and schema validation
