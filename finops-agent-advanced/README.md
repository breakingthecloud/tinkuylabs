# FinOps Agent (Advanced)

Full-featured FinOps assistant demonstrating all Tinkuy ecosystem capabilities.

## What's Different from Basic

| Feature | Basic (`finops-agent/`) | Advanced (this) |
|---------|:-:|:-:|
| Models | Hardcoded 3 models | Auto-discovered from OpenRouter API |
| Budget | $1/day static | $0.50/session with warnings |
| Tools | 3 simulated | 4 tools (real API or simulated fallback) |
| RAG | ❌ | `search_knowledge` (simulated, real in CF Worker) |
| Fallback logs | ❌ | `onFallback` shows model switches live |
| Real data | ❌ | Optional: set `SOFE_API_KEY` for real AWS findings |

## Run

```bash
npm install
export OPENROUTER_API_KEY=sk-or-...

# Simulated data (no AWS needed)
npm start

# Real SOFE data (requires account at platform.sofe.dev)
SOFE_API_KEY=sk_sofe_... npm start

# Custom prompt
npx tsx src/agent.ts "Why does SOFE flag untagged resources?"
```

## Features Demonstrated

### 1. Auto-Discovery (Styrr)
Agent fetches free models from OpenRouter API at startup — never hardcodes models that may disappear.

### 2. Budget Guardrails (Sayay)
$0.50/session limit. Agent warns at 80% spend, blocks at 95%.

### 3. Tool Loop (Tinkuy)
LLM decides which tools to call, executes them, feeds results back, repeats until answer is ready.

### 4. Knowledge Search (TideRAG pattern)
`search_knowledge` tool answers "why" and "how" questions. In production this calls TideRAG (Vectorize + Workers AI). Here it's simulated.

## Example Output

```
🔍 Discovering free models...
  🔍 Discovered 5 free models: nemotron-3-ultra-550b-a55b, gemma-4-31b-it, ...

📝 "What are my findings and how should I fix the tagging issues?"

  ⚡ Iteration 1 | nemotron-3-ultra-550b-a55b:free | 3200ms | 🔧
  🔧 get_findings() → 0ms ✅
  ⚡ Iteration 2 | nemotron-3-ultra-550b-a55b:free | 2100ms | 🔧
  🔧 search_knowledge() → 0ms ✅
  🔧 get_remediation() → 0ms ✅
  ⚡ Iteration 3 | nemotron-3-ultra-550b-a55b:free | 4500ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Agent's answer with real findings + knowledge + CLI commands]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 3 iterations | 3 tools [get_findings, search_knowledge, get_remediation] | 9800ms
🧠 nvidia/nemotron-3-ultra-550b-a55b:free
🎭 Using simulated data (set SOFE_API_KEY for real)
```

## Architecture

```
User prompt
    │
    ▼
Tinkuy Agent
    ├── Styrr Router (auto-discovered models, ordered fallback)
    ├── Sayay Guard ($0.50/session budget)
    └── Tools:
         ├── get_findings    → SOFE API (or simulated)
         ├── get_costs       → SOFE API (or simulated)
         ├── search_knowledge→ TideRAG pattern (simulated here)
         └── get_remediation → CLI commands
```
