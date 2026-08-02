/**
 * sayay-guard-interceptor — Financial Guardrail Lambda
 *
 * Tokenops-002 blueprint. Reads per-user/session budget from a DynamoDB
 * global table and decides allow/warn/degrade/block BEFORE inference.
 *
 * When the strand exceeds budget, throws `TokenBudgetExceededException`
 * so the Step Functions Catch block jumps to `FinancialKillSwitchTriggered`
 * and stops the execution deterministically — no runaway spend.
 *
 * The step functions error string is the custom exception name (Step
 * Functions matches `ErrorEquals` against the Lambda exception name).
 */

import { SayayGuard, type SayayStorage } from '@carloscortezcloud/sayay-guard';
import {
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';

/** Matches the `ErrorEquals: ["TokenBudgetExceededException"]` in the ASL */
export class TokenBudgetExceededException extends Error {
  constructor(public readonly details: { userId: string; reason: string; remaining: number }) {
    super(`TokenBudgetExceededException: ${details.reason}`);
    this.name = 'TokenBudgetExceededException';
  }
}

/**
 * DynamoDB-backed Sayay storage (global table).
 * Keys: `sayay:{userId}:{scope}` → Numeric value.
 * Daily/monthly keys include a date suffix so they reset naturally.
 */
export class DynamoBudgetStorage implements SayayStorage {
  constructor(
    private readonly tableName: string,
    private readonly client: DynamoDBClient = new DynamoDBClient(),
  ) {}

  private async getRaw(key: string): Promise<number | null> {
    const res = await this.client.send(
      new GetItemCommand({ TableName: this.tableName, Key: { pk: { S: key } } }),
    );
    const item = res.Item?.value as AttributeValue | undefined;
    return item?.N ? Number(item.N) : null;
  }

  async get(key: string): Promise<number> {
    return (await this.getRaw(key)) ?? 0;
  }

  async increment(key: string, amount: number, ttlSeconds?: number): Promise<number> {
    const ttlExpr = ttlSeconds
      ? ', #ttl = :ttl'
      : '';
    const res = await this.client.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: { pk: { S: key } },
        UpdateExpression: `ADD #value :amount${ttlExpr}`,
        ExpressionAttributeNames: { '#value': 'value', ...(ttlSeconds ? { '#ttl': 'ttl' } : {}) },
        ExpressionAttributeValues: {
          ':amount': { N: String(amount) },
          ...(ttlSeconds ? { ':ttl': { N: String(Math.floor(Date.now() / 1000) + ttlSeconds) } } : {}),
        },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    return Number(res.Attributes?.value?.N ?? amount);
  }

  async reset(key: string): Promise<void> {
    await this.client.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: { pk: { S: key } },
        UpdateExpression: 'SET #value = :zero',
        ExpressionAttributeNames: { '#value': 'value' },
        ExpressionAttributeValues: { ':zero': { N: '0' } },
      }),
    );
  }
}

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
  const storage = storageOverride ?? new DynamoBudgetStorage(env.BUDGET_TABLE);
  const guard = new SayayGuard({
    storage,
    budget: {
      dailyUsd: Number(env.DAILY_USD ?? 5),
      monthlyUsd: env.MONTHLY_USD ? Number(env.MONTHLY_USD) : undefined,
      perCallMaxUsd: Number(env.PER_CALL_MAX_USD ?? 0.1),
    },
  });

  const decision = await guard.check(event.userId, event.estimatedCostUsd ?? 0);

  if (decision.action === 'block') {
    throw new TokenBudgetExceededException({
      userId: event.userId,
      reason: decision.reason ?? 'Budget exhausted',
      remaining: decision.remaining,
    });
  }

  return {
    action: decision.action,
    reason: decision.reason,
    remainingUsd: decision.remaining,
    suggestedModel: decision.suggestedModel,
  };
}
