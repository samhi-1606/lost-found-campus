/**
 * Runtime validation schemas for AI-GENERATED structures.
 *
 * These guard the boundary where untrusted model output enters the system.
 * Everything a Featherless model produces must be parsed through one of these
 * schemas before it is trusted.
 *
 * DELIBERATELY ABSENT: there is NO schema for `VerificationStatus`,
 * `ExactLocation`, or `LocationResponse`. Those are trusted/security types
 * owned by the backend. Providing an AI-facing parser for them would let a
 * model's JSON masquerade as an ownership decision or leak precise location —
 * exactly what the security model forbids. They must be constructed in code,
 * not parsed from AI text.
 */

import { z } from 'zod';

/** A probability/confidence value. Rejects anything outside 0..1 (and NaN). */
export const confidenceSchema = z.number().min(0).max(1);

export const itemAttributesSchema = z.object({
  category: z.string().min(1),
  brand: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  colors: z.array(z.string()).default([]),
  material: z.string().nullable().default(null),
  identifiers: z.array(z.string()).default([]),
  distinguishingFeatures: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  confidence: confidenceSchema,
});

export const imageAttributesSchema = z.object({
  hasImage: z.boolean(),
  category: z.string().nullable().default(null),
  brand: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  colors: z.array(z.string()).default([]),
  material: z.string().nullable().default(null),
  detectedText: z.array(z.string()).default([]),
  distinguishingFeatures: z.array(z.string()).default([]),
  mentionedByUserNotVisible: z.array(z.string()).default([]),
  confidence: confidenceSchema,
});

export const locationMatchMethodSchema = z.enum([
  'exact',
  'alias',
  'fuzzy',
  'ai',
  'unmatched',
]);

export const locationResultSchema = z.object({
  raw: z.string(),
  landmarkId: z.string().nullable().default(null),
  landmarkName: z.string().nullable().default(null),
  zone: z.string().nullable().default(null),
  confidence: confidenceSchema,
  method: locationMatchMethodSchema,
});

export const aiComparisonSchema = z.object({
  attributeSimilarity: confidenceSchema,
  matchingFeatures: z.array(z.string()).default([]),
  conflictingFeatures: z.array(z.string()).default([]),
  locationPlausibility: confidenceSchema,
  timePlausibility: confidenceSchema,
  rawScore: confidenceSchema,
  reasoning: z.string().default(''),
});

export const matchTierSchema = z.enum(['no_match', 'possible', 'strong']);

/**
 * Validates a deterministic match decision.
 *
 * SECURITY: `.strict()` rejects any unexpected key (e.g. a smuggled `location`
 * or `coordinates`), and `revealExactLocation` must be the literal `false`.
 * A payload attempting `revealExactLocation: true` is rejected.
 */
export const matchDecisionSchema = z
  .object({
    tier: matchTierSchema,
    score: confidenceSchema,
    evidence: z.array(z.string()),
    recommendVerification: z.boolean(),
    revealExactLocation: z.literal(false),
  })
  .strict();

/** Inferred types for the validated AI-generated structures. */
export type ItemAttributesInput = z.infer<typeof itemAttributesSchema>;
export type ImageAttributesInput = z.infer<typeof imageAttributesSchema>;
export type LocationResultInput = z.infer<typeof locationResultSchema>;
export type AIComparisonInput = z.infer<typeof aiComparisonSchema>;
export type MatchDecisionInput = z.infer<typeof matchDecisionSchema>;
