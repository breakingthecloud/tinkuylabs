/**
 * 🌊 Tinkuy Advanced Demo — FinOps Agent with Real APIs
 *
 * Features demonstrated:
 * 1. Styrr: auto-discovery free models from OpenRouter API (not hardcoded)
 * 2. Sayay: per-session budget ($0.50/session, warn at 80%)
 * 3. Tinkuy: 5 tools calling a real SOFE API (or simulated fallback)
 * 4. RAG-ready: search_knowledge tool pattern (simulated here, real in CF Worker)
 *
 * Run: OPENROUTER_API_KEY=sk-or-... npm start
 * With real SOFE: OPENROUTER_API_KEY=... SOFE_API_KEY=sk_sofe_... npm start
 */

import { Agent, defineTool } from '@carloscortezcloud/tinkuy-agent';
import { StyrRouter } from '@carloscortezcloud/styrr-llm';
import { SayayGuard, MemoryStorage } from '@carloscortezcloud/sayay-guard';

// ─── Auto-discover free models from OpenRouter ────────────────────────

async function discoverFreeModels(): Promise<{ id: string }[]> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error('Failed to fetch models');
    const { data } = await res.json() as any;

    const free = data
      .filter((m: any) => parseFloat(m.pricing?.prompt || '1') === 0)
      .filter((m: any) => {
        const params = m.supported_parameters || [];
        return params.includes('tools') || params.includes('tool_choice');
      })
      .filter((m: any) => (m.context_length || 0) >= 8192)
      .sort((a: any, b: any) => (b.context_length || 0) - (a.context_length || 0))
      .slice(0, 5)
      .map((m: any) => ({ id: m.id }));

    console.log(`  🔍 Discovered ${free.length} free models: ${free.map(m => m.id.split('/')[1]).join(', ')}`);
    return free;
  } catch {
    console.log('  ⚠️  Discovery failed, using fallback models');
    return [
      { id: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
      { id: 'google/gemma-4-31b-it:free' },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free' },
    ];
  }
}

// ─── Tools (real API or simulated) ───────────────────────────────────

const SOFE_API = process.env.SOFE_API_KEY ? 'https://api.sofe.dev' : '';

async function sofeApiCall(path: string): Promise<any> {
  if (!SOFE_API) return null; // No real API — use simulated data
  const res = await fetch(`${SOFE_API}${path}`, {
    headers: { 'X-API-Key': process.env.SOFE_API_KEY! },
  });
  if (!res.ok) return null;
  return res.json();
}

const getFindings = defineTool({
  name: 'get_findings',
  description: 'Get FinOps findings from the latest AWS evaluation. Filter by severity (critical/high/medium/low) or resource type.',
  parameters: {
    type: 'object',
    properties: {
      severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      resource_type: { type: 'string', description: 'AWS service (ec2, s3, lambda)' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    },
  },
  execute: async (args) => {
    // Try real API first
    const listData = await sofeApiCall('/evaluations?limit=1');
    if (listData?.evaluations?.length) {
      const evalData = await sofeApiCall(`/evaluations/${listData.evaluations[0].id}`);
      if (evalData?.findings) {
        let findings = evalData.findings;
        if (args.severity) findings = findings.filter((f: any) => f.severity === args.severity);
        if (args.resource_type) findings = findings.filter((f: any) => f.resource_type?.includes(args.resource_type as string));
        return { findings: findings.slice(0, (args.limit as number) || 10), total: findings.length };
      }
    }

    // Simulated fallback
    return {
      findings: [
        { policy_name: 'no-idle-ec2', severity: 'medium', resource_id: 'i-0abc123', resource_type: 'aws.ec2', description: 'EC2 with <5% CPU for 30 days' },
        { policy_name: 'require-cost-tags', severity: 'medium', resource_id: 'my-lambda-fn', resource_type: 'aws.lambda', description: 'Missing owner, env, costCenter tags' },
        { policy_name: 's3-lifecycle-required', severity: 'low', resource_id: 'my-logs-bucket', resource_type: 'aws.s3', description: 'No lifecycle rules configured' },
      ],
      total: 3,
      simulated: true,
    };
  },
});

const getCosts = defineTool({
  name: 'get_costs',
  description: 'Get AWS cost breakdown by service with monthly totals.',
  parameters: { type: 'object', properties: {} },
  execute: async () => {
    const listData = await sofeApiCall('/evaluations?limit=1');
    if (listData?.evaluations?.length) {
      const evalData = await sofeApiCall(`/evaluations/${listData.evaluations[0].id}`);
      if (evalData?.resources_by_type) {
        return { services: evalData.resources_by_type, total_monthly_cost: evalData.total_monthly_cost || 0 };
      }
    }
    return {
      services: { 'aws.lambda': 12, 'aws.s3': 8, 'aws.ec2': 3, 'aws.apigateway': 2 },
      total_monthly_cost: 63.86,
      simulated: true,
    };
  },
});

const searchKnowledge = defineTool({
  name: 'search_knowledge',
  description: 'Search the FinOps knowledge base for best practices, policy explanations, and optimization strategies. Use for "why" and "how" questions.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The search query' },
    },
    required: ['question'],
  },
  execute: async (args) => {
    // In production: this calls TideRAG (Vectorize + Workers AI)
    // Here: simulated knowledge base
    const knowledge: Record<string, string> = {
      'tag': 'Required tags: owner (team responsible), env (production/staging/dev), costCenter (budget code). Use AWS Organizations Tag Policies to enforce. Batch tag: aws resourcegroupstaggingapi tag-resources --resource-arn-list <arns> --tags owner=team,env=prod',
      'idle': 'Idle = EC2 <5% CPU for 30d, EBS unattached, RDS 0 connections 14d. Savings: t3.medium idle = $30/mo, 100GB EBS = $8/mo. Always verify with owner before terminating.',
      's3': 'S3 lifecycle: move logs to IA after 30d, Glacier after 90d. Delete incomplete multipart after 7d. Use Intelligent-Tiering for unpredictable access.',
      'default': 'SOFE evaluates 36 policies across 18 AWS resource types. Findings include severity, remediation commands, and blast radius analysis.',
    };
    const q = (args.question as string).toLowerCase();
    const match = Object.entries(knowledge).find(([key]) => q.includes(key));
    return { answer: match ? match[1] : knowledge.default, source: 'knowledge_base' };
  },
});

const getRemediation = defineTool({
  name: 'get_remediation',
  description: 'Get exact AWS CLI commands to fix a finding. Provide policy name or resource ID.',
  parameters: {
    type: 'object',
    properties: {
      policy_name: { type: 'string' },
      resource_id: { type: 'string' },
    },
  },
  execute: async (args) => {
    const commands: Record<string, { command: string; risk: string }> = {
      'no-idle-ec2': { command: 'aws ec2 stop-instances --instance-ids i-0abc123', risk: 'MEDIUM' },
      'require-cost-tags': { command: 'aws resourcegroupstaggingapi tag-resources --resource-arn-list arn:aws:lambda:us-east-1:123:function:my-lambda-fn --tags owner=platform,env=production,costCenter=CC-100', risk: 'LOW' },
      's3-lifecycle-required': { command: 'aws s3api put-bucket-lifecycle-configuration --bucket my-logs-bucket --lifecycle-configuration file://lifecycle.json', risk: 'LOW' },
    };
    const key = args.policy_name as string || '';
    const cmd = commands[key] || { command: `# No specific command for: ${key}`, risk: 'UNKNOWN' };
    return cmd;
  },
});

// ─── Main ────────────────────────────────────────────────────────────

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error('❌ Set OPENROUTER_API_KEY environment variable');
  process.exit(1);
}

async function main() {
  console.log('🌊 Tinkuy Advanced Demo — FinOps Agent');
  console.log('━'.repeat(60));
  console.log('');

  // Auto-discover models
  console.log('🔍 Discovering free models...');
  const models = await discoverFreeModels();
  console.log('');

  // Create agent with all features
  const agent = new Agent({
    router: new StyrRouter({
      apiKey,
      models,
      onFallback: (model, error, next) => {
        console.log(`  ⚠️  ${model.split('/')[1]} failed → trying ${next.split('/')[1]}`);
      },
    }),
    guard: new SayayGuard({
      storage: new MemoryStorage(),
      budget: { dailyUsd: 0.50 },
      onExceeded: 'warn',
    }),
    tools: [getFindings, getCosts, searchKnowledge, getRemediation],
    systemPrompt: `You are a FinOps assistant. You help engineers optimize AWS costs.
Rules:
- Always check findings before making recommendations
- Use search_knowledge for "why" and "how" questions
- Provide exact CLI commands from get_remediation
- Be concise and technical`,
    maxIterations: 5,
    temperature: 0.3,
    onIteration: (event) => {
      console.log(`  ⚡ Iteration ${event.iteration} | ${event.modelUsed.split('/')[1]} | ${event.latencyMs}ms${event.hasToolCalls ? ' | 🔧' : ''}`);
    },
    onToolCall: (event) => {
      console.log(`  🔧 ${event.tool}() → ${event.durationMs}ms ${event.error ? '❌' : '✅'}`);
    },
  });

  // Run
  const prompt = process.argv[2] || 'What are my findings and how should I fix the tagging issues?';
  console.log(`📝 "${prompt}"\n`);

  const result = await agent.run(prompt);

  console.log('');
  console.log('━'.repeat(60));
  console.log(result.text);
  console.log('━'.repeat(60));
  console.log(`📈 ${result.iterations} iterations | ${result.toolsUsed.length} tools [${result.toolsUsed.join(', ')}] | ${result.totalLatencyMs}ms`);
  console.log(`🧠 ${result.modelsUsed.join(', ')}`);
  if (result.blocked) console.log(`⚓ BLOCKED: ${result.blockReason}`);
  if (process.env.SOFE_API_KEY) console.log('🔗 Connected to real SOFE API');
  else console.log('🎭 Using simulated data (set SOFE_API_KEY for real)');
}

main().catch(console.error);
