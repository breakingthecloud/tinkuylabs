# 🌊 Tinkuy Labs

[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Tinkuy](https://img.shields.io/badge/Tinkuy-agent%20framework-3B82F6)](https://github.com/breakingthecloud/tinkuy)
[![Styrr](https://img.shields.io/badge/Styrr-LLM%20router-10B981)](https://github.com/breakingthecloud/styrr)
[![Sayay](https://img.shields.io/badge/Sayay-cost%20guardrails-F59E0B)](https://github.com/breakingthecloud/sayay)

Example agents built with [Tinkuy](https://github.com/breakingthecloud/tinkuy) — the minimal, provider-agnostic AI agent framework.

## What's Inside

| Example | Description | Features |
|---------|-------------|----------|
| [finops-agent](./finops-agent/) | Basic: AWS cost analysis with simulated data | `Agent.run()`, tools, guardrails, `onComplete` hook |
| [finops-agent-advanced](./finops-agent-advanced/) | Advanced: auto-discovery models, RAG, real API, budget guards | `Agent.run()`, fallback chain, `onComplete` hook |
| [finops-agent-streaming](./finops-agent-streaming/) | Streaming: `Agent.stream()` with AG-UI events | `text_delta`, `tool_call_result`, `done` |

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
pnpm install
export OPENROUTER_API_KEY=sk-or-...  # Free models work!
pnpm start
```

All examples use [pnpm](https://pnpm.io) workspaces. From the repo root:

```bash
pnpm install
pnpm --filter finops-agent start
pnpm --filter finops-agent-advanced start
pnpm --filter finops-agent-streaming start
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

## Observability Hooks

Each example uses `onComplete` to print run stats:

```typescript
const agent = new Agent({
  // ... router, tools, guard
  onComplete: (event) => {
    console.log(`Iterations: ${event.iterations}`);
    console.log(`Tools: ${event.toolsUsed.join(', ')}`);
    console.log(`Models: ${event.modelsUsed.join(', ')}`);
    console.log(`Latency: ${event.totalLatencyMs}ms`);
  },
});
```

In production, this hook is where you push data to **Qhaway** for cost/latency observability.

## Streaming

The `finops-agent-streaming` example uses `Agent.stream()`:

```typescript
for await (const event of agent.stream(prompt)) {
  if (event.type === 'text_delta') process.stdout.write(event.text);
  if (event.type === 'tool_call_result') console.log(`Tool: ${event.tool}`);
  if (event.type === 'done') console.log(`Done in ${event.totalLatencyMs}ms`);
}
```

## Links

- [Tinkuy](https://github.com/breakingthecloud/tinkuy) — Agent framework
- [Styrr](https://github.com/breakingthecloud/styrr) — LLM router
- [Sayay](https://github.com/breakingthecloud/sayay) — Cost guardrails
- [Qhaway](https://github.com/breakingthecloud/qhaway) — Agent observability
- [npm: @carloscortezcloud](https://www.npmjs.com/~carloscortezcloud)

## License

Apache 2.0
