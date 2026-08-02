import { describe, it, expect } from 'vitest';
import { TIERS, classifyComplexity, type RouteEvent } from '../src/handler.js';

describe('classifyComplexity', () => {
  it('uses the explicit tier when provided', () => {
    const event: RouteEvent = { messages: [], tier: 'reasoning' };
    expect(classifyComplexity(event)).toBe('reasoning');
  });

  it('defaults to economy for simple prompts', () => {
    const event: RouteEvent = { messages: [{ role: 'user', content: 'what is 2+2?' }] };
    expect(classifyComplexity(event)).toBe('economy');
  });

  it('escalates to reasoning on hallucination/escalation signals', () => {
    const event: RouteEvent = {
      messages: [{ role: 'user', content: 'the validator flagged a hallucination, escalate' }],
    };
    expect(classifyComplexity(event)).toBe('reasoning');
  });
});

describe('TIERS', () => {
  it('maps economy → Llama 3.1 8B and reasoning → Claude 3 Sonnet', () => {
    expect(TIERS.economy).toBe('meta.llama3-1-8b-instruct');
    expect(TIERS.reasoning).toBe('anthropic.claude-3-sonnet');
  });
});
