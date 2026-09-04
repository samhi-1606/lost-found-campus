/**
 * Shared domain contracts for the Campus Lost & Found AI layer.
 *
 * Security model encoded in these types:
 *  - Coarse location info (`LocationResult`) is separate from precise location
 *    (`ExactLocation`). AI/matching only ever handles the coarse type.
 *  - `MatchDecision.revealExactLocation` is the literal `false`, so matching can
 *    never assert that the precise location should be shown.
 *  - `VerificationStatus` carries a nominal `source: 'backend'` marker so it can
 *    only be constructed by the trusted backend, never reconstructed from AI JSON.
 *  - Exact location is only ever returned through `LocationResponse` with
 *    `released: true`, produced by the security gate after backend verification.
 */

export type ItemType = 'lost' | 'found';

/**
 * Proposed generic input the AI layer accepts.
 * NOTE: this is an integration contract, not the final Firestore schema. The
 * backend maps its stored documents onto this shape via a thin adapter.
 */
export interface Report {
  id: string;
  type: ItemType;
  description: string;
  imageUrl?: string | null;
  locationDescription?: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

/** Structured attributes extracted from an item's text description (AI, text). */
export interface ItemAttributes {
  category: string;
  brand: string | null;
  /** Model designator/name (e.g. "iPhone 13 Pro"), distinct from brand and serials. */
  model: string | null;
  colors: string[];
  material: string | null;
  /** Serials, engravings, asset tags, stickers, etc. */
  identifiers: string[];
  distinguishingFeatures: string[];
  keywords: string[];
  /** Model self-reported confidence, constrained to 0..1. */
  confidence: number;
}

/** Structured attributes derived from an item's image (AI, vision). */
export interface ImageAttributes {
  hasImage: boolean;
  category: string | null;
  /** Only when a brand is actually visible (logo/label/text); never inferred. */
  brand: string | null;
  /** Only when a model designator is actually visible; never inferred. */
  model: string | null;
  colors: string[];
  material: string | null;
  /** Text actually visible/readable in the image (labels, engravings), if any. */
  detectedText: string[];
  /** Unique visual features observed, including visible damage and accessories. */
  distinguishingFeatures: string[];
  /**
   * Features the user's description mentions but that are NOT visually confirmed
   * in the image. Preserves the observed-vs-claimed distinction; never merged
   * into the observed feature lists.
   */
  mentionedByUserNotVisible: string[];
  /** Confidence in the VISUAL analysis only (0..1) — not ownership/match/identity. */
  confidence: number;
}

export type LocationMatchMethod = 'exact' | 'alias' | 'fuzzy' | 'ai' | 'unmatched';

/**
 * Result of normalizing a natural-language location description.
 *
 * SECURITY: coarse information ONLY. This type intentionally has no latitude /
 * longitude / precise address. It is safe to compute and compare before
 * ownership verification. Precise coordinates live only in `ExactLocation`.
 */
export interface LocationResult {
  /** The original free-text description that was normalized. */
  raw: string;
  landmarkId: string | null;
  landmarkName: string | null;
  /** Coarse area/zone label (e.g. a building or district), never a fine point. */
  zone: string | null;
  confidence: number;
  method: LocationMatchMethod;
}

/** Raw similarity signals produced by the AI item comparison (AI, reasoning). */
export interface AIComparison {
  attributeSimilarity: number;
  matchingFeatures: string[];
  conflictingFeatures: string[];
  /** How plausible the coarse locations are for the same item (0..1). */
  locationPlausibility: number;
  /** How plausible the timestamps are for the same item (0..1). */
  timePlausibility: number;
  /** AI-suggested overall similarity (0..1). Advisory only. */
  rawScore: number;
  /** Human-readable evidence explaining the comparison. */
  reasoning: string;
}

export type MatchTier = 'no_match' | 'possible' | 'strong';

/**
 * Deterministic decision derived from an `AIComparison`.
 *
 * SECURITY: `revealExactLocation` is the literal `false`. Matching — even a
 * "strong" match — can NEVER cause the precise location to be revealed. It only
 * signals whether ownership verification is worth starting.
 */
export interface MatchDecision {
  tier: MatchTier;
  /** Deterministic blended score, 0..1. */
  score: number;
  evidence: string[];
  recommendVerification: boolean;
  revealExactLocation: false;
}

/**
 * Trusted verification result. Supplied ONLY by the backend after it performs
 * server-side authorization and ownership verification.
 *
 * SECURITY: the nominal `source: 'backend'` marker means an object parsed from
 * AI output (which never contains this literal) cannot be used where a
 * `VerificationStatus` is required. AI must never declare ownership.
 */
export interface VerificationStatus {
  readonly verified: boolean;
  /** Backend/authority identifier that performed verification. */
  readonly verifiedBy: string;
  readonly method?: string;
  /** ISO 8601 timestamp of verification. */
  readonly verifiedAt?: string;
  readonly source: 'backend';
}

/**
 * Precise, sensitive location of a found item.
 *
 * SECURITY: this type is produced/stored by the backend and released to a
 * client ONLY inside a `LocationResponse` with `released: true`, after
 * verification. It is deliberately separate from `LocationResult`.
 */
export interface ExactLocation {
  landmarkId: string | null;
  /** Human-readable precise place, e.g. a specific room or locker. */
  label: string;
  latitude: number;
  longitude: number;
  /** Backend reference describing who holds the item. */
  heldBy?: string;
}

/** A safe, public handover point recommendation (never the exact found spot). */
export interface HandoverRecommendation {
  pointId: string;
  name: string;
  reason: string;
  isStaffed: boolean;
}

/**
 * The only channel through which precise location may travel.
 *
 * SECURITY: discriminated on `released`.
 *  - `released: false` → no coordinates; optionally a safe handover suggestion.
 *  - `released: true`  → the `ExactLocation`, produced only after verification.
 */
export type LocationResponse =
  | { released: false; reason: string; handover?: HandoverRecommendation }
  | { released: true; location: ExactLocation; handover?: HandoverRecommendation };
