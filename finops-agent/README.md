# FinOps Agent

A FinOps assistant that analyzes AWS costs, finds idle resources, and provides remediation commands.

## What It Does

1. **Gets AWS costs** — Top services by spend with month-over-month deltas
2. **Finds idle resources** — EC2 instances with <5% CPU, unattached EBS volumes
3. **Generates remediation** — Exact AWS CLI commands to stop/terminate/delete

## Run

```bash
npm install
export OPENROUTER_API_KEY=sk-or-...
npm start
```

Custom prompt:
```bash
npx tsx src/agent.ts "Find idle resources and give me the CLI commands to clean them up"
```

## Example Output

```
⚡ Iteration 1 | Model: nvidia/nemotron-3-super-120b-a12b:free | 1767ms | 🔧 Tool calls
🔧 get_aws_costs({"top_n":5}) → 0ms ✅

⚡ Iteration 2 | Model: nvidia/nemotron-3-super-120b-a12b:free | 672ms | 🔧 Tool calls
🔧 find_idle_resources({}) → 0ms ✅

⚡ Iteration 3 | Model: nvidia/nemotron-3-super-120b-a12b:free | 4611ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Result:

**Top AWS Costs (Current Month)**
1. Amazon Bedrock: $36.82 (+30.8% MoM)
2. Amazon S3: $12.41 (+4.3% MoM)
...

📈 Stats: 3 iterations | 2 tools used | 7050ms total
```

## Architecture

```
User prompt → Tinkuy Agent
                ├─ Styrr (routes to free Nvidia model)
                ├─ Sayay (checks $1/day budget)
                └─ Tool Loop:
                     1. LLM decides which tools to call
                     2. Tools execute (simulated AWS data)
                     3. Results fed back to LLM
                     4. LLM generates final answer
```

## Customization

- **Real AWS data**: Replace simulated tool responses with actual AWS SDK calls
- **More tools**: Add `get_recommendations`, `check_reserved_instances`, etc.
- **Different models**: Swap models in the `StyrRouter` config
- **Budget**: Adjust `dailyUsd` in `SayayGuard`
