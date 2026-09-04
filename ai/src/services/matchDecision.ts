/**
 * Deterministic match-decision layer.
 *
 * SERVER-ONLY. Consumes AI-produced `AIComparison` evidence and produces a
 * `MatchDecision`. This layer is PURE and deterministic: it makes NO AI call,
 * so identical inputs always yield identical outputs. The AI has NO authority
 * to decide a match or ownership.
 *
 * SECURITY: `revealExactLocation` is always `false` here — matching, even a
 * strong match, never releases the exact found location. Ownership verification
 * is a later, separate step.
 */

import type { MatchThresholds } from '../config.js';
import type { AIComparison, MatchDecision, MatchTier } from '../domain/types.js';
import { matchDecisionSchema } from '../domain/schemas.js';

/**
 * Scoring weights. Distinctive evidence dominates; generic evidence is capped so
 * that generic-only similarity (same category/color/location) can never reach a
 * strong match. Weights sum to 1.0 at their maxima.
 */
const WEIGHTS = {
  distinctiveMatch: 0.5,
  genericMatch: 0.25,
  aiSemantic: 0.15,
  location: 0.06,
  time: 0.04,
  distinctiveConflictPenalty: 0.6,
  genericConflictPenalty: 0.2,
} as const;

// Two or more distinctive agreements/disagreements are treated as "full weight".
const DISTINCTIVE_SATURATION = 2;
const GENERIC_SATURATION = 4;

export function calculateMatchDecision(
  comparison: AIComparison,
  thresholds: MatchThresholds,
): MatchDecision {
  const normalizedDistinctive = Math.min(
    1,
    comparison.distinctiveMatches.length / DISTINCTIVE_SATURATION,
  );
  const normalizedGeneric = Math.min(1, comparison.matchingFeatures.length / GENERIC_SATURATION);

  const positive =
    WEIGHTS.distinctiveMatch * normalizedDistinctive +
    WEIGHTS.genericMatch * normalizedGeneric +
    WEIGHTS.aiSemantic * clamp01(comparison.attributeSimilarity) +
    WEIGHTS.location * clamp01(comparison.locationPlausibility) +
    WEIGHTS.time * clamp01(comparison.timePlausibility);

  const penalty =
    WEIGHTS.distinctiveConflictPenalty * comparison.distinctiveConflicts.length +
    WEIGHTS.genericConflictPenalty * comparison.conflictingFeatures.length;

  const score = clamp01(positive - penalty);

  let tier: MatchTier;
  if (score >= thresholds.strong) tier = 'strong';
  else if (score >= thresholds.possible) tier = 'possible';
  else tier = 'no_match';

  // Distinctive contradictions cap the tier regardless of the numeric score.
  if (comparison.distinctiveConflicts.length >= 1 && tier === 'strong') {
    tier = 'possible';
  }
  if (comparison.distinctiveConflicts.length >= 2) {
    tier = 'no_match';
  }

  const decision: MatchDecision = {
    tier,
    score: round2(score),
    evidence: buildEvidence(comparison, tier, round2(score)),
    recommendVerification: tier !== 'no_match',
    // SECURITY INVARIANT: matching never releases the exact location.
    revealExactLocation: false,
  };

  // Validate against the canonical schema (strict): guarantees the shape and
  // that revealExactLocation is exactly false; strips any stray fields.
  return matchDecisionSchema.parse(decision) as MatchDecision;
}

function buildEvidence(comparison: AIComparison, tier: MatchTier, score: number): string[] {
  const evidence: string[] = [];
  for (const item of comparison.distinctiveMatches) evidence.push(`distinctive match: ${item}`);
  for (const item of comparison.matchingFeatures) evidence.push(`match: ${item}`);
  for (const item of comparison.distinctiveConflicts) evidence.push(`distinctive conflict: ${item}`);
  for (const item of comparison.conflictingFeatures) evidence.push(`conflict: ${item}`);
  for (const item of comparison.unknownAttributes) evidence.push(`unknown: ${item}`);
  if (comparison.reasoning.trim()) evidence.push(`ai: ${comparison.reasoning.trim()}`);
  evidence.push(`decision: tier=${tier} score=${score.toFixed(2)}`);
  return evidence;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
