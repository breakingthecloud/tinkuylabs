<p align="center">
  <img alt="Tinkuy Labs" src="https://img.shields.io/badge/🌊-Tinkuy_Labs-3B82F6?style=for-the-badge" height="50">
</p>

<p align="center">
  <b>Example agents built with the Tinkuy ecosystem</b><br>
  FinOps, streaming, budget control — runnable examples you can use today.
</p>

<p align="center">
  <a href="#whats-inside">Examples</a>
  ·
  <a href="#quick-start">Quick Start</a>
  ·
  <a href="#the-stack">The Stack</a>
  ·
  <a href="#build-your-own">Build Your Own</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache_2.0-3B82F6?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs">
  <img src="https://img.shields.io/badge/powered_by-Tinkuy-3B82F6?style=flat-square" alt="Tinkuy">
  <img src="https://img.shields.io/badge/examples-5-success?style=flat-square" alt="5 examples">
</p>

---

## What's Inside

| Example | Description | Features |
|---------|-------------|----------|
| [finops-agent](./finops-agent/) | AWS cost analysis with simulated data | `Agent.run()`, tools, guardrails, `onComplete` hook |
| [finops-agent-advanced](./finops-agent-advanced/) | Auto-discovery models, RAG, real API, budget guards | `Agent.run()`, fallback chain, `onComplete` hook |
| [finops-agent-streaming](./finops-agent-streaming/) | `Agent.stream()` with AG-UI events | `text_delta`, `tool_call_result`, `done` |
| [deterministic-ontology-aws](./examples/deterministic-ontology-aws/) | TokenOps AWS reference: Step Functions + Lambda blueprints | ASL, ontology validator, CDK stack, 3 Lambda blueprints |
| [sayay-styrr-agentcore](./examples/sayay-styrr-agentcore/) | Strands agent with Sayay budget + Styrr cross-provider on AgentCore | `checkOrThrow()` kill switch, `DynamoStorage`, fallback chain |

## Quick Start

```bash
# Clone and run any example
git clone https://github.com/breakingthecloud/tinkuylabs.git
cd tinkuylabs/finops-agent
pnpm install
export OPENROUTER_API_KEY=sk-or-...  # Free models available
pnpm start
```

From the repo root (pnpm workspace):

```bash
pnpm install
pnpm --filter finops-agent start
pnpm --filter finops-agent-advanced start
pnpm --filter finops-agent-streaming start
```

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

| Package | Role |
|---------|------|
| **Tinkuy** | Tool loop engine — call LLM → parse tools → execute → repeat |
| **Styrr** | Multi-model router with automatic fallback |
| **Sayay** | Budget guardrails — set daily/monthly limits, block/warn/degrade |

## Get a Free API Key

1. Go to [openrouter.ai](https://openrouter.ai)
2. Sign up → Keys → Create Key
3. Free models (no credit card): `nvidia/nemotron-3-super-120b:free`, `meta-llama/llama-3.3-70b-instruct:free`

## Build Your Own

```typescript
import { Agent, defineTool } from '@carloscortezcloud/tinkuy-agent';
import { StyrRouter } from '@carloscortezcloud/styrr-llm';
import { SayayGuard, MemoryStorage } from '@carloscortezcloud/sayay-guard';

const agent = new Agent({
  router: new StyrRouter({
    apiKey: process.env.OPENROUTER_API_KEY!,
    models: [{ id: 'meta-llama/llama-3.3-70b-instruct:free' }],
  }),
  guard: new SayayGuard({
    storage: new MemoryStorage(),
    budget: { dailyUsd: 1.0 },
  }),
  tools: [/* your tools */],
  systemPrompt: 'You are a helpful assistant.',
});

const result = await agent.run('Say hello');
console.log(result.text);
```

## Observability Hooks

Each example uses `onComplete` to print run stats:

```typescript
const agent = new Agent({
  onComplete: (event) => {
    console.log(`Iterations: ${event.iterations}`);
    console.log(`Tools: ${event.toolsUsed.join(', ')}`);
    console.log(`Models: ${event.modelsUsed.join(', ')}`);
    console.log(`Latency: ${event.totalLatencyMs}ms`);
  },
});
```

In production, this hook pushes data to **Qhaway** for cost/latency observability.

## Streaming

The `finops-agent-streaming` example uses `Agent.stream()`:

```typescript
for await (const event of agent.stream(prompt)) {
  if (event.type === 'text_delta') process.stdout.write(event.text);
  if (event.type === 'tool_call_result') console.log(`Tool: ${event.tool}`);
  if (event.type === 'done') console.log(`Done in ${event.totalLatencyMs}ms`);
}
```

## Ecosystem

| Package | Role |
|---------|------|
| [**Tinkuy**](https://github.com/breakingthecloud/tinkuy) | Agent framework |
| [**Styrr**](https://github.com/breakingthecloud/styrr) | LLM router |
| [**Sayay**](https://github.com/breakingthecloud/sayay) | Cost guardrails |
| [**Qhaway**](https://github.com/breakingthecloud/qhaway) | Agent observability |
| [**TideRAG**](https://github.com/breakingthecloud/tiderag) | Edge RAG pipeline |

## License

Apache 2.0.

---

<p align="center">
  <a href="https://github.com/breakingthecloud/tinkuy">Tinkuy</a> ·
  <a href="https://github.com/breakingthecloud/styrr">Styrr</a> ·
  <a href="https://github.com/breakingthecloud/sayay">Sayay</a> ·
  <a href="https://github.com/breakingthecloud/qhaway">Qhaway</a> ·
  <a href="https://github.com/breakingthecloud/tiderag">TideRAG</a>
</p>
