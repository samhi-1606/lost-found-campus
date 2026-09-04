import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createFeatherlessClient } from '../src/featherless/client.js';

/**
 * OPTIONAL live smoke test. It is skipped unless BOTH are set:
 *   FEATHERLESS_LIVE_TEST=1   and   FEATHERLESS_API_KEY=<your key>
 *
 * The normal test suite never depends on the network. Run explicitly with:
 *   npm run test:live      (see package.json)
 *
 * This test never prints the API key — only the (non-sensitive) reply content.
 */
const live =
  process.env.FEATHERLESS_LIVE_TEST === '1' && (process.env.FEATHERLESS_API_KEY ?? '') !== '';

(live ? describe : describe.skip)('Featherless live smoke test', () => {
  it(
    'performs a real chat completion',
    async () => {
      const config = loadConfig();
      const client = createFeatherlessClient(config);

      const result = await client.chatCompletion({
        model: config.models.text,
        messages: [
          { role: 'system', content: 'Reply with a single short word.' },
          { role: 'user', content: 'Say pong.' },
        ],
        maxTokens: 5,
        temperature: 0,
      });

      expect(typeof result.content).toBe('string');
      expect(result.content.length).toBeGreaterThan(0);
      // Safe to print: reply content and model id are not secrets. The key is not logged.
      console.log(`[live smoke] model=${result.model} content=${JSON.stringify(result.content)}`);
    },
    30_000,
  );
});
