import { describe, it, expect, vi } from 'vitest';
import { loadConfig, type AiConfig } from '../src/config.js';
import { createFeatherlessClient } from '../src/featherless/client.js';
import {
  FeatherlessAuthError,
  FeatherlessForbiddenError,
  FeatherlessNetworkError,
  FeatherlessRateLimitError,
  FeatherlessResponseError,
  FeatherlessServerError,
  FeatherlessTimeoutError,
  FeatherlessUnavailableError,
  type ChatCompletionParams,
} from '../src/featherless/types.js';

const SECRET = 'super-secret-KEY';

function makeConfig(overrides: Record<string, string> = {}): AiConfig {
  return loadConfig({
    FEATHERLESS_API_KEY: SECRET,
    FEATHERLESS_BASE_URL: 'https://api.featherless.ai/v1',
    FEATHERLESS_MAX_RETRIES: '2',
    FEATHERLESS_RETRY_BASE_MS: '10',
    FEATHERLESS_TIMEOUT_MS: '1000',
    FEATHERLESS_MAX_CONCURRENCY: '4',
    ...overrides,
  });
}

const baseParams: ChatCompletionParams = {
  model: 'Qwen/Qwen2.5-7B-Instruct',
  messages: [{ role: 'user', content: 'hi' }],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const successBody = {
  model: 'Qwen/Qwen2.5-7B-Instruct',
  choices: [{ message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
};

function noopSleep() {
  return vi.fn(async () => {});
}

describe('createFeatherlessClient', () => {
  it('1. performs a successful chat completion and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, successBody));
    const client = createFeatherlessClient(makeConfig(), {
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.chatCompletion(baseParams);

    expect(result.content).toBe('hello');
    expect(result.model).toBe('Qwen/Qwen2.5-7B-Instruct');
    expect(result.finishReason).toBe('stop');
    expect(result.usage).toEqual({ promptTokens: 1, completionTokens: 2, totalTokens: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.featherless.ai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
  });

  it('2. throws FeatherlessAuthError on 401 and does NOT retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: { message: 'bad key' } }));
    const sleep = noopSleep();
    const client = createFeatherlessClient(makeConfig(), {
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    });

    await expect(client.chatCompletion(baseParams)).rejects.toBeInstanceOf(FeatherlessAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('3. throws FeatherlessForbiddenError on 403 and does NOT retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { error: { message: 'no model' } }));
    const client = createFeatherlessClient(makeConfig(), {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: noopSleep(),
    });

    await expect(client.chatCompletion(baseParams)).rejects.toBeInstanceOf(FeatherlessForbiddenError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('4a. retries on 429 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: { message: 'slow down' } }))
      .mockResolvedValueOnce(jsonResponse(200, successBody));
    const sleep = noopSleep();
    const client = createFeatherlessClient(makeConfig(), {
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    });

    const result = await client.chatCompletion(baseParams);
    expect(result.content).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('4b. gives up after maxRetries on persistent 429 (exponential backoff delays)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, { error: { message: 'slow down' } }));
    const sleep = noopSleep();
    const client = createFeatherlessClient(makeConfig(), {
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    });

    await expect(client.chatCompletion(baseParams)).rejects.toBeInstanceOf(FeatherlessRateLimitError);
    // maxRetries=2 → 3 attempts total, 2 backoff sleeps
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20]);
  });

  it('5. retries on 500 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { error: { message: 'boom' } }))
      .mockResolvedValueOnce(jsonResponse(200, successBody));
    const client = createFeatherlessClient(makeConfig(), {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: noopSleep(),
    });

    const result = await client.chatCompletion(baseParams);
    expect(result.content).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('5b. throws FeatherlessServerError after exhausting retries on 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    const client = createFeatherlessClient(makeConfig(), {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: noopSleep(),
    });
    await expect(client.chatCompletion(baseParams)).rejects.toBeInstanceOf(FeatherlessServerError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('6. retries on 503 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: { message: 'capacity' } }))
      .mockResolvedValueOnce(jsonResponse(200, successBody));
    const client = createFeatherlessClient(makeConfig(), {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: noopSleep(),
    });

    const result = await client.chatCompletion(baseParams);
    expect(result.content).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('6b. throws FeatherlessUnavailableError after exhausting retries on 503', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, {}));
    const client = createFeatherlessClient(makeConfig(), {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: noopSleep(),
    });
    await expect(client.chatCompletion(baseParams)).rejects.toBeInstanceOf(FeatherlessUnavailableError);
  });

  it('7 & 12. throws FeatherlessTimeoutError when the request exceeds the timeout', async () => {
    // fetch never resolves; it only rejects when the abort signal fires.
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const client = createFeatherlessClient(makeConfig({ FEATHERLESS_MAX_RETRIES: '0' }), {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: noopSleep(),
    });

    // Per-request timeout override proves the timeout is configurable.
    await expect(
      client.chatCompletion({ ...baseParams, timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(FeatherlessTimeoutError);
  });

  it('8. throws FeatherlessNetworkError on a low-level network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const client = createFeatherlessClient(makeConfig({ FEATHERLESS_MAX_RETRIES: '0' }), {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: noopSleep(),
    });

    await expect(client.chatCompletion(baseParams)).rejects.toBeInstanceOf(FeatherlessNetworkError);
  });

  it('9a. throws FeatherlessResponseError on non-JSON body (no retry)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<<not json>>', { status: 200 }));
    const client = createFeatherlessClient(makeConfig(), {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: noopSleep(),
    });

    await expect(client.chatCompletion(baseParams)).rejects.toBeInstanceOf(FeatherlessResponseError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('9b. throws FeatherlessResponseError when the shape is invalid (missing choices)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { model: 'x' }));
    const client = createFeatherlessClient(makeConfig(), {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: noopSleep(),
    });

    await expect(client.chatCompletion(baseParams)).rejects.toBeInstanceOf(FeatherlessResponseError);
  });

  it('10. never exposes the API key in errors, even if the provider echoes it', async () => {
    // Malicious/edge body that contains the key — must be redacted.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: { message: `invalid key ${SECRET}` } }));
    const client = createFeatherlessClient(makeConfig(), {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: noopSleep(),
    });

    const error = await client.chatCompletion(baseParams).catch((e) => e);
    const serialized = [
      error.message,
      (error as { providerMessage?: string }).providerMessage ?? '',
      error.stack ?? '',
      JSON.stringify({ message: error.message, providerMessage: error.providerMessage }),
    ].join('\n');

    expect(serialized).not.toContain(SECRET);
    expect((error as { providerMessage?: string }).providerMessage).toContain('[REDACTED]');
  });

  it('11. never exceeds the configured maxConcurrency', async () => {
    let active = 0;
    let peak = 0;
    const fetchMock = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active -= 1;
      return jsonResponse(200, successBody);
    });
    const client = createFeatherlessClient(makeConfig({ FEATHERLESS_MAX_CONCURRENCY: '2' }), {
      fetch: fetchMock as unknown as typeof fetch,
    });

    const results = await Promise.all(
      Array.from({ length: 6 }, () => client.chatCompletion(baseParams)),
    );

    expect(results).toHaveLength(6);
    expect(results.every((r) => r.content === 'hello')).toBe(true);
    expect(peak).toBeLessThanOrEqual(2);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('13. passes the configured model and generation params to the provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, successBody));
    const client = createFeatherlessClient(makeConfig(), {
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.chatCompletion({
      model: 'My/Custom-Model',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.2,
      maxTokens: 128,
      topP: 0.9,
      stop: ['STOP'],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('My/Custom-Model');
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(128);
    expect(body.top_p).toBe(0.9);
    expect(body.stop).toEqual(['STOP']);
  });
});
