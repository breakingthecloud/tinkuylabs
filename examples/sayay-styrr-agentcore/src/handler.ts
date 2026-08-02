/**
 * sayay-styrr-agentcore — Strands agent with Sayay budget + Styrr fallback
 *
 * Tokenops-003 example. The probabilistic step of an AgentCore application:
 * a Strands agent whose LLM calls are routed by Styrr across an ordered
 * cross-provider chain (Bedrock → external → free) and financially guarded
 * by Sayay BEFORE and AFTER every inference.
 *
 * Budget story (from the raw research):
 *   - Sayay reads the ledger, decides allow/warn/degrade/block.
 *   - On `block`, checkOrThrow() raises the native `TokenBudgetExceededException`
 *     so the Step Functions Catch block (ErrorEquals match) halts the workflow.
 *   - Usage from the completed strand is recorded back to the ledger.
 */

import { SayayGuard, DynamoStorage, MemoryStorage, type SayayStorage } from '@carloscortezcloud/sayay-guard';
import { type StyrModel } from '@carloscortezcloud/styrr-llm';
import { Agent } from '@strands-agents/sdk';
import { StyrModelProvider } from '@carloscortezcloud/styrr-strands';

/** Ordered cross-provider fallback: Bedrock (fast) → external (quality) → free (last resort) */
export const FALLBACK_CHAIN: StyrModel[] = [
  { id: 'anthropic.claude-3-sonnet-20240229-v1:0', provider: 'bedrock' },
  { id: 'openai/o1', provider: 'openrouter' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', provider: 'openrouter' },
];

/** Invocation shape from Step Functions / AgentCore */
export interface AgentCoreEvent {
  prompt: string;
  userId: string;
  sessionId?: string;
  maxTokens?: number;
}

export interface AgentCoreResult {
  completion: string;
  model: string;
  costTier: 'bedrock' | 'external' | 'free';
  tokens?: number;
  budgetAction: 'allow' | 'warn' | 'degrade';
}

export interface HandlerEnv {
  BUDGET_TABLE?: string;
  DAILY_USD?: string;
  OPENROUTER_API_KEY?: string;
}

export interface StrandResult {
  completion: string;
  model: string;
  tokens: number;
}

export type StrandRunner = (prompt: string, env: HandlerEnv) => Promise<StrandResult>;

/** Default runner: Strands agent over the Styrr cross-provider chain. */
export const defaultStrandRunner: StrandRunner = async (prompt, env) => {
  const model = new StyrModelProvider({
    models: FALLBACK_CHAIN,
    apiKey: env.OPENROUTER_API_KEY ?? '',
    onFallback: (failed, error, next) => {
      console.warn(`[sayay-styrr-agentcore] ${failed} failed (${error}) → ${next}`);
    },
  });

  const agent = new Agent({
    model,
    systemPrompt: 'You are a concise, helpful assistant embedded in an AgentCore workflow.',
  });

  const result = await agent.invoke(prompt);
  const usage = result.metrics?.accumulatedUsage;

  return {
    completion: extractText(result.lastMessage.content),
    model: model.modelId ?? FALLBACK_CHAIN[0].id,
    tokens: usage?.totalTokens ?? 0,
  };
};

/**
 * Lambda handler entry point.
 * - Storage: DynamoStorage when BUDGET_TABLE set, else MemoryStorage (testing).
 * - Budget: checkOrThrow() BEFORE the strand → native TokenBudgetExceededException
 *   on block, caught by the ASL Catch block.
 * - Runner: injectable for tests; defaults to the real Strands agent.
 */
export async function handler(
  event: AgentCoreEvent,
  env: HandlerEnv = process.env as unknown as HandlerEnv,
  storageOverride?: SayayStorage,
  runner: StrandRunner = defaultStrandRunner,
): Promise<AgentCoreResult> {
  const storage =
    storageOverride ??
    (env.BUDGET_TABLE
      ? new DynamoStorage({ tableName: env.BUDGET_TABLE, partitionKey: 'pk' })
      : new MemoryStorage());

  const guard = new SayayGuard({
    storage,
    budget: {
      dailyUsd: Number(env.DAILY_USD ?? 5),
      perCallMaxUsd: 0.1,
    },
    onExceeded: 'block',
  });

  // ── BEFORE inference: budget gate ──
  // Throws TokenBudgetExceededException when blocked (ASL Catch → kill switch).
  const decision = await guard.checkOrThrow(event.userId, 0.005);

  // ── The probabilistic step ──
  const { completion, model, tokens } = await runner(event.prompt, env);

  // ── AFTER inference: record actual usage ──
  await guard.record(event.userId, tokens > 0 ? estimateCostUsd(tokens) : 0.005);

  return {
    completion,
    model,
    costTier: costTier(model),
    tokens,
    budgetAction: decision.action === 'allow' ? 'allow' : decision.action,
  };
}

/** Pull plain text out of Strands content blocks. */
export function extractText(content: readonly unknown[]): string {
  return (content ?? [])
    .filter((b: any) => b?.type === 'textBlock' && typeof b?.text === 'string')
    .map((b: any) => b.text)
    .join('\n');
}

/** Rough token→USD estimator so sayay has a real figure to record. */
export function estimateCostUsd(tokens: number, perMillion = 3): number {
  return (tokens / 1_000_000) * perMillion;
}

export function costTier(model: string): 'bedrock' | 'external' | 'free' {
  if (model.startsWith('anthropic')) return 'bedrock';
  if (model.includes('free')) return 'free';
  return 'external';
}
