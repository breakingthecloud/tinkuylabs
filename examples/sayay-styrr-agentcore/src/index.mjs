// Run: OPENROUTER_API_KEY=sk-... npx tsx src/index.mjs "your prompt"
import { handler } from './handler.js';

const prompt = process.argv[2] ?? 'Explain FinOps in one sentence.';

try {
  const result = await handler(
    { prompt, userId: 'demo-user' },
    { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? '' },
  );
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(`[sayay-styrr-agentcore] Blocked: ${err?.message}`);
  process.exit(1);
}
