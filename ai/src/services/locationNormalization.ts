/**
 * Natural-language campus location normalization.
 *
 * SERVER-ONLY. Converts a free-text location description into a coarse,
 * matching-safe `LocationResult` using two stages:
 *   STAGE 1 (AI): interpret messy text into a likely EXISTING landmark name.
 *   STAGE 2 (deterministic): resolve that against the TRUSTED landmark dataset.
 * The trusted dataset is authoritative — the AI can only suggest, never create
 * a landmark. Deterministic matching runs FIRST, so exact/alias/fuzzy hits are
 * resolved without any AI call.
 *
 * SECURITY: this is NOT the location-release mechanism. It never emits exact
 * coordinates, ownership, or verification data. Exact location is handled later
 * by `prepareVerifiedLocationResponse` after server-side verification.
 */

import { z } from 'zod';
import type { AiConfig } from '../config.js';
import type { LocationMatchMethod, LocationResult } from '../domain/types.js';
import { confidenceSchema, locationResultSchema } from '../domain/schemas.js';
import type { FeatherlessClient } from '../featherless/client.js';
import type { ChatMessage } from '../featherless/types.js';
import { CAMPUS_LANDMARKS, type CampusLandmark } from '../data/campusLandmarks.js';
import {
  LOCATION_NORMALIZATION_PROMPT_VERSION,
  LOCATION_NORMALIZATION_STRICT_RETRY_INSTRUCTION,
  LOCATION_NORMALIZATION_SYSTEM_PROMPT,
  buildLocationNormalizationUserPrompt,
} from '../prompts/locationNormalization.js';
import { extractJsonObject } from '../utils/json.js';

/** Thrown when the AI interpretation output cannot be parsed/validated. */
export class LocationNormalizationError extends Error {
  readonly promptVersion: string;

  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'LocationNormalizationError';
    this.promptVersion = LOCATION_NORMALIZATION_PROMPT_VERSION;
  }
}

export interface LocationNormalizationDeps {
  client: FeatherlessClient;
  config: AiConfig;
  /** Trusted landmark dataset; defaults to the (placeholder) CAMPUS_LANDMARKS. */
  landmarks?: CampusLandmark[];
  /** Optional model override; defaults to `config.models.text`. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/** Fuzzy acceptance threshold and the margin required over the runner-up. */
const FUZZY_MIN_SCORE = 0.6;
const FUZZY_MARGIN = 0.2;
const ALIAS_CONFIDENCE = 0.9;
const DEFAULT_MAX_TOKENS = 200;

const locationInterpretationSchema = z.object({
  landmarkName: z.string().nullable().default(null),
  confidence: confidenceSchema,
});

export interface DeterministicMatch {
  landmark: CampusLandmark;
  method: Extract<LocationMatchMethod, 'exact' | 'alias' | 'fuzzy'>;
  score: number;
}

/**
 * Resolve a query against the trusted dataset deterministically (no AI).
 * Priority: exact (id/name) → alias → safe fuzzy. Returns null when nothing
 * resolves OR when the best fuzzy candidate is not clearly better than the
 * runner-up (ambiguous), so similar landmarks never yield a false confident hit.
 */
export function resolveDeterministic(
  query: string,
  landmarks: CampusLandmark[],
): DeterministicMatch | null {
  const q = normalizeText(query);
  if (!q || landmarks.length === 0) return null;

  const exact = landmarks.filter(
    (l) => normalizeText(l.name) === q || normalizeText(l.id) === q,
  );
  if (exact.length === 1) return { landmark: exact[0], method: 'exact', score: 1 };
  if (exact.length > 1) return null;

  const alias = landmarks.filter((l) => l.aliases.some((a) => normalizeText(a) === q));
  if (alias.length === 1) return { landmark: alias[0], method: 'alias', score: ALIAS_CONFIDENCE };
  if (alias.length > 1) return null;

  const scored = landmarks
    .map((l) => ({
      landmark: l,
      score: Math.max(
        diceCoefficient(q, normalizeText(l.name)),
        ...l.aliases.map((a) => diceCoefficient(q, normalizeText(a))),
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const runnerUp = scored[1];
  if (best.score >= FUZZY_MIN_SCORE && (!runnerUp || best.score - runnerUp.score >= FUZZY_MARGIN)) {
    return { landmark: best.landmark, method: 'fuzzy', score: round2(best.score) };
  }
  return null;
}

/**
 * Normalize a free-text location description into a coarse `LocationResult`.
 * Deterministic-first (no AI when exact/alias/fuzzy already resolves); otherwise
 * one AI interpretation (with a single stricter retry on invalid output) whose
 * suggestion is re-resolved against the trusted dataset.
 */
export async function normalizeCampusLocation(
  locationDescription: string,
  deps: LocationNormalizationDeps,
): Promise<LocationResult> {
  const raw = locationDescription ?? '';
  const landmarks = deps.landmarks ?? CAMPUS_LANDMARKS;
  const trimmed = raw.trim();

  if (!trimmed) {
    return finalize(raw, null, 'unmatched', 0);
  }

  // STAGE 2 first on the raw text — avoids an AI call when we can resolve directly.
  const direct = resolveDeterministic(trimmed, landmarks);
  if (direct) {
    return finalize(raw, direct.landmark, direct.method, direct.score);
  }

  // STAGE 1: AI interpretation (provider/network errors propagate as typed errors).
  const interpretation = await interpretWithAI(trimmed, deps, landmarks);

  if (interpretation.landmarkName && interpretation.landmarkName.trim()) {
    const resolved = resolveDeterministic(interpretation.landmarkName, landmarks);
    if (resolved) {
      const confidence = clamp01(round2(interpretation.confidence * resolved.score));
      return finalize(raw, resolved.landmark, 'ai', confidence);
    }
  }

  // Ambiguous or not present in the trusted dataset → unresolved.
  return finalize(raw, null, 'unmatched', 0);
}

async function interpretWithAI(
  description: string,
  deps: LocationNormalizationDeps,
  landmarks: CampusLandmark[],
): Promise<z.infer<typeof locationInterpretationSchema>> {
  const model = deps.model ?? deps.config.models.text;
  const temperature = deps.temperature ?? 0;
  const maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;

  const messages: ChatMessage[] = [
    { role: 'system', content: LOCATION_NORMALIZATION_SYSTEM_PROMPT },
    { role: 'user', content: buildLocationNormalizationUserPrompt(description, landmarks) },
  ];

  const maxAttempts = 2; // initial + one stricter retry
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await deps.client.chatCompletion({ model, messages, temperature, maxTokens });
    const json = extractJsonObject(result.content);
    if (json !== undefined) {
      const parsed = locationInterpretationSchema.safeParse(json);
      if (parsed.success) return parsed.data;
    }
    if (attempt === 0) {
      messages.push({ role: 'user', content: LOCATION_NORMALIZATION_STRICT_RETRY_INSTRUCTION });
    }
  }

  throw new LocationNormalizationError(
    'AI location interpretation returned invalid output after a stricter retry.',
  );
}

function finalize(
  raw: string,
  landmark: CampusLandmark | null,
  method: LocationMatchMethod,
  confidence: number,
): LocationResult {
  const result: LocationResult = {
    raw,
    landmarkId: landmark?.id ?? null,
    landmarkName: landmark?.name ?? null,
    zone: landmark?.zone ?? null,
    confidence: clamp01(confidence),
    method,
  };
  // Guarantee shape + bounds against the canonical schema (also strips any stray keys).
  return locationResultSchema.parse(result) as LocationResult;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Sørensen–Dice similarity over character bigrams (0..1). */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return a.length === 0 ? 0 : 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const bigram = a.slice(i, i + 2);
    bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const bigram = b.slice(i, i + 2);
    const count = bigrams.get(bigram) ?? 0;
    if (count > 0) {
      bigrams.set(bigram, count - 1);
      intersection += 1;
    }
  }

  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}
