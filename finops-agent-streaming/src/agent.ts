/**
 * 🌊 Tinkuy Streaming Demo — FinOps Agent
 *
 * Demonstrates Agent.stream() with AG-UI events:
 * - iteration_start
 * - text_delta
 * - tool_call_result
 * - done
 * - blocked
 *
 * Run: OPENROUTER_API_KEY=sk-or-... pnpm start
 */

import { Agent, defineTool } from '@carloscortezcloud/tinkuy-agent';
import { StyrRouter } from '@carloscortezcloud/styrr-llm';
import { SayayGuard, MemoryStorage } from '@carloscortezcloud/sayay-guard';

const getCosts = defineTool({
  name: 'get_aws_costs',
  description: 'Get current month AWS costs broken down by service.',
  parameters: {
    type: 'object',
    properties: {
      top_n: { type: 'number', description: 'Number of top services to return (default 3)' },
    },
  },
  execute: async (args) => {
    const topN = (args.top_n as number) || 3;
    const costs = [
      { service: 'Amazon Bedrock', cost: 36.82, delta: '+30.8%' },
      { service: 'Amazon S3', cost: 12.41, delta: '+4.3%' },
      { service: 'AWS Lambda', cost: 8.23, delta: '+15.1%' },
      { service: 'Amazon DynamoDB', cost: 3.50, delta: '0.0%' },
    ];
    return { services: costs.slice(0, topN), total: 60.96, currency: 'USD', period: '2026-07' };
  },
});

const findIdle = defineTool({
  name: 'find_idle_resources',
  description: 'Find AWS resources that are idle.',
  parameters: { type: 'object', properties: {} },
  execute: async () => ({
    idle_ec2: [{ id: 'i-0abc123def', type: 't3.medium', avg_cpu: 1.2, monthly_cost: 30.37 }],
    total_waste_monthly: 30.37,
  }),
});

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error('❌ Set OPENROUTER_API_KEY environment variable');
  process.exit(1);
}

const agent = new Agent({
  router: new StyrRouter({
    apiKey,
    models: [
      { id: 'nvidia/nemotron-3-super-120b-a12b:free' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free' },
    ],
  }),
  guard: new SayayGuard({
    storage: new MemoryStorage(),
    budget: { dailyUsd: 1.0 },
    onExceeded: 'warn',
  }),
  tools: [getCosts, findIdle],
  systemPrompt: `You are a FinOps assistant. Help engineers optimize AWS costs.
Rules:
- Check costs first
- Mention idle resources if relevant
- Be concise and technical`,
  onIteration: (event) => {
    console.log(`\n⚡ iteration_start ${event.iteration} | ${event.modelUsed}`);
  },
  onToolCall: (event) => {
    console.log(`🔧 tool_call_result ${event.tool} → ${event.durationMs}ms`);
  },
  onComplete: (event) => {
    console.log(`\n🏁 done | ${event.iterations} iterations | ${event.totalLatencyMs}ms`);
    console.log(`   tools: ${event.toolsUsed.join(', ') || 'none'}`);
    console.log(`   models: ${event.modelsUsed.join(', ')}`);
  },
});

async function main() {
  const prompt = process.argv[2] || 'What are my top AWS costs and any idle resources?';
  console.log(`📝 Prompt: "${prompt}"\n`);

  for await (const event of agent.stream(prompt)) {
    if (event.type === 'text_delta') {
      process.stdout.write(event.text);
    } else if (event.type === 'tool_call_result') {
      console.log(`\n🔧 tool result: ${event.tool}`);
    } else if (event.type === 'done') {
      console.log(`\n\n🏁 done | ${event.iterations} iterations | ${event.totalLatencyMs}ms`);
      console.log(`   tools: ${event.toolsUsed.join(', ') || 'none'}`);
      console.log(`   models: ${event.modelsUsed.join(', ')}`);
    } else if (event.type === 'blocked') {
      console.log(`\n⚓ BLOCKED: ${event.blockReason}`);
    } else if (event.type === 'error') {
      console.log(`\n❌ ERROR: ${event.error}`);
    }
  }
}

main().catch(console.error);
