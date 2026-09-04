/**
 * Public API for the Campus Lost & Found AI layer (server-side only).
 *
 * A future Firebase Cloud Function should import from this entry point rather
 * than deep-importing internal files. The primary entry point is
 * `runMatchingPipeline`; the individual services, the Featherless client, the
 * configuration helpers, and the domain contracts/schemas are also exported for
 * flexibility. Internal helpers (prompts, JSON/attribute utilities) are not
 * part of the public surface.
 */

// Configuration (secret-safe helpers).
export * from './config.js';

// Featherless client + provider types/errors (the single network boundary).
export * from './featherless/client.js';
export * from './featherless/types.js';

// Domain contracts and their runtime (Zod) schemas.
export * from './domain/types.js';
export * from './domain/schemas.js';

// Trusted landmark data structure (placeholder dataset).
export * from './data/campusLandmarks.js';

// Individual services.
export * from './services/attributeExtraction.js';
export * from './services/imageUnderstanding.js';
export * from './services/locationNormalization.js';
export * from './services/candidateRanking.js';
export * from './services/itemComparison.js';
export * from './services/matchDecision.js';

// Orchestration entry point.
export * from './services/matchingPipeline.js';
