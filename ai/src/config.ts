/**
 * Server-side configuration for the AI layer.
 *
 * SECURITY:
 *  - `FEATHERLESS_API_KEY` is read from the environment and lives ONLY on
 *    `AiConfig.apiKey`. It must never be serialized into a response, logged, or
 *    imported by frontend code. Use `toPublicConfig()` for anything that might
 *    be logged or surfaced — it strips the key at the type level.
 *  - Model IDs default to reasonable open models but are fully overridable via
 *    env, so they can be swapped once verified against the team's plan
 *    (`/v1/models?available_on_current_plan=true`).
 */

export interface FeatherlessModels {
  text: string;
  vision: string;
  comparison: string;
}

export interface MatchThresholds {
  /** Minimum blended score to count as a "possible" match (0..1). */
  possible: number;
  /** Minimum blended score to count as a "strong" match (0..1). */
  strong: number;
}

export interface RequestReliabilityConfig {
  timeoutMs: number;
  maxRetries: number;
  /** Base delay for exponential backoff, in ms. */
  retryBaseMs: number;
  /** Upper bound on concurrent provider calls (Featherless is concurrency-limited). */
  maxConcurrency: number;
}

export interface AiConfig {
  baseUrl: string;
  /** SERVER-SIDE SECRET. Never expose, serialize, or log this value. */
  apiKey: string;
  models: FeatherlessModels;
  thresholds: MatchThresholds;
  reliability: RequestReliabilityConfig;
}

/** Same as `AiConfig` but with the secret removed — safe to log or surface. */
export type PublicAiConfig = Omit<AiConfig, 'apiKey'>;

const DEFAULTS = {
  baseUrl: 'https://api.featherless.ai/v1',
  // Text/vision/comparison model IDs are defaults only — verify + override per plan.
  textModel: 'Qwen/Qwen2.5-32B-Instruct',
  visionModel: 'google/gemma-3-27b-it',
  comparisonModel: 'Qwen/Qwen2.5-72B-Instruct',
  possibleThreshold: 0.4,
  strongThreshold: 0.75,
  timeoutMs: 30_000,
  maxRetries: 2,
  retryBaseMs: 500,
  maxConcurrency: 4,
} as const;

function readString(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : fallback;
}

function readNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Build an `AiConfig` from environment variables (defaults applied for anything
 * unset). Does not throw when the API key is missing so the module can be
 * imported and unit-tested without secrets; call `assertApiKey` before making
 * real provider calls.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  return {
    baseUrl: readString(env.FEATHERLESS_BASE_URL, DEFAULTS.baseUrl),
    apiKey: env.FEATHERLESS_API_KEY?.trim() ?? '',
    models: {
      text: readString(env.FEATHERLESS_TEXT_MODEL, DEFAULTS.textModel),
      vision: readString(env.FEATHERLESS_VISION_MODEL, DEFAULTS.visionModel),
      comparison: readString(env.FEATHERLESS_COMPARISON_MODEL, DEFAULTS.comparisonModel),
    },
    thresholds: {
      possible: clamp01(
        readNumber(env.LFC_MATCH_POSSIBLE_THRESHOLD, DEFAULTS.possibleThreshold),
      ),
      strong: clamp01(readNumber(env.LFC_MATCH_STRONG_THRESHOLD, DEFAULTS.strongThreshold)),
    },
    reliability: {
      timeoutMs: readNumber(env.FEATHERLESS_TIMEOUT_MS, DEFAULTS.timeoutMs),
      maxRetries: readNumber(env.FEATHERLESS_MAX_RETRIES, DEFAULTS.maxRetries),
      retryBaseMs: readNumber(env.FEATHERLESS_RETRY_BASE_MS, DEFAULTS.retryBaseMs),
      maxConcurrency: readNumber(env.FEATHERLESS_MAX_CONCURRENCY, DEFAULTS.maxConcurrency),
    },
  };
}

/** True when a non-empty API key is configured. */
export function hasApiKey(config: AiConfig): boolean {
  return config.apiKey.length > 0;
}

/** Throws if no API key is configured. Call before making real provider calls. */
export function assertApiKey(config: AiConfig): void {
  if (!hasApiKey(config)) {
    throw new Error(
      'FEATHERLESS_API_KEY is not set. Provide it via a server-side environment variable/secret.',
    );
  }
}

/** Returns a copy of the config with the secret removed (safe to log/surface). */
export function toPublicConfig(config: AiConfig): PublicAiConfig {
  const { apiKey: _apiKey, ...safe } = config;
  return safe;
}
