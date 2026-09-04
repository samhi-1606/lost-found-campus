import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadConfig, type AiConfig } from '../src/config.js';
import type { FeatherlessClient } from '../src/featherless/client.js';
import type {
  AIComparison,
  ImageAttributes,
  ItemAttributes,
  LocationResult,
  Report,
} from '../src/domain/types.js';
import { calculateMatchDecision } from '../src/services/matchDecision.js';
import type { RankedCandidate, RankingItem } from '../src/services/candidateRanking.js';
import {
  runMatchingPipeline,
  type PipelineDeps,
  type PipelineReport,
  type PipelineServiceImplementations,
} from '../src/services/matchingPipeline.js';

const SECRET = 'super-secret-KEY';
const config: AiConfig = loadConfig({ FEATHERLESS_API_KEY: SECRET });

function makeAttributes(overrides: Partial<ItemAttributes> = {}): ItemAttributes {
  return {
    category: 'electronics',
    brand: null,
    model: null,
    colors: [],
    material: null,
    identifiers: [],
    distinguishingFeatures: [],
    keywords: [],
    confidence: 0.8,
    ...overrides,
  };
}

function makeImage(overrides: Partial<ImageAttributes> = {}): ImageAttributes {
  return {
    hasImage: true,
    category: null,
    brand: null,
    model: null,
    colors: [],
    material: null,
    detectedText: [],
    distinguishingFeatures: [],
    mentionedByUserNotVisible: [],
    confidence: 0.8,
    ...overrides,
  };
}

function makeLocation(overrides: Partial<LocationResult> = {}): LocationResult {
  return {
    raw: 'library',
    landmarkId: 'library',
    landmarkName: 'Library',
    zone: 'Academic Zone',
    confidence: 1,
    method: 'exact',
    ...overrides,
  };
}

function makeComparison(overrides: Partial<AIComparison> = {}): AIComparison {
  return {
    attributeSimilarity: 0.5,
    matchingFeatures: [],
    conflictingFeatures: [],
    unknownAttributes: [],
    distinctiveMatches: [],
    distinctiveConflicts: [],
    locationPlausibility: 0.5,
    timePlausibility: 0.5,
    rawScore: 0.5,
    reasoning: '',
    ...overrides,
  };
}

function report(id: string, overrides: Partial<Report> = {}): Report {
  return { id, type: 'lost', description: `desc-${id}`, ...overrides };
}

function pReport(id: string, reportOverrides: Partial<Report> = {}, extra: Partial<PipelineReport> = {}): PipelineReport {
  return { report: report(id, reportOverrides), ...extra };
}

const fakeClient: FeatherlessClient = { chatCompletion: vi.fn() };

/** Build deps with fully-mocked services (real deterministic matchDecision by default). */
function makeDeps(overrides: Partial<PipelineServiceImplementations> = {}): PipelineDeps {
  const services: PipelineServiceImplementations = {
    extractItemAttributes: vi.fn(async () => makeAttributes()),
    analyzeItemImage: vi.fn(async () => makeImage()),
    normalizeCampusLocation: vi.fn(async () => makeLocation()),
    rankCandidates: vi.fn((_lost: RankingItem, found: RankingItem[], opts?: { topK?: number }) =>
      found
        .slice(0, opts?.topK ?? 10)
        .map((f, i): RankedCandidate => ({
          candidateId: f.id,
          score: 1 - i * 0.1,
          reasons: ['same category'],
          contradictions: [],
          eligible: true,
        })),
    ),
    compareItems: vi.fn(async () => makeComparison()),
    calculateMatchDecision,
    ...overrides,
  };
  return { client: fakeClient, config, services };
}

const svc = (deps: PipelineDeps, name: keyof PipelineServiceImplementations) =>
  deps.services![name] as unknown as ReturnType<typeof vi.fn>;

describe('runMatchingPipeline', () => {
  it('1. completes a lost + found pipeline successfully', async () => {
    const deps = makeDeps({
      compareItems: vi.fn(async (_lost, found) =>
        found.attributes.model === 'STRONG'
          ? makeComparison({ distinctiveMatches: ['a', 'b'], attributeSimilarity: 0.9 })
          : makeComparison({ matchingFeatures: ['color'] }),
      ),
    });
    const lost = pReport('lost', {}, { attributes: makeAttributes({ model: 'STRONG' }) });
    const found = [
      pReport('f1', {}, { attributes: makeAttributes({ model: 'STRONG' }) }),
      pReport('f2', {}, { attributes: makeAttributes({ model: 'WEAK' }) }),
    ];
    const result = await runMatchingPipeline(lost, found, deps);
    expect(result.status).toBe('ok');
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].candidateId).toBe('f1');
    expect(result.matches[0].decision.score).toBeGreaterThanOrEqual(result.matches[1].decision.score);
  });

  it('2. calls attribute extraction when attributes are missing', async () => {
    const deps = makeDeps();
    await runMatchingPipeline(pReport('lost'), [pReport('f1'), pReport('f2')], deps);
    expect(svc(deps, 'extractItemAttributes')).toHaveBeenCalledTimes(3); // lost + 2 found
  });

  it('3. reuses supplied attributes and does not re-extract', async () => {
    const deps = makeDeps();
    const attrs = makeAttributes();
    await runMatchingPipeline(
      pReport('lost', {}, { attributes: attrs }),
      [pReport('f1', {}, { attributes: attrs })],
      deps,
    );
    expect(svc(deps, 'extractItemAttributes')).not.toHaveBeenCalled();
  });

  it('4/5/6. image understanding runs only when an image URL exists, is reused if supplied, and missing image is fine', async () => {
    const deps = makeDeps();
    await runMatchingPipeline(
      pReport('lost', { imageUrl: 'https://x/img.jpg' }), // needs analysis
      [
        pReport('f1'), // no image url -> no analysis
        pReport('f2', { imageUrl: 'https://x/2.jpg' }, { image: makeImage() }), // supplied -> reused
      ],
      deps,
    );
    expect(svc(deps, 'analyzeItemImage')).toHaveBeenCalledTimes(1); // only the lost report
  });

  it('7/8. location normalization runs when a description exists and is reused when supplied', async () => {
    const deps = makeDeps();
    await runMatchingPipeline(
      pReport('lost', { locationDescription: 'near the library' }),
      [
        pReport('f1'), // no description -> no call
        pReport('f2', { locationDescription: 'canteen' }, { location: makeLocation() }), // supplied -> reused
      ],
      deps,
    );
    expect(svc(deps, 'normalizeCampusLocation')).toHaveBeenCalledTimes(1); // only the lost report
  });

  it('9/28. candidate ranking runs before any detailed comparison', async () => {
    const deps = makeDeps();
    await runMatchingPipeline(pReport('lost'), [pReport('f1')], deps);
    const rankOrder = svc(deps, 'rankCandidates').mock.invocationCallOrder[0];
    const compareOrder = svc(deps, 'compareItems').mock.invocationCallOrder[0];
    expect(rankOrder).toBeLessThan(compareOrder);
  });

  it('10/11. compareItems runs only for top-K ranked candidates, not filtered-out ones', async () => {
    const deps = makeDeps({
      // Only f1 and f3 survive ranking.
      rankCandidates: vi.fn(
        (): RankedCandidate[] => [
          { candidateId: 'f1', score: 0.9, reasons: [], contradictions: [], eligible: true },
          { candidateId: 'f3', score: 0.5, reasons: [], contradictions: [], eligible: true },
        ],
      ),
    });
    await runMatchingPipeline(
      pReport('lost'),
      [pReport('f1'), pReport('f2'), pReport('f3'), pReport('f4')],
      deps,
    );
    expect(svc(deps, 'compareItems')).toHaveBeenCalledTimes(2);
  });

  it('12. calculateMatchDecision receives the AI comparison evidence', async () => {
    const comparison = makeComparison({ distinctiveMatches: ['x'] });
    const decide = vi.fn(calculateMatchDecision);
    const deps = makeDeps({
      compareItems: vi.fn(async () => comparison),
      calculateMatchDecision: decide,
    });
    await runMatchingPipeline(pReport('lost'), [pReport('f1')], deps);
    expect(decide).toHaveBeenCalledWith(comparison, config.thresholds);
  });

  it('13/14. results are sorted by decision score (candidateId tie-breaker)', async () => {
    // Both candidates get identical comparisons => identical scores => tie broken by id.
    const deps = makeDeps({
      rankCandidates: vi.fn(
        (): RankedCandidate[] => [
          { candidateId: 'b', score: 0.9, reasons: [], contradictions: [], eligible: true },
          { candidateId: 'a', score: 0.8, reasons: [], contradictions: [], eligible: true },
        ],
      ),
      compareItems: vi.fn(async () => makeComparison({ matchingFeatures: ['color'] })),
    });
    const result = await runMatchingPipeline(pReport('lost'), [pReport('a'), pReport('b')], deps);
    expect(result.matches.map((m) => m.candidateId)).toEqual(['a', 'b']);
  });

  it('15. topK is forwarded to ranking and bounds comparisons', async () => {
    const deps = makeDeps();
    const result = await runMatchingPipeline(
      pReport('lost'),
      [pReport('f1'), pReport('f2'), pReport('f3'), pReport('f4')],
      deps,
      { topK: 2 },
    );
    expect(svc(deps, 'rankCandidates')).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { topK: 2 },
    );
    expect(result.comparedCandidateCount).toBeLessThanOrEqual(2);
  });

  it('16. zero candidates produces a valid empty result', async () => {
    const result = await runMatchingPipeline(pReport('lost'), [], makeDeps());
    expect(result.status).toBe('no_candidates');
    expect(result.matches).toEqual([]);
  });

  it('17. one candidate comparison failure does not block independent candidates', async () => {
    const deps = makeDeps({
      compareItems: vi.fn(async (_lost, found) => {
        if (found.attributes.model === 'BAD') throw new Error('comparison failed');
        return makeComparison({ matchingFeatures: ['color'] });
      }),
    });
    const result = await runMatchingPipeline(
      pReport('lost'),
      [
        pReport('bad', {}, { attributes: makeAttributes({ model: 'BAD' }) }),
        pReport('good', {}, { attributes: makeAttributes({ model: 'OK' }) }),
      ],
      deps,
    );
    expect(result.status).toBe('partial');
    expect(result.matches.map((m) => m.candidateId)).toEqual(['good']);
    expect(result.warnings.some((w) => w.stage === 'comparison' && w.reportId === 'bad')).toBe(true);
  });

  it('18. an AI comparison failure is not converted into a fabricated no-match', async () => {
    const deps = makeDeps({
      compareItems: vi.fn(async () => {
        throw new Error('provider down');
      }),
    });
    const result = await runMatchingPipeline(pReport('lost'), [pReport('f1')], deps);
    expect(result.matches).toEqual([]);
    expect(result.status).toBe('partial');
    expect(result.warnings.some((w) => w.stage === 'comparison')).toBe(true);
  });

  it('19/30. runs with only minimal text attributes (no image/location)', async () => {
    const deps = makeDeps();
    const result = await runMatchingPipeline(
      pReport('lost', {}, { attributes: makeAttributes() }),
      [pReport('f1', {}, { attributes: makeAttributes() })],
      deps,
    );
    expect(result.matches).toHaveLength(1);
    expect(svc(deps, 'analyzeItemImage')).not.toHaveBeenCalled();
    expect(svc(deps, 'normalizeCampusLocation')).not.toHaveBeenCalled();
  });

  it('20/21/22/35. no coordinates/ownership/verification; revealExactLocation always false', async () => {
    const deps = makeDeps({
      compareItems: vi.fn(async () => makeComparison({ distinctiveMatches: ['a', 'b'], attributeSimilarity: 0.95 })),
    });
    const result = await runMatchingPipeline(pReport('lost'), [pReport('f1')], deps);
    const serialized = JSON.stringify(result);
    for (const forbidden of ['latitude', 'longitude', 'coordinates', 'owner', 'verified:true', '"verified"']) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(result.matches.every((m) => m.decision.revealExactLocation === false)).toBe(true);
  });

  it('23/24/25. the pipeline source imports no Firebase/React and makes no direct HTTP call', async () => {
    const source = readFileSync(new URL('../src/services/matchingPipeline.ts', import.meta.url), 'utf8');
    const importLines = source.split('\n').filter((l) => l.trim().startsWith('import'));
    for (const line of importLines) {
      expect(line.toLowerCase()).not.toContain('firebase');
      expect(line.toLowerCase()).not.toContain('react');
    }
    expect(source).not.toContain('fetch(');

    // The pipeline talks to services, never the raw client, so chatCompletion is untouched.
    const deps = makeDeps();
    await runMatchingPipeline(pReport('lost'), [pReport('f1')], deps);
    expect(fakeClient.chatCompletion).not.toHaveBeenCalled();
  });

  it('26. never leaks the API key in warnings/result even if an error contains it', async () => {
    const deps = makeDeps({
      compareItems: vi.fn(async () => {
        throw new Error(`upstream failure using ${SECRET}`);
      }),
    });
    const result = await runMatchingPipeline(pReport('lost'), [pReport('f1')], deps);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SECRET);
    expect(result.warnings[0].message).toContain('[REDACTED]');
  });

  it('27. identical mocked inputs produce identical results', async () => {
    const build = () =>
      makeDeps({ compareItems: vi.fn(async () => makeComparison({ distinctiveMatches: ['a'] })) });
    const lost = pReport('lost');
    const found = [pReport('f1'), pReport('f2')];
    const a = await runMatchingPipeline(lost, found, build());
    const b = await runMatchingPipeline(lost, found, build());
    expect(a).toEqual(b);
  });

  it('29. a stronger ranked candidate is compared before a weaker one', async () => {
    const deps = makeDeps({
      rankCandidates: vi.fn(
        (_lost: RankingItem, _found: RankingItem[]): RankedCandidate[] => [
          { candidateId: 'strong', score: 0.9, reasons: [], contradictions: [], eligible: true },
          { candidateId: 'weak', score: 0.3, reasons: [], contradictions: [], eligible: true },
        ],
      ),
      compareItems: vi.fn(async () => makeComparison()),
    });
    await runMatchingPipeline(
      pReport('lost'),
      [
        pReport('strong', {}, { attributes: makeAttributes({ model: 'STRONG' }) }),
        pReport('weak', {}, { attributes: makeAttributes({ model: 'WEAK' }) }),
      ],
      deps,
    );
    const calls = svc(deps, 'compareItems').mock.calls;
    expect(calls[0][1].attributes.model).toBe('STRONG');
    expect(calls[1][1].attributes.model).toBe('WEAK');
  });

  it('31. continues when image understanding is unavailable', async () => {
    const deps = makeDeps({
      analyzeItemImage: vi.fn(async () => {
        throw new Error('vision unavailable');
      }),
    });
    const result = await runMatchingPipeline(
      pReport('lost', { imageUrl: 'https://x/img.jpg' }),
      [pReport('f1')],
      deps,
    );
    expect(result.matches).toHaveLength(1);
    expect(result.warnings.some((w) => w.stage === 'image')).toBe(true);
  });

  it('32. location failure does not destroy otherwise-usable matching', async () => {
    const deps = makeDeps({
      normalizeCampusLocation: vi.fn(async () => {
        throw new Error('location service down');
      }),
    });
    const result = await runMatchingPipeline(
      pReport('lost', { locationDescription: 'near the library' }),
      [pReport('f1')],
      deps,
    );
    expect(result.matches).toHaveLength(1);
    expect(result.warnings.some((w) => w.stage === 'location')).toBe(true);
  });

  it('33/34. comparison evidence stays separate from the decision; no ownership decision', async () => {
    const deps = makeDeps({
      compareItems: vi.fn(async () => makeComparison({ matchingFeatures: ['color'] })),
    });
    const result = await runMatchingPipeline(pReport('lost'), [pReport('f1')], deps);
    const match = result.matches[0];
    expect(match.comparison).not.toHaveProperty('tier'); // evidence, not a decision
    expect(match.decision).not.toHaveProperty('matchingFeatures'); // decision, not evidence
    expect(typeof match.decision.recommendVerification).toBe('boolean');
    expect(match.decision).not.toHaveProperty('owner');
  });

  it('fails cleanly when the lost report cannot be prepared (extraction failure)', async () => {
    const deps = makeDeps({
      extractItemAttributes: vi.fn(async () => {
        throw new Error('extraction failed');
      }),
    });
    const result = await runMatchingPipeline(pReport('lost'), [pReport('f1')], deps);
    expect(result.status).toBe('failed');
    expect(result.matches).toEqual([]);
    expect(result.warnings.some((w) => w.stage === 'extraction' && w.reportId === 'lost')).toBe(true);
  });
});
