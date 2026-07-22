/**
 * 🌊 Tinkuy Demo — FinOps Agent
 *
 * A simple agent that can:
 * 1. List AWS services and their costs (simulated)
 * 2. Find idle resources (simulated)
 * 3. Suggest optimizations
 *
 * Uses: Tinkuy (agent) + Styrr (routing) + Sayay (budget)
 *
 * Run: npm start
 * Requires: OPENROUTER_API_KEY in environment
 */

import { Agent, defineTool } from '@carloscortezcloud/tinkuy-agent';
import { StyrRouter } from '@carloscortezcloud/styrr-llm';
import { SayayGuard, MemoryStorage } from '@carloscortezcloud/sayay-guard';

// ─── Tools (simulated AWS data) ─────────────────────────────────────────

const getCosts = defineTool({
  name: 'get_aws_costs',
  description: 'Get current month AWS costs broken down by service. Returns service name, cost in USD, and month-over-month delta.',
  parameters: {
    type: 'object',
    properties: {
      top_n: { type: 'number', description: 'Number of top services to return (default 5)' },
    },
  },
  execute: async (args) => {
    const topN = (args.top_n as number) || 5;
    // Simulated data (in real app: call AWS Cost Explorer via boto3/SDK)
    const costs = [
      { service: 'Amazon Bedrock', cost: 36.82, delta: '+30.8%' },
      { service: 'Amazon S3', cost: 12.41, delta: '+4.3%' },
      { service: 'AWS Lambda', cost: 8.23, delta: '+15.1%' },
      { service: 'Amazon DynamoDB', cost: 3.50, delta: '0.0%' },
      { service: 'Amazon CloudFront', cost: 2.10, delta: '-5.2%' },
      { service: 'AWS Secrets Manager', cost: 0.80, delta: '0.0%' },
    ];
    return { services: costs.slice(0, topN), total: 63.86, currency: 'USD', period: '2026-07' };
  },
});

const findIdle = defineTool({
  name: 'find_idle_resources',
  description: 'Find AWS resources that are idle (EC2 with <5% CPU, unattached EBS volumes). Returns list with resource type, ID, and estimated monthly waste.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    // Simulated data
    return {
      idle_ec2: [
        { id: 'i-0abc123def', type: 't3.medium', avg_cpu: 1.2, monthly_cost: 30.37 },
      ],
      unattached_ebs: [
        { id: 'vol-0xyz789', size_gb: 100, type: 'gp3', monthly_cost: 8.00 },
        { id: 'vol-0abc456', size_gb: 50, type: 'gp2', monthly_cost: 5.00 },
      ],
      total_waste_monthly: 43.37,
    };
  },
});

const getRemediation = defineTool({
  name: 'get_remediation',
  description: 'Get the exact AWS CLI command to fix a specific resource issue. Provide the resource ID and the action (terminate, stop, delete, rightsize).',
  parameters: {
    type: 'object',
    properties: {
      resource_id: { type: 'string', description: 'AWS resource ID (e.g., i-0abc123)' },
      action: { type: 'string', enum: ['terminate', 'stop', 'delete', 'rightsize'], description: 'What action to take' },
    },
    required: ['resource_id', 'action'],
  },
  execute: async (args) => {
    const commands: Record<string, string> = {
      terminate: `aws ec2 terminate-instances --instance-ids ${args.resource_id}`,
      stop: `aws ec2 stop-instances --instance-ids ${args.resource_id}`,
      delete: `aws ec2 delete-volume --volume-id ${args.resource_id}`,
      rightsize: `aws ec2 modify-instance-attribute --instance-id ${args.resource_id} --instance-type '{"Value": "t3.small"}'`,
    };
    return {
      command: commands[args.action as string] || 'Unknown action',
      risk: args.action === 'terminate' ? 'HIGH — irreversible' : 'MEDIUM',
      estimated_savings: '$30.37/month',
    };
  },
});

// ─── Create Agent ───────────────────────────────────────────────────────

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error('❌ Set OPENROUTER_API_KEY environment variable');
  console.error('   export OPENROUTER_API_KEY=sk-or-...');
  process.exit(1);
}

const agent = new Agent({
  // Router: multi-model fallback via Styrr
  router: new StyrRouter({
    apiKey,
    models: [
      { id: 'nvidia/nemotron-3-super-120b-a12b:free' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free' },
      { id: 'qwen/qwen3-coder:free' },
    ],
  }),

  // Guard: $1/day budget via Sayay
  guard: new SayayGuard({
    storage: new MemoryStorage(),
    budget: { dailyUsd: 1.0 },
    onExceeded: 'warn',
  }),

  // Tools
  tools: [getCosts, findIdle, getRemediation],

  // System prompt
  systemPrompt: `You are a FinOps assistant. You help cloud engineers understand and optimize their AWS costs.

Rules:
- Always check costs first before making recommendations
- When suggesting remediation, always provide the exact CLI command
- Be concise and technical
- If you find idle resources, calculate total monthly savings`,

  // Hooks (observability)
  onIteration: (event) => {
    console.log(`\n  ⚡ Iteration ${event.iteration} | Model: ${event.modelUsed} | ${event.latencyMs}ms${event.hasToolCalls ? ' | 🔧 Tool calls' : ''}`);
  },
  onToolCall: (event) => {
    console.log(`  🔧 ${event.tool}(${JSON.stringify(event.arguments).slice(0, 50)}) → ${event.durationMs}ms${event.error ? ' ❌' : ' ✅'}`);
  },
});

// ─── Run ────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌊 Tinkuy Demo — FinOps Agent');
  console.log('━'.repeat(50));
  console.log('');

  const prompt = process.argv[2] || 'What are my top AWS costs this month and are there any idle resources I should clean up?';
  console.log(`📝 Prompt: "${prompt}"`);
  console.log('');

  const result = await agent.run(prompt);

  console.log('');
  console.log('━'.repeat(50));
  console.log('📊 Result:');
  console.log('');
  console.log(result.text);
  console.log('');
  console.log('━'.repeat(50));
  console.log(`📈 Stats: ${result.iterations} iterations | ${result.toolsUsed.length} tools used [${result.toolsUsed.join(', ')}] | ${result.totalLatencyMs}ms total`);
  console.log(`🧠 Models: ${result.modelsUsed.join(', ')}`);
  if (result.blocked) console.log(`⚓ BLOCKED: ${result.blockReason}`);
}

main().catch(console.error);
