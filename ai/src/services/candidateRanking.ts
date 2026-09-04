/**
 * Deterministic candidate prefiltering + ranking.
 *
 * PURE + DETERMINISTIC. Given one LOST item and many FOUND candidates, it
 * eliminates obviously-incompatible candidates and ranks the rest so the
 * expensive AI comparison (`compareItems`) only runs on the best few. It makes
 * ZERO Featherless calls, imports no AI client, and never touches Firebase/React.
 *
 * This is NOT a match decision. It only answers "which candidates are worth
 * comparing first?". `calculateMatchDecision` remains the authority on the final
 * match tier after detailed comparison.
 *
 * SECURITY: output is coarse only — no coordinates, exact location, ownership,
 * or verification fields.
 */

import type { ImageAttributes, ItemAttributes, LocationResult } from '../domain/types.js';
import {
  categoryRelation,
  isKnownValue,
  normEqual,
  normalizeToken,
  overlapValues,
  sharedSignificantTokens,
} from '../utils/attributeComparison.js';

/** One item's structured, coarse information (produced by earlier services). */
export interface RankingItem {
  id: string;
  attributes: ItemAttributes;
  image?: ImageAttributes | null;
  location?: LocationResult | null;
  timestamp?: string | null;
}

export interface RankedCandidate {
  candidateId: string;
  /** Bounded 0..1 ranking score (NOT a match probability or decision). */
  score: number;
  reasons: string[];
  contradictions: string[];
  eligible: boolean;
}

export interface RankCandidatesOptions {
  /** Maximum number of ranked candidates to return. Default 10. */
  topK?: number;
}

const DEFAULT_TOP_K = 10;

// Positive weights — distinctive dominates; generic is capped low.
const WEIGHTS = {
  distinctive: 0.5, // saturates at 2 distinctive matches
  medium: 0.2, // saturates at 2 (brand, material)
  generic: 0.12, // saturates at 2 (category, color)
  location: 0.1,
  time: 0.08,
} as const;

// Contradiction penalties (recorded separately from positive reasons).
const PENALTIES = {
  model: 0.5,
  brand: 0.25,
  color: 0.12,
  material: 0.1,
} as const;

const DISTINCTIVE_SATURATION = 2;
const MEDIUM_SATURATION = 2;
const GENERIC_SATURATION = 2;
const DAY_MS = 86_400_000;

interface EffectiveAttributes {
  category: string | null;
  brand: string | null;
  model: string | null;
  colors: string[];
  material: string | null;
  identifiers: string[];
  distinguishing: string[];
  detectedText: string[];
}

/**
 * Rank FOUND candidates for a LOST item. Ineligible candidates (strong category
 * incompatibility) are removed; the rest are sorted by score descending (ties
 * broken by candidateId for determinism) and truncated to `topK`.
 */
export function rankCandidates(
  lost: RankingItem,
  candidates: RankingItem[],
  options: RankCandidatesOptions = {},
): RankedCandidate[] {
  const topK = Math.max(0, options.topK ?? DEFAULT_TOP_K);
  const lostEffective = toEffective(lost);

  const ranked = candidates
    .map((candidate) => scoreCandidate(lostEffective, lost, candidate))
    .filter((result) => result.eligible)
    .sort((a, b) => b.score - a.score || a.candidateId.localeCompare(b.candidateId));

  return ranked.slice(0, topK);
}

function scoreCandidate(
  lost: EffectiveAttributes,
  lostItem: RankingItem,
  candidateItem: RankingItem,
): RankedCandidate {
  const candidate = toEffective(candidateItem);
  const reasons: string[] = [];
  const contradictions: string[] = [];

  // --- Eligibility: only a genuinely strong category incompatibility filters out.
  const catRelation = categoryRelation(lost.category, candidate.category);
  if (catRelation === 'incompatible') {
    return {
      candidateId: candidateItem.id,
      score: 0,
      reasons: [],
      contradictions: ['incompatible category'],
      eligible: false,
    };
  }

  let penalty = 0;

  // --- Distinctive (high value) ---
  let distinctive = 0;
  if (isKnownValue(lost.model) && isKnownValue(candidate.model)) {
    if (normEqual(lost.model, candidate.model)) {
      distinctive += 1;
      reasons.push('same model');
    } else {
      contradictions.push('model differs');
      penalty += PENALTIES.model;
    }
  }
  const sharedIds = overlapValues(lost.identifiers, candidate.identifiers);
  if (sharedIds.length > 0) {
    distinctive += 1;
    reasons.push(`matching identifier: ${sharedIds.join(', ')}`);
  }
  const sharedText = sharedSignificantTokens(lost.detectedText, candidate.detectedText);
  if (sharedText.length > 0) {
    distinctive += 1;
    reasons.push(`matching visible text: ${sharedText.join(', ')}`);
  }
  const sharedFeatures = sharedSignificantTokens(lost.distinguishing, candidate.distinguishing);
  if (sharedFeatures.length > 0) {
    distinctive += 1;
    reasons.push(`matching distinctive feature: ${sharedFeatures.join(', ')}`);
  }

  // --- Medium value ---
  let medium = 0;
  if (isKnownValue(lost.brand) && isKnownValue(candidate.brand)) {
    if (normEqual(lost.brand, candidate.brand)) {
      medium += 1;
      reasons.push('same brand');
    } else {
      contradictions.push('brand differs');
      penalty += PENALTIES.brand;
    }
  }
  if (isKnownValue(lost.material) && isKnownValue(candidate.material)) {
    if (normEqual(lost.material, candidate.material)) {
      medium += 1;
      reasons.push('same material');
    } else {
      contradictions.push('material differs');
      penalty += PENALTIES.material;
    }
  }

  // --- Generic (lower value) ---
  let generic = 0;
  if (catRelation === 'match') {
    generic += 1;
    reasons.push('same category');
  }
  const sharedColors = overlapValues(lost.colors, candidate.colors);
  if (sharedColors.length > 0) {
    generic += 1;
    reasons.push(`shared color: ${sharedColors.join(', ')}`);
  } else if (lost.colors.length > 0 && candidate.colors.length > 0) {
    contradictions.push('color differs');
    penalty += PENALTIES.color;
  }

  // --- Coarse location (supporting only) ---
  const location = locationSignal(lostItem.location ?? null, candidateItem.location ?? null);
  if (location.reason) reasons.push(location.reason);

  // --- Time (supporting only) ---
  const time = timeSignal(lostItem.timestamp ?? null, candidateItem.timestamp ?? null);
  if (time.reason) reasons.push(time.reason);

  const positive =
    WEIGHTS.distinctive * Math.min(1, distinctive / DISTINCTIVE_SATURATION) +
    WEIGHTS.medium * Math.min(1, medium / MEDIUM_SATURATION) +
    WEIGHTS.generic * Math.min(1, generic / GENERIC_SATURATION) +
    WEIGHTS.location * location.score +
    WEIGHTS.time * time.score;

  const score = round2(clamp01(positive - penalty));

  return { candidateId: candidateItem.id, score, reasons, contradictions, eligible: true };
}

function toEffective(item: RankingItem): EffectiveAttributes {
  const attributes = item.attributes;
  const image = item.image ?? null;
  return {
    category: firstKnown(attributes.category, image?.category),
    brand: firstKnown(attributes.brand, image?.brand),
    model: firstKnown(attributes.model, image?.model),
    colors: uniqueNormalized([...(attributes.colors ?? []), ...(image?.colors ?? [])]),
    material: firstKnown(attributes.material, image?.material),
    identifiers: uniqueNormalized(attributes.identifiers ?? []),
    distinguishing: [
      ...(attributes.distinguishingFeatures ?? []),
      ...(image?.distinguishingFeatures ?? []),
    ],
    detectedText: [...(image?.detectedText ?? [])],
  };
}

function locationSignal(
  lost: LocationResult | null,
  candidate: LocationResult | null,
): { score: number; reason?: string } {
  if (!lost || !candidate) return { score: 0 };
  if (
    isKnownValue(lost.landmarkId) &&
    isKnownValue(candidate.landmarkId) &&
    normEqual(lost.landmarkId, candidate.landmarkId)
  ) {
    return { score: 1, reason: 'same coarse campus landmark' };
  }
  if (
    isKnownValue(lost.zone) &&
    isKnownValue(candidate.zone) &&
    normEqual(lost.zone, candidate.zone)
  ) {
    return { score: 0.6, reason: 'same coarse campus zone' };
  }
  return { score: 0 };
}

function timeSignal(
  lostTs: string | null,
  candidateTs: string | null,
): { score: number; reason?: string } {
  if (!lostTs || !candidateTs) return { score: 0 };
  const lost = Date.parse(lostTs);
  const found = Date.parse(candidateTs);
  if (Number.isNaN(lost) || Number.isNaN(found)) return { score: 0 };

  const gapDays = (found - lost) / DAY_MS;
  if (gapDays < -1) {
    // Found reported before the loss: weakly relevant, no positive reason.
    return { score: 0.2 };
  }
  const gap = Math.max(0, gapDays);
  const score = 0.3 + 0.7 * (1 - Math.min(1, gap / 30));
  const reason = gap <= 30 ? 'consistent timing (found around/after the loss)' : undefined;
  return { score, reason };
}

function firstKnown(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (isKnownValue(value)) return value;
  }
  return null;
}

function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const norm = normalizeToken(value);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
