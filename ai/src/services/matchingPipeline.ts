/**
 * Lost & Found AI matching orchestration.
 *
 * SERVER-ONLY. One clean entry point that coordinates the existing services:
 *   extract attributes → understand image → normalize location  (per report)
 *   → deterministic candidate ranking → top-K → AI comparison → deterministic
 *   match decision → sorted results.
 *
 * It accepts plain domain objects and knows NOTHING about Firebase, Firestore,
 * Auth, Storage, Cloud Functions, React, or HTTP. It reuses the shared
 * Featherless client (via the injected services) and never makes direct network
 * calls. It reuses any already-computed attributes/image/location to avoid
 * duplicate AI calls, and only detail-compares the top-K ranked candidates
 * (never N×M).
 *
 * SECURITY: no coordinates, exact location, ownership, or verification fields
 * are ever produced. `MatchDecision.revealExactLocation` stays false — the
 * pipeline never changes it. The pipeline identifies likely matches and may set
 * `recommendVerification`; it does NOT decide ownership.
 */

import type { AiConfig } from '../config.js';
import type { CampusLandmark } from '../data/campusLandmarks.js';
import type {
  AIComparison,
  ImageAttributes,
  ItemAttributes,
  ItemType,
  LocationResult,
  MatchDecision,
  Report,
} from '../domain/types.js';
import type { FeatherlessClient } from '../featherless/client.js';
import { extractItemAttributes } from './attributeExtraction.js';
import { analyzeItemImage } from './imageUnderstanding.js';
import { normalizeCampusLocation } from './locationNormalization.js';
import { rankCandidates, type RankingItem } from './candidateRanking.js';
import { compareItems, type ComparisonItem } from './itemComparison.js';
import { calculateMatchDecision } from './matchDecision.js';

/** A report plus any results already computed for it (all optional). */
export interface PipelineReport {
  report: Report;
  attributes?: ItemAttributes | null;
  image?: ImageAttributes | null;
  location?: LocationResult | null;
}

/** Injectable service implementations (default to the real ones; mocked in tests). */
export interface PipelineServiceImplementations {
  extractItemAttributes: typeof extractItemAttributes;
  analyzeItemImage: typeof analyzeItemImage;
  normalizeCampusLocation: typeof normalizeCampusLocation;
  rankCandidates: typeof rankCandidates;
  compareItems: typeof compareItems;
  calculateMatchDecision: typeof calculateMatchDecision;
}

export interface PipelineDeps {
  client: FeatherlessClient;
  config: AiConfig;
  landmarks?: CampusLandmark[];
  services?: Partial<PipelineServiceImplementations>;
}

export interface PipelineOptions {
  /** Maximum number of candidates to detail-compare with AI. Default 10. */
  topK?: number;
}

export type PipelineStatus = 'ok' | 'partial' | 'no_candidates' | 'failed';

export interface PipelineWarning {
  stage: 'extraction' | 'image' | 'location' | 'comparison';
  reportId: string;
  message: string;
}

export interface PipelineMatch {
  candidateId: string;
  /** Deterministic decision — includes `revealExactLocation: false`. */
  decision: MatchDecision;
  /** AI evidence, kept separate from the deterministic decision. */
  comparison: AIComparison;
  rankingScore: number;
  rankingReasons: string[];
  rankingContradictions: string[];
}

export interface PipelineResult {
  status: PipelineStatus;
  lostReportId: string;
  matches: PipelineMatch[];
  rankedCandidateCount: number;
  comparedCandidateCount: number;
  warnings: PipelineWarning[];
}

const DEFAULT_TOP_K = 10;

const DEFAULT_SERVICES: PipelineServiceImplementations = {
  extractItemAttributes,
  analyzeItemImage,
  normalizeCampusLocation,
  rankCandidates,
  compareItems,
  calculateMatchDecision,
};

interface PreparedReport {
  id: string;
  type: ItemType;
  attributes: ItemAttributes;
  image: ImageAttributes | null;
  location: LocationResult | null;
  timestamp: string | null;
}

interface PipelineContext {
  config: AiConfig;
  apiKey: string;
  services: PipelineServiceImplementations;
  attributeDeps: { client: FeatherlessClient; config: AiConfig };
  imageDeps: { client: FeatherlessClient; config: AiConfig };
  locationDeps: { client: FeatherlessClient; config: AiConfig; landmarks?: CampusLandmark[] };
  comparisonDeps: { client: FeatherlessClient; config: AiConfig };
}

export async function runMatchingPipeline(
  lost: PipelineReport,
  found: PipelineReport[],
  deps: PipelineDeps,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const ctx = buildContext(deps);
  const topK = Math.max(0, options.topK ?? DEFAULT_TOP_K);
  const warnings: PipelineWarning[] = [];

  // --- Prepare the lost report (required). ---
  const lostPrepared = await prepareReport(lost, ctx);
  warnings.push(...lostPrepared.warnings);
  if (!lostPrepared.prepared) {
    return sortWarnings({
      status: 'failed',
      lostReportId: lost.report.id,
      matches: [],
      rankedCandidateCount: 0,
      comparedCandidateCount: 0,
      warnings,
    });
  }

  // --- Prepare found reports (independent; bounded by the client's concurrency limiter). ---
  const preparedResults = await Promise.all(found.map((item) => prepareReport(item, ctx)));
  const preparedFound: PreparedReport[] = [];
  for (const result of preparedResults) {
    warnings.push(...result.warnings);
    if (result.prepared) preparedFound.push(result.prepared);
  }

  // --- Deterministic candidate ranking BEFORE any expensive comparison. ---
  const ranked = ctx.services.rankCandidates(
    toRankingItem(lostPrepared.prepared),
    preparedFound.map(toRankingItem),
    { topK },
  );

  if (ranked.length === 0) {
    return sortWarnings({
      status: warnings.length > 0 ? 'partial' : 'no_candidates',
      lostReportId: lost.report.id,
      matches: [],
      rankedCandidateCount: 0,
      comparedCandidateCount: 0,
      warnings,
    });
  }

  // --- Detailed AI comparison for the top-K ranked candidates only (strong first). ---
  const preparedById = new Map(preparedFound.map((p) => [p.id, p]));
  const matches: PipelineMatch[] = [];
  let comparedCount = 0;

  for (const candidate of ranked) {
    const prepared = preparedById.get(candidate.candidateId);
    if (!prepared) continue;
    comparedCount += 1;
    try {
      const comparison = await ctx.services.compareItems(
        toComparisonItem(lostPrepared.prepared, 'lost'),
        toComparisonItem(prepared, 'found'),
        ctx.comparisonDeps,
      );
      const decision = ctx.services.calculateMatchDecision(comparison, ctx.config.thresholds);
      matches.push({
        candidateId: candidate.candidateId,
        decision,
        comparison,
        rankingScore: candidate.score,
        rankingReasons: candidate.reasons,
        rankingContradictions: candidate.contradictions,
      });
    } catch (err) {
      warnings.push({
        stage: 'comparison',
        reportId: candidate.candidateId,
        message: sanitize(err, ctx.apiKey),
      });
    }
  }

  matches.sort(
    (a, b) => b.decision.score - a.decision.score || a.candidateId.localeCompare(b.candidateId),
  );

  return sortWarnings({
    status: warnings.length > 0 ? 'partial' : 'ok',
    lostReportId: lost.report.id,
    matches,
    rankedCandidateCount: ranked.length,
    comparedCandidateCount: comparedCount,
    warnings,
  });
}

async function prepareReport(
  input: PipelineReport,
  ctx: PipelineContext,
): Promise<{ prepared: PreparedReport | null; warnings: PipelineWarning[] }> {
  const warnings: PipelineWarning[] = [];
  const base = input.report;

  // Attributes (required). Reuse if already supplied; otherwise extract once.
  let attributes = input.attributes ?? null;
  if (!attributes) {
    try {
      attributes = await ctx.services.extractItemAttributes(base, ctx.attributeDeps);
    } catch (err) {
      warnings.push({ stage: 'extraction', reportId: base.id, message: sanitize(err, ctx.apiKey) });
      return { prepared: null, warnings };
    }
  }

  // Image (optional). Reuse if supplied; else analyze only when an image URL exists.
  let image = input.image ?? null;
  if (!image && isNonEmpty(base.imageUrl)) {
    try {
      image = await ctx.services.analyzeItemImage(base, ctx.imageDeps);
    } catch (err) {
      warnings.push({ stage: 'image', reportId: base.id, message: sanitize(err, ctx.apiKey) });
      image = null; // graceful degradation — never fabricate image attributes
    }
  }

  // Location (optional). Reuse if supplied; else normalize only when a description exists.
  let location = input.location ?? null;
  if (!location && isNonEmpty(base.locationDescription)) {
    try {
      location = await ctx.services.normalizeCampusLocation(base.locationDescription, ctx.locationDeps);
    } catch (err) {
      warnings.push({ stage: 'location', reportId: base.id, message: sanitize(err, ctx.apiKey) });
      location = null; // continue without coarse location
    }
  }

  return {
    prepared: {
      id: base.id,
      type: base.type,
      attributes,
      image,
      location,
      timestamp: base.timestamp ?? null,
    },
    warnings,
  };
}

function buildContext(deps: PipelineDeps): PipelineContext {
  const services = { ...DEFAULT_SERVICES, ...(deps.services ?? {}) };
  const client = deps.client;
  const config = deps.config;
  return {
    config,
    apiKey: config.apiKey,
    services,
    attributeDeps: { client, config },
    imageDeps: { client, config },
    locationDeps: { client, config, landmarks: deps.landmarks },
    comparisonDeps: { client, config },
  };
}

function toRankingItem(prepared: PreparedReport): RankingItem {
  return {
    id: prepared.id,
    attributes: prepared.attributes,
    image: prepared.image,
    location: prepared.location,
    timestamp: prepared.timestamp,
  };
}

function toComparisonItem(prepared: PreparedReport, type: ItemType): ComparisonItem {
  return {
    type,
    attributes: prepared.attributes,
    image: prepared.image,
    location: prepared.location,
    timestamp: prepared.timestamp,
  };
}

function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Build a safe error message: no raw provider secrets; API key redacted if present. */
function sanitize(err: unknown, apiKey: string): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return apiKey && raw.includes(apiKey) ? raw.split(apiKey).join('[REDACTED]') : raw;
}

function sortWarnings(result: PipelineResult): PipelineResult {
  result.warnings.sort(
    (a, b) => a.stage.localeCompare(b.stage) || a.reportId.localeCompare(b.reportId),
  );
  return result;
}
