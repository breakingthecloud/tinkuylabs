# Agent Config Specification v1

> Universal, framework-agnostic configuration for AI agents.

Declarative spec that adapters translate to native framework configs. Write once, run on any agent framework.

## Quick Start

```yaml
# agent.config.yaml
agent:
  name: my-agent
  description: My AI agent

models:
  primary:
    model: claude-sonnet-4-6
    provider: anthropic
    settings:
      temperature: 0.5
```

```bash
# Validate
npx @agentconfig/spec agent.config.yaml

# Detect framework
npx @agentconfig/spec agent.config.yaml detect

# Translate to target framework
npx @agentconfig/spec agent.config.yaml translate --target strands
npx @agentconfig/spec agent.config.yaml translate --target langgraph
npx @agentconfig/spec agent.config.yaml translate --target openai-agents
npx @agentconfig/spec agent.config.yaml translate --target crewai
npx @agentconfig/spec agent.config.yaml translate --target tinkuy
```

## Schema

The full JSON Schema is at [`schemas/v1/agent.config.schema.json`](schemas/v1/agent.config.schema.json).

### Top-Level Sections

| Section | Required | Description |
|---------|----------|-------------|
| `agent` | ✅ | Identity: name, description, version, framework tag |
| `models` | ✅ | Primary model, fallbacks, routing strategy |
| `budget` | ❌ | Cost limits, thresholds, actions on exceed |
| `guardrails` | ❌ | Input/output validation, PII, loop detection |
| `tracing` | ❌ | Observability: OTel, exporters, privacy, span kinds |
| `tools` | ❌ | Functions, MCP servers, concurrency |
| `memory` | ❌ | Short-term (window), long-term (vector), session |
| `orchestration` | ❌ | Multi-agent: handoffs, mode, coordinator |
| `runtime` | ❌ | Timeouts, retries, concurrency, secrets |
| `extensions` | ❌ | Framework-specific overrides |

## Supported Frameworks

| Framework | Adapter | Models | Budget | Guardrails | Tracing | Tools | Memory | Orch. | Runtime |
|-----------|---------|--------|--------|------------|---------|-------|--------|-------|---------|
| **Tinkuy** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Strands** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ✅ |
| **LangGraph** | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **OpenAI Agents SDK** | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **CrewAI** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |

✅ = Full support · ⚠️ = Partial (warnings emitted) · ❌ = Not supported natively (use extensions)

## Section Reference

### `agent`

```yaml
agent:
  name: my-agent              # Required: unique identifier
  description: ...            # Used as system prompt in some adapters
  version: "1.0.0"
  framework: tinkuy           # Target framework hint
  tags: [production, support]
```

### `models`

```yaml
models:
  primary:                    # Required
    model: claude-sonnet-4-6
    provider: anthropic       # openai | anthropic | google | bedrock | ollama | ...
    baseUrl: https://...      # Custom endpoint
    apiKey: $ANTHROPIC_API_KEY
    settings:
      temperature: 0.5
      maxTokens: 8192
  fallbacks:                  # Ordered failover list
    - model: gpt-4o
      provider: openai
  routing:
    strategy: cost-optimized   # priority | cost-optimized | latency-optimized | round-robin | failover
    modes:                    # Named routing modes
      cheap:
        model: gemini-2.5-flash
      best:
        model: claude-opus-4-6
    modelMapping:             # Cross-provider model equivalence
      claude-sonnet-4-6: gpt-4o
```

### `budget`

```yaml
budget:
  enabled: true
  currency: USD
  limits:
    perCall:
      maxCostUsd: 0.50
      maxTokens: 10000
    perRun:
      maxCostUsd: 5.00
      maxCalls: 20
    perDay:
      maxCostUsd: 50.00
    perMonth:
      maxCostUsd: 500.00
    perUser:
      maxCostUsd: 10.00
      maxCalls: 100
  softThresholds: [0.7, 0.9]
  onSoftExceeded: downgrade-model   # log | downgrade-model | reduce-capabilities | notify
  onHardExceeded: reject            # reject | halt | downgrade-model | notify
  persistence:
    backend: redis                  # memory | redis | sqlite | postgres
    connectionString: $REDIS_URL
```

### `guardrails`

```yaml
guardrails:
  input:
    - type: sayay-guard
      onViolation: block
      config:
        promptInjection: true
  output:
    - type: hallucination-check
      onViolation: warn
  loopDetection:
    enabled: true
    maxIterations: 15
    maxToolCalls: 30
    maxConsecutiveSameTool: 3
    onDetected: inject-message       # halt | notify | inject-message | escalate
  pii:
    enabled: true
    mode: redact                     # detect | redact | block
    entities: [email, phone, ssn, credit_card]
```

### `tracing`

```yaml
tracing:
  enabled: true
  exporter: otel                    # otel | console | file | datadog | braintrust | langfuse | langsmith | arize-phoenix
  endpoint: $OTEL_ENDPOINT
  headers:
    x-api-key: $OTEL_API_KEY
  privacy: metadata-only            # none | metadata-only | full
  sampleRate: 1.0
  spanKinds: [agent, llm_call, tool_call, retrieval, guardrail, reasoning]
  resourceAttributes:
    service.namespace: my-app
    deployment.environment: production
```

### `tools`

```yaml
tools:
  functions:
    - name: web_search
      description: Search the web
      timeoutMs: 30000
    - name: save_file
      enabled: true
  mcp:
    - name: browser
      transport: stdio              # stdio | sse | streamable-http
      command: npx
      args: ["-y", "@anthropic-ai/mcp-browser"]
    - name: api-server
      transport: streamable-http
      url: https://mcp.example.com
      headers:
        Authorization: Bearer $MCP_TOKEN
  maxConcurrent: 5
  toolChoice: auto                  # auto | required | none
```

### `memory`

```yaml
memory:
  shortTerm:
    type: sliding-window            # sliding-window | summary | full
    maxMessages: 50
    maxTokens: 40000
  longTerm:
    enabled: true
    backend: pinecone               # pinecone | qdrant | weaviate | chroma | milvus | redis | postgres | memory
    connectionString: $PINECONE_URL
    namespace: my-agent
    embeddingModel: text-embedding-3-small
    topK: 10
  session:
    enabled: true
    backend: redis                  # memory | redis | sqlite | postgres | dynamodb
    ttl: "24h"
```

### `orchestration`

```yaml
orchestration:
  mode: hierarchical               # single | sequential | hierarchical | swarm | graph
  handoffs:
    - agent: specialist-1
      description: Expert in X
      condition: "when X is needed"
  coordinator: my-agent
  maxAgents: 5
```

### `runtime`

```yaml
runtime:
  timeoutMs: 300000
  maxRetries: 3
  retryBackoff: exponential         # fixed | linear | exponential
  retryInitialDelayMs: 1000
  retryMaxDelayMs: 30000
  concurrency: 10
  environment: production            # development | staging | production
  secrets:
    - name: API_KEY
      source: env                   # env | file | aws-secrets-manager | gcp-secret-manager | azure-keyvault | vault
      reference: MY_API_KEY
```

### `extensions`

Framework-specific overrides. Keys are framework IDs, values are arbitrary objects passed through to the adapter.

```yaml
extensions:
  tinkuy:
    orchestration:
      coordinatorModel: claude-sonnet-4-6
  strands:
    systemPrompt: "Custom system prompt"
  langgraph:
    recursion_limit: 50
```

## Programmatic Usage

```typescript
import { validate, createDefaultRegistry, detectFramework } from "@agentconfig/spec";

// Validate
const result = validate(myConfig);
if (!result.valid) {
  console.error(result.errors);
}

// Auto-detect framework
const framework = detectFramework(myConfig); // "tinkuy" | "strands" | ...

// Translate to native config
const registry = createDefaultRegistry();
const adapter = registry.get("strands");
const { config, warnings } = adapter.translate(myConfig);

console.log(config);     // Native framework config
console.log(warnings);   // Features not fully supported
```

## Design Principles

1. **Declarative over imperative** — Describe what you want, not how to wire it
2. **Framework-agnostic core** — Universal sections work everywhere
3. **Progressive enhancement** — Start minimal, add sections as needed
4. **Warnings not errors** — Adapters warn when a feature isn't natively supported
5. **Extensions for edge cases** — Framework-specific overrides without breaking the spec
6. **Validation-first** — JSON Schema validation before adapter translation

## Contributing

Adapters for new frameworks welcome. Each adapter implements:
- `translate(config: AgentConfig)` → native config
- `capabilities()` → which universal features it supports

## License

MIT
