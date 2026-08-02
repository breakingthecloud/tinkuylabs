import { describe, it, expect, vi } from 'vitest';
import { handler } from '../src/handler.js';
import {
  MemoryStorage,
  DynamoStorage,
  TokenBudgetExceededException,
} from '@carloscortezcloud/sayay-guard';

function mockDynamo() {
  const store = new Map<string, number>();
  const send = vi.fn(async (cmd: any) => {
    const cmdName = cmd.constructor?.name || '';
    const key = cmd?.input?.Key?.pk;
    if (cmdName.includes('Get')) {
      return { Item: key && store.has(key) ? { pk: key, value: store.get(key) } : undefined };
    }
    if (cmdName.includes('Update')) {
      const amt = cmd.input.ExpressionAttributeValues[':amt'];
      const next = (store.get(key) || 0) + amt;
      store.set(key, next);
      return { Attributes: { pk: key, value: next } };
    }
    return {};
  });
  return { send, store };
}

describe('DynamoStorage', () => {
  it('returns 0 for missing keys', async () => {
    const { send } = mockDynamo();
    const storage = new DynamoStorage({ tableName: 'budget-table', client: { send } });
    await expect(storage.get('sayay:u1:daily:2026-01-01')).resolves.toBe(0);
  });

  it('increments and returns the new value', async () => {
    const { send } = mockDynamo();
    const storage = new DynamoStorage({ tableName: 'budget-table', client: { send } });
    await expect(storage.increment('sayay:u1:daily:2026-01-01', 0.01)).resolves.toBe(0.01);
    expect(send).toHaveBeenCalledOnce();
  });
});

describe('handler — financial interceptor', () => {
  const env = {
    BUDGET_TABLE: 'budget-table',
    DAILY_USD: '0.05',
    PER_CALL_MAX_USD: '0.02',
  };

  it('allows a call within budget', async () => {
    const result = await handler(
      { userId: 'u1', estimatedCostUsd: 0.005 },
      env,
      new MemoryStorage(),
    );
    expect(result.action).toBe('allow');
  });

  it('throws TokenBudgetExceededException when over the per-call max', async () => {
    await expect(
      handler({ userId: 'u1', estimatedCostUsd: 0.5 }, env, new MemoryStorage()),
    ).rejects.toThrow(TokenBudgetExceededException);
  });

  it('throw name matches the ASL ErrorEquals matcher', async () => {
    try {
      await handler({ userId: 'u1', estimatedCostUsd: 0.5 }, env, new MemoryStorage());
    } catch (err) {
      expect((err as Error).name).toBe('TokenBudgetExceededException');
    }
  });
});
