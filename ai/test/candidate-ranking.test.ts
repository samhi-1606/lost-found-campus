import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ImageAttributes, ItemAttributes, LocationResult } from '../src/domain/types.js';
import {
  rankCandidates,
  type RankingItem,
} from '../src/services/candidateRanking.js';

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

function makeItem(
  id: string,
  attributes: Partial<ItemAttributes> = {},
  extra: { image?: ImageAttributes | null; location?: LocationResult | null; timestamp?: string | null } = {},
): RankingItem {
  return {
    id,
    attributes: makeAttributes(attributes),
    image: extra.image ?? null,
    location: extra.location ?? null,
    timestamp: extra.timestamp ?? null,
  };
}

function loc(overrides: Partial<LocationResult>): LocationResult {
  return {
    raw: '',
    landmarkId: null,
    landmarkName: null,
    zone: null,
    confidence: 1,
    method: 'exact',
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

const byId = (results: { candidateId: string }[]) => results.map((r) => r.candidateId);
const find = (results: { candidateId: string }[], id: string) =>
  results.find((r) => r.candidateId === id)!;

describe('rankCandidates', () => {
  it('1. an exact model match ranks highly and above a category-only candidate', () => {
    const lost = makeItem('lost', { model: 'ABC-123', brand: 'Contoso', colors: ['black'] });
    const strong = makeItem('c-model', { model: 'ABC-123', brand: 'Contoso', colors: ['black'] });
    const weak = makeItem('c-cat', {});
    const ranked = rankCandidates(lost, [weak, strong]);
    expect(ranked[0].candidateId).toBe('c-model');
    expect(ranked[0].score).toBeGreaterThan(0.4);
    expect(ranked[0].reasons).toContain('same model');
    expect(find(ranked, 'c-model').score).toBeGreaterThan(find(ranked, 'c-cat').score);
  });

  it('2. a matching unique identifying mark ranks highly', () => {
    const lost = makeItem('lost', { distinguishingFeatures: ['engraved initials near the hinge'] });
    const strong = makeItem('c-mark', {
      distinguishingFeatures: ['deep engraved marking on the hinge cover'],
    });
    const weak = makeItem('c-cat', {});
    const ranked = rankCandidates(lost, [weak, strong]);
    expect(ranked[0].candidateId).toBe('c-mark');
    expect(ranked[0].reasons.some((r) => r.startsWith('matching distinctive feature'))).toBe(true);
  });

  it('3. brand + model beats category + color', () => {
    const lost = makeItem('lost', { model: 'ABC-123', brand: 'Contoso', colors: ['black'] });
    const brandModel = makeItem('c-bm', { model: 'ABC-123', brand: 'Contoso' });
    const catColor = makeItem('c-cc', { colors: ['black'] });
    const ranked = rankCandidates(lost, [catColor, brandModel]);
    expect(ranked[0].candidateId).toBe('c-bm');
    expect(find(ranked, 'c-bm').score).toBeGreaterThan(find(ranked, 'c-cc').score);
  });

  it('4. same category alone does not rank highly', () => {
    const lost = makeItem('lost', {});
    const ranked = rankCandidates(lost, [makeItem('c', {})]);
    expect(ranked[0].reasons).toContain('same category');
    expect(ranked[0].score).toBeLessThan(0.15);
  });

  it('5. same color alone does not rank highly', () => {
    const lost = makeItem('lost', { category: 'other', colors: ['black'] });
    const ranked = rankCandidates(lost, [makeItem('c', { category: 'other', colors: ['black'] })]);
    expect(ranked[0].reasons.some((r) => r.startsWith('shared color'))).toBe(true);
    expect(ranked[0].score).toBeLessThan(0.15);
  });

  it('6. category + color + location does not overpower distinctive evidence', () => {
    const lost = makeItem(
      'lost',
      { model: 'ABC-123', colors: ['black'], distinguishingFeatures: ['cracked corner'] },
      { location: loc({ zone: 'Academic Zone' }) },
    );
    const generic = makeItem('c-generic', { colors: ['black'] }, { location: loc({ zone: 'Academic Zone' }) });
    const distinctive = makeItem('c-distinct', {
      model: 'ABC-123',
      distinguishingFeatures: ['badly cracked corner'],
    });
    const ranked = rankCandidates(lost, [generic, distinctive]);
    expect(ranked[0].candidateId).toBe('c-distinct');
    expect(find(ranked, 'c-distinct').score).toBeGreaterThan(find(ranked, 'c-generic').score);
  });

  it('7. an explicit model contradiction strongly lowers the ranking', () => {
    const lost = makeItem('lost', { model: 'ABC-123', brand: 'Contoso' });
    const ok = makeItem('c-ok', { model: 'ABC-123', brand: 'Contoso' });
    const contradiction = makeItem('c-bad', { model: 'XYZ-999', brand: 'Contoso' });
    const ranked = rankCandidates(lost, [ok, contradiction]);
    expect(find(ranked, 'c-bad').score).toBeLessThan(find(ranked, 'c-ok').score);
    expect(find(ranked, 'c-bad').contradictions).toContain('model differs');
    expect(ranked[0].candidateId).toBe('c-ok');
  });

  it('8. an explicit brand contradiction lowers the ranking', () => {
    const lost = makeItem('lost', { brand: 'Nike' });
    const ok = makeItem('c-ok', { brand: 'Nike' });
    const bad = makeItem('c-bad', { brand: 'Adidas' });
    const ranked = rankCandidates(lost, [ok, bad]);
    expect(find(ranked, 'c-bad').score).toBeLessThan(find(ranked, 'c-ok').score);
    expect(find(ranked, 'c-bad').contradictions).toContain('brand differs');
  });

  it('9-12,15. missing brand/model/color/location/time never eliminate a candidate', () => {
    const lost = makeItem(
      'lost',
      { brand: 'Nike', model: 'ABC-123', colors: ['black'] },
      { location: loc({ zone: 'Academic Zone' }), timestamp: '2026-09-01T00:00:00Z' },
    );
    // Candidate knows almost nothing (only a compatible category).
    const sparse = makeItem('c-sparse', {});
    const ranked = rankCandidates(lost, [sparse]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].candidateId).toBe('c-sparse');
    expect(ranked[0].eligible).toBe(true);
    expect(ranked[0].contradictions).toEqual([]);
  });

  it('13. coarse location improves the ranking', () => {
    const lost = makeItem('lost', {}, { location: loc({ zone: 'Academic Zone' }) });
    const withZone = makeItem('c-zone', {}, { location: loc({ zone: 'Academic Zone' }) });
    const withoutZone = makeItem('c-none', {}, { location: loc({ zone: 'Sports Zone' }) });
    const ranked = rankCandidates(lost, [withoutZone, withZone]);
    expect(find(ranked, 'c-zone').score).toBeGreaterThan(find(ranked, 'c-none').score);
    expect(find(ranked, 'c-zone').reasons).toContain('same coarse campus zone');
  });

  it('14. valid timestamps improve the ranking', () => {
    const lost = makeItem('lost', {}, { timestamp: '2026-09-01T00:00:00Z' });
    const soonAfter = makeItem('c-time', {}, { timestamp: '2026-09-03T00:00:00Z' });
    const noTime = makeItem('c-notime', {});
    const ranked = rankCandidates(lost, [noTime, soonAfter]);
    expect(find(ranked, 'c-time').score).toBeGreaterThan(find(ranked, 'c-notime').score);
    expect(find(ranked, 'c-time').reasons.some((r) => r.startsWith('consistent timing'))).toBe(true);
  });

  it('16. image-derived structured attributes contribute (brand via image)', () => {
    const lost = makeItem('lost', { brand: 'Apple' });
    const viaImage = makeItem('c-img', { brand: null }, { image: makeImage({ brand: 'Apple' }) });
    const noBrand = makeItem('c-plain', { brand: null });
    const ranked = rankCandidates(lost, [noBrand, viaImage]);
    expect(find(ranked, 'c-img').reasons).toContain('same brand');
    expect(find(ranked, 'c-img').score).toBeGreaterThan(find(ranked, 'c-plain').score);
  });

  it('17. no fake image-similarity score is produced', () => {
    const lost = makeItem('lost', {}, { image: makeImage({ detectedText: ['NORTHFACE'] }) });
    const cand = makeItem('c', {}, { image: makeImage({ detectedText: ['NORTHFACE'] }) });
    const [result] = rankCandidates(lost, [cand]);
    expect(result).not.toHaveProperty('imageSimilarity');
    expect(result.reasons.every((r) => !r.toLowerCase().includes('similarity'))).toBe(true);
  });

  it('18/29. scoring is deterministic for identical inputs', () => {
    const lost = makeItem('lost', { model: 'ABC-123', brand: 'Contoso', colors: ['black'] });
    const candidates = [
      makeItem('a', { model: 'ABC-123' }),
      makeItem('b', { colors: ['black'] }),
      makeItem('c', { brand: 'Contoso' }),
    ];
    expect(rankCandidates(lost, candidates)).toEqual(rankCandidates(lost, candidates));
  });

  it('19. every score is bounded between 0 and 1', () => {
    const lost = makeItem('lost', { model: 'ABC-123', brand: 'Contoso', colors: ['black'] });
    const candidates = [
      makeItem('a', { model: 'ABC-123', brand: 'Contoso', colors: ['black'] }),
      makeItem('b', { model: 'ZZZ', brand: 'Other', colors: ['blue'] }),
      makeItem('c', {}),
    ];
    for (const r of rankCandidates(lost, candidates)) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('20. candidates are returned in descending score order', () => {
    const lost = makeItem('lost', { model: 'ABC-123', brand: 'Contoso', colors: ['black'] });
    const ranked = rankCandidates(lost, [
      makeItem('weak', { colors: ['black'] }),
      makeItem('strong', { model: 'ABC-123', brand: 'Contoso' }),
      makeItem('medium', { brand: 'Contoso' }),
    ]);
    const scores = ranked.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('21. topK limits the number of returned candidates', () => {
    const lost = makeItem('lost', { brand: 'Contoso' });
    const candidates = Array.from({ length: 5 }, (_, i) => makeItem(`c${i}`, { brand: 'Contoso' }));
    expect(rankCandidates(lost, candidates, { topK: 2 })).toHaveLength(2);
  });

  it('22. topK larger than the candidate count returns all eligible candidates', () => {
    const lost = makeItem('lost', { brand: 'Contoso' });
    const candidates = Array.from({ length: 3 }, (_, i) => makeItem(`c${i}`, { brand: 'Contoso' }));
    expect(rankCandidates(lost, candidates, { topK: 100 })).toHaveLength(3);
  });

  it('23. an empty candidate list is handled', () => {
    expect(rankCandidates(makeItem('lost', {}), [])).toEqual([]);
  });

  it('24. ranking is synchronous and makes zero Featherless calls (no client needed)', () => {
    const result = rankCandidates(makeItem('lost', {}), [makeItem('c', {})]);
    expect(result).not.toBeInstanceOf(Promise);
    expect(Array.isArray(result)).toBe(true);
  });

  it('25/26. the ranking sources import no Featherless/Firebase/React code', () => {
    const service = readFileSync(new URL('../src/services/candidateRanking.ts', import.meta.url), 'utf8');
    const utils = readFileSync(new URL('../src/utils/attributeComparison.ts', import.meta.url), 'utf8');
    for (const source of [service, utils]) {
      // Inspect only actual import statements (doc comments may mention these words).
      const importLines = source.split('\n').filter((line) => line.trim().startsWith('import'));
      for (const line of importLines) {
        expect(line.toLowerCase()).not.toContain('featherless');
        expect(line.toLowerCase()).not.toContain('firebase');
        expect(line.toLowerCase()).not.toContain('react');
      }
    }
  });

  it('27/28. output contains no coordinates, verification, or ownership fields', () => {
    const lost = makeItem('lost', { model: 'ABC-123' });
    const [result] = rankCandidates(lost, [makeItem('c', { model: 'ABC-123' })]);
    expect(Object.keys(result).sort()).toEqual([
      'candidateId',
      'contradictions',
      'eligible',
      'reasons',
      'score',
    ]);
    for (const forbidden of ['latitude', 'longitude', 'coordinates', 'verified', 'owner']) {
      expect(result).not.toHaveProperty(forbidden);
    }
  });

  it('30. one strongly-distinctive candidate outranks several generic ones', () => {
    const lost = makeItem('lost', {
      model: 'ABC-123',
      colors: ['black'],
      distinguishingFeatures: ['cracked corner'],
    });
    const distinctive = makeItem('c-distinct', {
      model: 'ABC-123',
      distinguishingFeatures: ['visibly cracked corner'],
    });
    const generics = Array.from({ length: 4 }, (_, i) => makeItem(`g${i}`, { colors: ['black'] }));
    const ranked = rankCandidates(lost, [...generics, distinctive]);
    expect(ranked[0].candidateId).toBe('c-distinct');
  });

  it('31. ambiguous/missing attributes do not create false contradictions', () => {
    const lost = makeItem('lost', { brand: 'Nike', model: 'ABC-123', colors: ['black'] });
    const candidate = makeItem('c', { brand: null, model: null, colors: [] });
    const [result] = rankCandidates(lost, [candidate]);
    expect(result.contradictions).toEqual([]);
    expect(result.eligible).toBe(true);
  });

  it('32. incompatible categories are filtered only when genuinely strong', () => {
    const lost = makeItem('lost', { category: 'laptop' });
    const phone = makeItem('c-phone', { category: 'phone' }); // different known group -> filtered
    const stapler = makeItem('c-stapler', { category: 'stapler' }); // unmapped -> kept
    const ranked = rankCandidates(lost, [phone, stapler]);
    expect(byId(ranked)).toContain('c-stapler');
    expect(byId(ranked)).not.toContain('c-phone');
  });

  it('33. an unknown category does not eliminate a candidate', () => {
    const lost = makeItem('lost', { category: 'laptop', brand: 'Contoso' });
    const ranked = rankCandidates(lost, [makeItem('c', { category: 'other', brand: 'Contoso' })]);
    expect(byId(ranked)).toContain('c');
    expect(ranked[0].reasons).toContain('same brand');
  });

  it('34. reasons accurately correspond to the signals used', () => {
    const lost = makeItem('lost', { brand: 'Contoso', model: 'ABC-123', colors: ['black'] });
    const candidate = makeItem('c', { brand: 'Contoso', model: 'ABC-123', colors: ['black'] });
    const [result] = rankCandidates(lost, [candidate]);
    expect(result.reasons).toContain('same model');
    expect(result.reasons).toContain('same brand');
    expect(result.reasons).toContain('same category');
    expect(result.reasons.some((r) => r.startsWith('shared color'))).toBe(true);
    // No location/time signals were provided, so none should be claimed.
    expect(result.reasons.some((r) => r.includes('campus'))).toBe(false);
    expect(result.reasons.some((r) => r.includes('timing'))).toBe(false);
  });

  it('35. contradictions appear separately from positive reasons', () => {
    const lost = makeItem('lost', { brand: 'Contoso', model: 'ABC-123' });
    const candidate = makeItem('c', { brand: 'Contoso', model: 'XYZ-999' });
    const [result] = rankCandidates(lost, [candidate]);
    expect(result.reasons).toContain('same brand');
    expect(result.reasons).not.toContain('model differs');
    expect(result.contradictions).toContain('model differs');
    expect(result.contradictions).not.toContain('same brand');
  });
});
