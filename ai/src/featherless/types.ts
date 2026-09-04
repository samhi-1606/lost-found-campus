/**
 * Types and typed errors for the Featherless provider boundary.
 *
 * SERVER-ONLY: these describe how we talk to Featherless. Nothing here should be
 * imported by frontend code.
 *
 * The message/content shapes intentionally mirror the OpenAI-compatible schema
 * so the client can support text today and multimodal (image_url) content later
 * without changing its network code.
 */

import { z } from 'zod';

/** A plain text content part. */
export interface TextContentPart {
  type: 'text';
  text: string;
}

/**
 * An image content part (for future multimodal use). `url` may be an https URL
 * or a data: URL (base64). Not used by any service yet — the client just needs
 * to be able to carry it.
 */
export interface ImageContentPart {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export type ContentPart = TextContentPart | ImageContentPart;

/** A single chat message. `content` is either a plain string or content parts. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

/** Client-facing parameters for a chat completion request. */
export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /** Maps to the provider's `max_tokens`. */
  maxTokens?: number;
  /** Maps to the provider's `top_p`. */
  topP?: number;
  stop?: string | string[];
  /** Per-request timeout override (ms). Falls back to the configured timeout. */
  timeoutMs?: number;
}

/** The minimal, sanitized result we expose to callers. */
export interface ChatCompletionResult {
  content: string;
  model: string;
  finishReason: string | null;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Minimal schema for the parts of the chat-completion response we rely on.
 * The client validates against this before trusting/extracting content, rather
 * than assuming the provider returned a well-formed body.
 */
export const chatCompletionResponseSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          role: z.string().optional(),
          content: z.string(),
        }),
        finish_reason: z.string().nullish(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

export interface FeatherlessErrorOptions {
  status?: number;
  /** A short, secret-redacted message extracted from the provider response. */
  providerMessage?: string;
  cause?: unknown;
}

/**
 * Base class for all Featherless client errors.
 *
 * SECURITY: error messages are constructed by us and never include the API key.
 * `retryable` tells the retry logic whether an error is worth retrying.
 */
export abstract class FeatherlessError extends Error {
  abstract readonly retryable: boolean;
  readonly status?: number;
  readonly providerMessage?: string;

  constructor(message: string, options: FeatherlessErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.status = options.status;
    this.providerMessage = options.providerMessage;
  }
}

/** HTTP 401 — bad/missing API key. Not retryable. */
export class FeatherlessAuthError extends FeatherlessError {
  readonly retryable = false;
}

/** HTTP 403 — forbidden or model not available on the plan. Not retryable. */
export class FeatherlessForbiddenError extends FeatherlessError {
  readonly retryable = false;
}

/** HTTP 429 — rate limited. Retryable with backoff. */
export class FeatherlessRateLimitError extends FeatherlessError {
  readonly retryable = true;
}

/** HTTP 500 (and other >=500 except 503) — provider failure. Retryable. */
export class FeatherlessServerError extends FeatherlessError {
  readonly retryable = true;
}

/** HTTP 503 — model/capacity unavailable. Retryable. */
export class FeatherlessUnavailableError extends FeatherlessError {
  readonly retryable = true;
}

/** Other 4xx — malformed/invalid request. Not retryable. */
export class FeatherlessRequestError extends FeatherlessError {
  readonly retryable = false;
}

/** Request exceeded the configured timeout. Retryable. */
export class FeatherlessTimeoutError extends FeatherlessError {
  readonly retryable = true;
}

/** Low-level network failure (DNS/connection reset/etc). Retryable. */
export class FeatherlessNetworkError extends FeatherlessError {
  readonly retryable = true;
}

/** Provider returned a body we could not parse/validate. Not retryable. */
export class FeatherlessResponseError extends FeatherlessError {
  readonly retryable = false;
}
