# 🌊 Tinkuy Labs

Example agents built with [Tinkuy](https://github.com/breakingthecloud/tinkuy) — the minimal, provider-agnostic AI agent framework.

## What's Inside

| Example | Description | Tools |
|---------|-------------|-------|
| [finops-agent](./finops-agent/) | AWS cost analysis + idle resource detection + remediation commands | 3 |

## The Stack

Each example uses the **Tinkuy ecosystem** — three composable packages:

```
┌─────────────────────────────────────────────────┐
│                  Your Agent                       │
├─────────────────────────────────────────────────┤
│  @carloscortezcloud/tinkuy-agent  (agent loop)   │
│  @carloscortezcloud/styrr-llm     (LLM routing)  │
│  @carloscortezcloud/sayay-guard   (cost guard)   │
└─────────────────────────────────────────────────┘
```

- **Tinkuy** — Tool loop engine. Call LLM → parse tool_calls → execute → feed back → repeat.
- **Styrr** — Multi-model router with automatic fallback (OpenRouter, OpenAI, Bedrock, Ollama).
- **Sayay** — Budget guardrails. Set daily/monthly limits. Block, warn, or degrade when exceeded.

## Quick Start

```bash
cd finops-agent
npm install
export OPENROUTER_API_KEY=sk-or-...  # Free models work!
npm start
```

## Get a Free API Key

1. Go to [openrouter.ai](https://openrouter.ai)
2. Sign up → Keys → Create Key
3. Free models (no credit card): `nvidia/nemotron-3-super-120b-a12b:free`, `meta-llama/llama-3.3-70b-instruct:free`

## Build Your Own Agent

```typescript
import { Agent, defineTool } from '@carloscortezcloud/tinkuy-agent';
import { StyrRouter } from '@carloscortezcloud/styrr-llm';
import { SayayGuard, MemoryStorage } from '@carloscortezcloud/sayay-guard';

const myTool = defineTool({
  name: 'hello',
  description: 'Says hello to someone',
  parameters: { type: 'object', properties: { name: { type: 'string' } } },
  execute: async (args) => `Hello, ${args.name}!`,
});

const agent = new Agent({
  router: new StyrRouter({
    apiKey: process.env.OPENROUTER_API_KEY!,
    models: [{ id: 'meta-llama/llama-3.3-70b-instruct:free' }],
  }),
  guard: new SayayGuard({
    storage: new MemoryStorage(),
    budget: { dailyUsd: 1.0 },
  }),
  tools: [myTool],
  systemPrompt: 'You are a helpful assistant.',
});

const result = await agent.run('Say hello to Carlos');
console.log(result.text);
```

## Links

- [Tinkuy](https://github.com/breakingthecloud/tinkuy) — Agent framework
- [Styrr](https://github.com/breakingthecloud/styrr) — LLM router
- [Sayay](https://github.com/breakingthecloud/sayay) — Cost guardrails
- [npm: @carloscortezcloud](https://www.npmjs.com/~carloscortezcloud)

## License

Apache 2.0
