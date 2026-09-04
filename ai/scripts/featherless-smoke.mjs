/**
 * Safe Featherless connectivity check.
 *
 * Verifies: FEATHERLESS_API_KEY (from the environment) → Featherless → chat
 * completion → response. It NEVER prints the API key — only whether a key is
 * present and the (non-sensitive) assistant reply.
 *
 * Usage (the key comes from your environment/secret, never from source):
 *   npm run smoke                # builds first, then runs this script
 *   # or, after `npm run build`:
 *   node scripts/featherless-smoke.mjs
 *
 * Runs against the compiled output in ../dist, so build before running.
 */
import { loadConfig, hasApiKey } from '../dist/config.js';
import { createFeatherlessClient } from '../dist/featherless/client.js';

const config = loadConfig();

console.log('Featherless connectivity check');
console.log('  API key present:', hasApiKey(config)); // boolean only — never the key value
console.log('  Base URL:', config.baseUrl);
console.log('  Text model:', config.models.text);

if (!hasApiKey(config)) {
  console.error('\nFEATHERLESS_API_KEY is not set. Export it in your shell/secret and retry.');
  process.exit(1);
}

try {
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
  console.log('\nSUCCESS');
  console.log('  Assistant content:', JSON.stringify(result.content));
  console.log('  Model:', result.model, '| finishReason:', result.finishReason);
} catch (err) {
  // Client error messages are secret-safe by design (no key, redacted provider text).
  console.error('\nFAILED:', err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  process.exit(1);
}
