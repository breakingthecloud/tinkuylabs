/**
 * sayay-guard-interceptor — Financial Guardrail Lambda
 *
 * Tokenops-002 blueprint. Reads per-user/session budget from a DynamoDB
 * global table (`DynamoStorage` from sayay-guard) and decides
 * allow/warn/degrade/block BEFORE inference.
 *
 * When the strand exceeds budget, sayay-guard's native
 * `TokenBudgetExceededException` propagates so the Step Functions Catch block
 * jumps to `FinancialKillSwitchTriggered` and stops the execution
 * deterministically — no runaway spend.
 *
 * The step functions error string is the custom exception name (Step
 * Functions matches `ErrorEquals` against the Lambda exception name).
 */

import { SayayGuard, DynamoStorage, type SayayStorage } from '@carloscortezcloud/sayay-guard';

/** Invocation shape from Step Functions */
export interface GuardEvent {
  userId: string;
  sessionId?: string;
  estimatedCostUsd?: number;
  dailyUsd?: number;
  monthlyUsd?: number;
  perCallMaxUsd?: number;
}

export interface GuardResult {
  action: 'allow' | 'warn' | 'degrade' | 'block';
  reason?: string;
  remainingUsd: number;
  suggestedModel?: string;
}

export interface HandlerEnv {
  BUDGET_TABLE: string;
  DAILY_USD?: string;
  MONTHLY_USD?: string;
  PER_CALL_MAX_USD?: string;
}

/** Lambda handler entry point */
export async function handler(
  event: GuardEvent,
  env: HandlerEnv = process.env as unknown as HandlerEnv,
  storageOverride?: SayayStorage,
): Promise<GuardResult> {
  const storage =
    storageOverride ??
    new DynamoStorage({ tableName: env.BUDGET_TABLE, partitionKey: 'pk' });
  const guard = new SayayGuard({
    storage,
    budget: {
      dailyUsd: Number(env.DAILY_USD ?? 5),
      monthlyUsd: env.MONTHLY_USD ? Number(env.MONTHLY_USD) : undefined,
      perCallMaxUsd: Number(env.PER_CALL_MAX_USD ?? 0.1),
    },
  });

  // checkOrThrow() raises the native TokenBudgetExceededException on 'block'
  // — the Step Functions Catch block matches ErrorEquals on that name.
  const decision = await guard.checkOrThrow(event.userId, event.estimatedCostUsd ?? 0);

  return {
    action: decision.action,
    reason: decision.reason,
    remainingUsd: decision.remaining,
    suggestedModel: decision.suggestedModel,
  };
}
