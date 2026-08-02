/**
 * styrr-llm-router — Multi-Model Load Balancer Lambda
 *
 * Tokenops-002 blueprint. Routes each inference by complexity:
 *  - economy tier:  `meta.llama3-1-8b-instruct` (cheap, high volume)
 *  - reasoning tier: `anthropic.claude-3-sonnet` (escalation / error mitigation)
 *
 * The probabilistic LLM stays encapsulated in this single step; the
 * surrounding Step Functions DAG owns loop control deterministically.
 */

import { StyrRouter, type StyrMessage } from '@carloscortezcloud/styrr-llm';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

/** Model tiers (mirrors the `strands_routing` from tokenops_ontology.yaml) */
export const TIERS = {
  economy: 'meta.llama3-1-8b-instruct',
  reasoning: 'anthropic.claude-3-sonnet',
} as const;

export type Tier = keyof typeof TIERS;

export interface RouteEvent {
  messages: StyrMessage[];
  tier?: Tier;
  maxTokens?: number;
}

export interface RouteResult {
  tier: Tier;
  model: string;
  text: string;
  latencyMs: number;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export function classifyComplexity(event: RouteEvent): Tier {
  if (event.tier) return event.tier;
  // Example heuristic: escalation flag or large tool surface → reasoning
  const joined = (event.messages ?? []).map((m) => m.content).join(' ').toLowerCase();
  if (joined.includes('escalat') || joined.includes('hallucin')) return 'reasoning';
  return 'economy';
}

/** Invoke a Bedrock model directly via the AWS SDK (no credentials needed to read) */
async function invokeBedrock(
  client: BedrockRuntimeClient,
  modelId: string,
  messages: StyrMessage[],
  maxTokens: number,
): Promise<{ text: string; latencyMs: number }> {
  const start = Date.now();
  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  const res = await client.send(
    new InvokeModelCommand({ modelId, contentType: 'application/json', body: JSON.stringify(body) }),
  );
  const parsed = JSON.parse(new TextDecoder().decode(res.body));
  return {
    text: parsed?.content?.[0]?.text ?? '',
    latencyMs: Date.now() - start,
  };
}

/** Lambda handler entry point */
export async function handler(
  event: RouteEvent,
  _env: Record<string, string> = process.env as Record<string, string>,
): Promise<RouteResult> {
  const tier = classifyComplexity(event);
  const model = TIERS[tier];
  const messages = event.messages ?? [];
  const maxTokens = event.maxTokens ?? 1024;

  // Primary path: Styrr router (supports fallback chains / external providers)
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    const router = new StyrRouter({
      apiKey,
      models: [
        { id: model, provider: 'openrouter' },
        // Fallback to the other tier's model
        { id: TIERS[tier === 'economy' ? 'reasoning' : 'economy'], provider: 'openrouter' },
      ],
    });
    const res = await router.call(messages, { maxTokens });
    return {
      tier,
      model: res.modelUsed,
      text: res.text,
      latencyMs: res.latencyMs,
      usage: res.usage,
    };
  }

  // Fallback: direct Bedrock invocation
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  const { text, latencyMs } = await invokeBedrock(client, model, messages, maxTokens);
  return { tier, model, text, latencyMs };
}
