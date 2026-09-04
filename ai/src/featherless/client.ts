/**
 * The single network boundary for Featherless.
 *
 * SERVER-ONLY. This module reads the API key from server-side `AiConfig` and
 * sends it in the Authorization header. It must NEVER be imported by frontend
 * code, and the key must never be logged, returned, or placed in error text.
 *
 * All future AI services (extraction, comparison, image understanding, ...) go
 * through `chatCompletion` here so HTTP calls are not scattered across the code.
 */

import { assertApiKey, type AiConfig } from '../config.js';
import {
  chatCompletionResponseSchema,
  FeatherlessAuthError,
  FeatherlessForbiddenError,
  FeatherlessNetworkError,
  FeatherlessRateLimitError,
  FeatherlessRequestError,
  FeatherlessResponseError,
  FeatherlessServerError,
  FeatherlessTimeoutError,
  FeatherlessUnavailableError,
  type ChatCompletionParams,
  type ChatCompletionResult,
  type FeatherlessError,
} from './types.js';

export interface FeatherlessClient {
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>;
}

/** Injectable dependencies — used by unit tests to avoid real network/timers. */
export interface FeatherlessClientDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * A tiny bounded-concurrency gate. `run` waits until a slot is free, runs the
 * task, then hands its slot to the next waiter (or frees it). This guarantees
 * no more than `max` tasks are in flight at once.
 */
class ConcurrencyLimiter {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      // Hand the in-use slot directly to the next waiter (active unchanged).
      next();
    } else {
      this.active -= 1;
    }
  }
}

function redactSecret(text: string, secret: string): string {
  if (secret && text.includes(secret)) {
    return text.split(secret).join('[REDACTED]');
  }
  return text;
}

/**
 * Best-effort extraction of a short provider error message for debugging.
 * Never throws, truncates, and redacts the API key if it ever appears.
 */
async function extractProviderMessage(
  res: Response,
  apiKey: string,
): Promise<string | undefined> {
  try {
    const text = await res.text();
    if (!text) return undefined;
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown };
      if (typeof parsed?.error?.message === 'string') {
        message = parsed.error.message;
      } else if (typeof parsed?.message === 'string') {
        message = parsed.message;
      }
    } catch {
      // Not JSON — keep the raw text.
    }
    message = redactSecret(message, apiKey);
    return message.length > 200 ? `${message.slice(0, 200)}…` : message;
  } catch {
    return undefined;
  }
}

function mapHttpError(status: number, providerMessage: string | undefined): FeatherlessError {
  const opts = { status, providerMessage };
  switch (status) {
    case 401:
      return new FeatherlessAuthError(
        'Featherless authentication failed (401). Check the server-side API key.',
        opts,
      );
    case 403:
      return new FeatherlessForbiddenError(
        'Featherless returned 403 (forbidden, or model not available on this plan).',
        opts,
      );
    case 429:
      return new FeatherlessRateLimitError('Featherless rate limit exceeded (429).', opts);
    case 503:
      return new FeatherlessUnavailableError(
        'Featherless model/capacity unavailable (503).',
        opts,
      );
    default:
      if (status >= 500) {
        return new FeatherlessServerError(`Featherless server error (${status}).`, opts);
      }
      return new FeatherlessRequestError(`Featherless rejected the request (${status}).`, opts);
  }
}

function buildRequestBody(params: ChatCompletionParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
  };
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.maxTokens !== undefined) body.max_tokens = params.maxTokens;
  if (params.topP !== undefined) body.top_p = params.topP;
  if (params.stop !== undefined) body.stop = params.stop;
  return body;
}

export function createFeatherlessClient(
  config: AiConfig,
  deps: FeatherlessClientDeps = {},
): FeatherlessClient {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const limiter = new ConcurrencyLimiter(Math.max(1, config.reliability.maxConcurrency));
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  async function singleAttempt(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    if (typeof fetchImpl !== 'function') {
      throw new FeatherlessNetworkError('No fetch implementation is available in this runtime.');
    }

    const timeoutMs = params.timeoutMs ?? config.reliability.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // SECURITY: the key is used only here, in the request header.
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildRequestBody(params)),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new FeatherlessTimeoutError(
          `Featherless request timed out after ${timeoutMs}ms.`,
          { cause: err },
        );
      }
      throw new FeatherlessNetworkError('Featherless network request failed.', { cause: err });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const providerMessage = await extractProviderMessage(res, config.apiKey);
      throw mapHttpError(res.status, providerMessage);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      throw new FeatherlessResponseError('Featherless returned a non-JSON response.', {
        status: res.status,
        cause: err,
      });
    }

    const parsed = chatCompletionResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new FeatherlessResponseError(
        'Featherless response did not match the expected chat-completion shape.',
      );
    }

    const choice = parsed.data.choices[0];
    const usage = parsed.data.usage;
    return {
      content: choice.message.content,
      model: parsed.data.model ?? params.model,
      finishReason: choice.finish_reason ?? null,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          }
        : undefined,
    };
  }

  async function withRetry(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const maxRetries = Math.max(0, config.reliability.maxRetries);
    let attempt = 0;
    for (;;) {
      try {
        return await singleAttempt(params);
      } catch (err) {
        const retryable = isRetryable(err);
        if (!retryable || attempt >= maxRetries) {
          throw err;
        }
        // Exponential backoff: base, base*2, base*4, ...
        const delay = config.reliability.retryBaseMs * 2 ** attempt;
        await sleep(delay);
        attempt += 1;
      }
    }
  }

  return {
    chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
      // Require a key only when actually making a call (keeps import/test cheap).
      assertApiKey(config);
      return limiter.run(() => withRetry(params));
    },
  };
}

function isRetryable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'retryable' in err &&
    (err as { retryable: unknown }).retryable === true
  );
}
