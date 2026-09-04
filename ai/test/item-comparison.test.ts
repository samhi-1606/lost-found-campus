import { describe, it, expect, vi } from 'vitest';
import { loadConfig, type AiConfig } from '../src/config.js';
import type { AIComparison, ImageAttributes, ItemAttributes } from '../src/domain/types.js';
import type { FeatherlessClient } from '../src/featherless/client.js';
import { FeatherlessServerError } from '../src/featherless/types.js';
import {
  compareItems,
  ItemComparisonError,
  type ComparisonItem,
} from '../src/services/itemComparison.js';
import { calculateMatchDecision } from '../src/services/matchDecision.js';

const SECRET = 'super-secret-KEY';
const config: AiConfig = loadConfig({ FEATHERLESS_API_KEY: SECRET });
const thresholds = config.thresholds; // { possible: 0.4, strong: 0.75 }

// ---- helpers -------------------------------------------------------------

function makeComparison(overrides: Partial<AIComparison> = {}): AIComparison {
  return {
    attributeSimilarity: 0,
    matchingFeatures: [],
    conflictingFeatures: [],
    unknownAttributes: [],
    distinctiveMatches: [],
    distinctiveConflicts: [],
    locationPlausibility: 0.5,
    timePlausibility: 0.5,
    rawScore: 0,
    reasoning: '',
    ...overrides,
  };
}

function makeAttributes(overrides: Partial<ItemAttributes> = {}): ItemAttributes {
  return {
    category: 'bags',
    brand: null,
    model: null,
    colors: ['black'],
    material: 'nylon',
    identifiers: [],
    distinguishingFeatures: [],
    keywords: ['backpack'],
    confidence: 0.8,
    ...overrides,
  };
}

const lostItem: ComparisonItem = {
  type: 'lost',
  attributes: makeAttributes({ distinguishingFeatures: ['red sticker on front'] }),
};
const foundItem: ComparisonItem = {
  type: 'found',
  attributes: makeAttributes({ distinguishingFeatures: ['red sticker on front pocket'] }),
};

const validComparisonJson = JSON.stringify({
  matchingFeatures: ['category bags', 'color black'],
  conflictingFeatures: [],
  unknownAttributes: ['model'],
  distinctiveMatches: ['red sticker on front matches'],
  distinctiveConflicts: [],
  attributeSimilarity: 0.7,
  locationPlausibility: 0.6,
  timePlausibility: 0.5,
  rawScore: 0.65,
  reasoning: 'Both are black backpacks with a matching red sticker.',
});

function clientReturning(...contents: string[]): FeatherlessClient {
  const fn = vi.fn();
  for (const c of contents) {
    fn.mockResolvedValueOnce({ content: c, model: config.models.comparison, finishReason: 'stop' });
  }
  return { chatCompletion: fn };
}

function deps(client: FeatherlessClient) {
  return { client, config };
}

function fnOf(client: FeatherlessClient) {
  return client.chatCompletion as ReturnType<typeof vi.fn>;
}

// ---- deterministic decision ---------------------------------------------

describe('calculateMatchDecision (deterministic)', () => {
  it('1. exact/specific attribute matches produce a strong match', () => {
    const decision = calculateMatchDecision(
      makeComparison({
        distinctiveMatches: ['serial SN123 matches', 'engraving "JS" matches'],
        matchingFeatures: ['category electronics', 'color black'],
        attributeSimilarity: 0.9,
        locationPlausibility: 0.7,
        timePlausibility: 0.6,
      }),
      thresholds,
    );
    expect(decision.tier).toBe('strong');
  });

  it('2. brand + model match produces a strong match', () => {
    const decision = calculateMatchDecision(
      makeComparison({
        distinctiveMatches: ['brand Apple matches', 'model iPhone 13 matches'],
        matchingFeatures: ['category electronics', 'color black', 'material glass'],
        attributeSimilarity: 0.9,
        locationPlausibility: 0.7,
        timePlausibility: 0.6,
      }),
      thresholds,
    );
    expect(decision.tier).toBe('strong');
  });

  it('3. a unique identifying mark yields at least a possible match with the evidence recorded', () => {
    const decision = calculateMatchDecision(
      makeComparison({
        distinctiveMatches: ['unique scratch pattern matches'],
        matchingFeatures: ['category electronics'],
        attributeSimilarity: 0.7,
        locationPlausibility: 0.6,
        timePlausibility: 0.5,
      }),
      thresholds,
    );
    expect(decision.tier).not.toBe('no_match');
    expect(decision.evidence).toContain('distinctive match: unique scratch pattern matches');
  });

  it('4. strong distinctive evidence produces a strong match', () => {
    const decision = calculateMatchDecision(
      makeComparison({
        distinctiveMatches: ['engraved name "J. Rivera" matches', 'model MacBook Pro 2019 matches'],
        matchingFeatures: ['category electronics', 'color silver'],
        attributeSimilarity: 0.85,
        locationPlausibility: 0.6,
        timePlausibility: 0.6,
      }),
      thresholds,
    );
    expect(decision.tier).toBe('strong');
  });

  it('5. generic color-only similarity does NOT produce a strong match', () => {
    const decision = calculateMatchDecision(
      makeComparison({ matchingFeatures: ['color black'], attributeSimilarity: 0.5 }),
      thresholds,
    );
    expect(decision.tier).not.toBe('strong');
  });

  it('6. category-only similarity does NOT produce a strong match', () => {
    const decision = calculateMatchDecision(
      makeComparison({ matchingFeatures: ['category bags'], attributeSimilarity: 0.5 }),
      thresholds,
    );
    expect(decision.tier).not.toBe('strong');
  });

  it('7. contradictory brand/model evidence reduces confidence', () => {
    const base = makeComparison({
      distinctiveMatches: ['brand Apple matches', 'model iPhone 13 matches'],
      matchingFeatures: ['category electronics', 'color black', 'material glass'],
      attributeSimilarity: 0.9,
      locationPlausibility: 0.7,
      timePlausibility: 0.6,
    });
    const withConflict = { ...base, distinctiveConflicts: ['brand Nike vs Adidas'] };

    const strong = calculateMatchDecision(base, thresholds);
    const reduced = calculateMatchDecision(withConflict, thresholds);

    expect(reduced.score).toBeLessThan(strong.score);
    expect(reduced.tier).not.toBe('strong');
  });

  it('8. a missing attribute is treated as unknown, not a contradiction', () => {
    const base = makeComparison({
      distinctiveMatches: ['serial matches', 'engraving matches'],
      attributeSimilarity: 0.9,
    });
    const withUnknowns = {
      ...base,
      unknownAttributes: ['color (found unknown)', 'material (found unknown)'],
    };

    const a = calculateMatchDecision(base, thresholds);
    const b = calculateMatchDecision(withUnknowns, thresholds);

    expect(b.score).toBe(a.score); // unknowns do not penalize
    expect(b.tier).toBe(a.tier);
  });

  it('11. coarse location evidence contributes to the score', () => {
    const low = makeComparison({
      matchingFeatures: ['category bags', 'color black'],
      attributeSimilarity: 0.5,
      locationPlausibility: 0.1,
    });
    const high = { ...low, locationPlausibility: 0.9 };
    expect(calculateMatchDecision(high, thresholds).score).toBeGreaterThan(
      calculateMatchDecision(low, thresholds).score,
    );
  });

  it('12/13. output never contains coordinates, verification, or ownership fields', () => {
    const decision = calculateMatchDecision(
      makeComparison({ distinctiveMatches: ['serial matches'] }),
      thresholds,
    );
    for (const forbidden of [
      'latitude',
      'longitude',
      'coordinates',
      'verified',
      'verification',
      'owner',
    ]) {
      expect(decision).not.toHaveProperty(forbidden);
    }
    expect(Object.keys(decision).sort()).toEqual([
      'evidence',
      'recommendVerification',
      'revealExactLocation',
      'score',
      'tier',
    ]);
  });

  it('14. revealExactLocation remains false across all tiers', () => {
    const strong = calculateMatchDecision(
      makeComparison({
        distinctiveMatches: ['a matches', 'b matches'],
        attributeSimilarity: 0.9,
      }),
      thresholds,
    );
    const none = calculateMatchDecision(makeComparison(), thresholds);
    expect(strong.revealExactLocation).toBe(false);
    expect(none.revealExactLocation).toBe(false);
  });

  it('20. the decision is a pure synchronous function (no AI call)', () => {
    const result = calculateMatchDecision(makeComparison({ distinctiveMatches: ['x'] }), thresholds);
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.tier).toBeDefined();
    expect(calculateMatchDecision.length).toBe(2); // (comparison, thresholds) — no client param
  });

  it('21. same category + color + location is insufficient for a strong match', () => {
    const decision = calculateMatchDecision(
      makeComparison({
        matchingFeatures: ['category bags', 'color black'],
        attributeSimilarity: 0.6,
        locationPlausibility: 1.0,
        timePlausibility: 0.5,
      }),
      thresholds,
    );
    expect(decision.tier).not.toBe('strong');
  });

  it('22. a strong contradiction prevents a strong match (and enough forces no_match)', () => {
    const oneConflict = calculateMatchDecision(
      makeComparison({
        distinctiveMatches: ['serial matches', 'engraving matches'],
        attributeSimilarity: 0.9,
        distinctiveConflicts: ['brand Nike vs Adidas'],
      }),
      thresholds,
    );
    expect(oneConflict.tier).not.toBe('strong');

    const twoConflicts = calculateMatchDecision(
      makeComparison({
        distinctiveMatches: ['serial matches', 'engraving matches'],
        attributeSimilarity: 0.9,
        distinctiveConflicts: ['brand Nike vs Adidas', 'model A vs B'],
      }),
      thresholds,
    );
    expect(twoConflicts.tier).toBe('no_match');
  });

  it('23. similar generic items remain only a possible match without distinctive evidence', () => {
    const decision = calculateMatchDecision(
      makeComparison({
        matchingFeatures: ['category bags', 'color black', 'shape rectangular', 'size large'],
        attributeSimilarity: 0.9,
        locationPlausibility: 0.8,
        timePlausibility: 0.6,
      }),
      thresholds,
    );
    expect(decision.tier).toBe('possible');
  });

  it('24. the deterministic decision is reproducible for identical inputs', () => {
    const input = makeComparison({
      distinctiveMatches: ['serial matches'],
      matchingFeatures: ['category', 'color'],
      attributeSimilarity: 0.6,
      locationPlausibility: 0.5,
      timePlausibility: 0.5,
    });
    expect(calculateMatchDecision(input, thresholds)).toEqual(
      calculateMatchDecision(input, thresholds),
    );
  });
});

// ---- AI comparison service ----------------------------------------------

describe('compareItems (AI evidence)', () => {
  it('9. incorporates image-understanding attributes into the comparison', async () => {
    const image: ImageAttributes = {
      hasImage: true,
      category: 'bags',
      brand: null,
      model: null,
      colors: ['black'],
      material: 'nylon',
      detectedText: ['NORTHFACE'],
      distinguishingFeatures: ['red sticker on front pocket'],
      mentionedByUserNotVisible: [],
      confidence: 0.8,
    };
    const client = clientReturning(validComparisonJson);
    const result = await compareItems(
      { ...lostItem, image },
      { ...foundItem, image },
      deps(client),
    );

    expect(result.distinctiveMatches).toContain('red sticker on front matches');
    const userContent = fnOf(client).mock.calls[0][0].messages[1].content as string;
    expect(userContent).toContain('NORTHFACE');
    expect(fnOf(client).mock.calls[0][0].model).toBe(config.models.comparison);
  });

  it('10. works without any image evidence', async () => {
    const client = clientReturning(validComparisonJson);
    const result = await compareItems(lostItem, foundItem, deps(client));
    expect(result).toHaveProperty('attributeSimilarity');
    const userContent = fnOf(client).mock.calls[0][0].messages[1].content as string;
    expect(userContent).toContain('"image": null');
  });

  it('12/13. strips coordinate/verification/ownership keys from AI output', async () => {
    const dirty = JSON.stringify({
      matchingFeatures: ['category bags'],
      conflictingFeatures: [],
      unknownAttributes: [],
      distinctiveMatches: [],
      distinctiveConflicts: [],
      attributeSimilarity: 0.5,
      locationPlausibility: 0.5,
      timePlausibility: 0.5,
      rawScore: 0.5,
      reasoning: 'ok',
      latitude: 12.34,
      longitude: 56.78,
      verified: true,
      owner: 'alice',
    });
    const result = await compareItems(lostItem, foundItem, deps(clientReturning(dirty)));
    for (const forbidden of ['latitude', 'longitude', 'verified', 'owner']) {
      expect(result).not.toHaveProperty(forbidden);
    }
  });

  it('15. retries once on malformed JSON then succeeds', async () => {
    const client = clientReturning('not json at all', validComparisonJson);
    const result = await compareItems(lostItem, foundItem, deps(client));
    expect(result.attributeSimilarity).toBe(0.7);
    expect(fnOf(client)).toHaveBeenCalledTimes(2);
  });

  it('16. retries once on invalid schema then succeeds', async () => {
    const invalid = JSON.stringify({ attributeSimilarity: 2, locationPlausibility: 0.5 });
    const client = clientReturning(invalid, validComparisonJson);
    const result = await compareItems(lostItem, foundItem, deps(client));
    expect(result.attributeSimilarity).toBe(0.7);
    expect(fnOf(client)).toHaveBeenCalledTimes(2);
  });

  it('17. controlled failure: throws ItemComparisonError after retry, and propagates provider errors', async () => {
    const bad = clientReturning('nope', 'still nope');
    await expect(compareItems(lostItem, foundItem, deps(bad))).rejects.toBeInstanceOf(
      ItemComparisonError,
    );
    expect(fnOf(bad)).toHaveBeenCalledTimes(2);

    const failing: FeatherlessClient = {
      chatCompletion: vi.fn().mockRejectedValue(new FeatherlessServerError('500')),
    };
    await expect(compareItems(lostItem, foundItem, deps(failing))).rejects.toBeInstanceOf(
      FeatherlessServerError,
    );
    expect(fnOf(failing)).toHaveBeenCalledTimes(1); // no service-level retry on provider error
  });

  it('18. never leaks the API key in the result or errors', async () => {
    const ok = await compareItems(lostItem, foundItem, deps(clientReturning(validComparisonJson)));
    expect(JSON.stringify(ok)).not.toContain(SECRET);

    const error = await compareItems(lostItem, foundItem, deps(clientReturning('x', 'y'))).catch(
      (e) => e,
    );
    expect([error.message, error.stack ?? ''].join('\n')).not.toContain(SECRET);
  });

  it('19. the prompt contains no credentials or tokens', async () => {
    const client = clientReturning(validComparisonJson);
    await compareItems(lostItem, foundItem, deps(client));
    const [system, user] = fnOf(client).mock.calls[0][0].messages.map(
      (m: { content: string }) => m.content as string,
    );
    for (const text of [system, user]) {
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('Authorization');
      expect(text).not.toContain('Bearer');
      expect(text.toLowerCase()).not.toContain('api_key');
      expect(text.toLowerCase()).not.toContain('apikey');
    }
  });
});
