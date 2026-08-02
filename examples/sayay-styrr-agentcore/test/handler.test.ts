import { describe, it, expect, vi } from 'vitest';
import { handler, estimateCostUsd, costTier, extractText } from '../src/handler.js';
import { MemoryStorage, TokenBudgetExceededException } from '@carloscortezcloud/sayay-guard';

const stubRunner = (completion = 'Hello from stub', model = 'anthropic.claude-3-sonnet-20240229-v1:0', tokens = 42) =>
  vi.fn(async () => ({ completion, model, tokens }));

describe('estimateCostUsd', () => {
  it('estimates cost from tokens at $3/M', () => {
    expect(estimateCostUsd(1_000_000)).toBe(3);
    expect(estimateCostUsd(500_000)).toBe(1.5);
    expect(estimateCostUsd(0)).toBe(0);
  });
});

describe('costTier', () => {
  it('classifies by model id', () => {
    expect(costTier('anthropic.claude-3-sonnet-20240229-v1:0')).toBe('bedrock');
    expect(costTier('meta-llama/llama-3.3-70b-instruct:free')).toBe('free');
    expect(costTier('openai/o1')).toBe('external');
  });
});

describe('extractText', () => {
  it('joins textBlock content', () => {
    const blocks = [
      { type: 'textBlock', text: 'Hello' },
      { type: 'toolUseBlock' },
      { type: 'textBlock', text: ' world' },
    ];
    expect(extractText(blocks)).toBe('Hello\n world');
  });

  it('returns empty string for no text blocks', () => {
    expect(extractText([])).toBe('');
  });
});

describe('handler — Strands agent with Sayay + Styrr', () => {
  const env = { BUDGET_TABLE: 'budget-table', DAILY_USD: '0.05' };

  it('allows within budget (returns agentcore-shaped result)', async () => {
    const runner = stubRunner();
    const result = await handler(
      { prompt: 'Hello', userId: 'u1' },
      env,
      new MemoryStorage(),
      runner,
    );
    expect(result.budgetAction).toBe('allow');
    expect(result.tokens).toBe(42);
    expect(result.costTier).toBe('bedrock');
    expect(result.completion).toBe('Hello from stub');
    expect(runner).toHaveBeenCalledWith('Hello', env);
  });

  it('throws TokenBudgetExceededException when blocked (before runner runs)', async () => {
    const storage = new MemoryStorage();
    const guard = (await import('@carloscortezcloud/sayay-guard')).SayayGuard;
    const preGuard = new guard({ storage, budget: { dailyUsd: 0.05 } });
    await preGuard.record('u1', 0.05);

    const runner = stubRunner();
    await expect(
      handler({ prompt: 'Hello', userId: 'u1' }, env, storage, runner),
    ).rejects.toThrow(TokenBudgetExceededException);
    // Budget gate fired first — the strand never ran
    expect(runner).not.toHaveBeenCalled();
  });

  it('records usage to the ledger after the strand completes', async () => {
    const storage = new MemoryStorage();
    await handler({ prompt: 'Hello', userId: 'u1' }, env, storage, stubRunner(undefined, undefined, 1_000_000));

    const guard = (await import('@carloscortezcloud/sayay-guard')).SayayGuard;
    const check = new guard({ storage, budget: { dailyUsd: 0.05 } });
    const usage = await check.getUsage('u1');
    expect(usage.daily).toBeCloseTo(3, 5); // 1M tokens @ $3/M
  });
});
