import { describe, it, expect, vi } from 'vitest';
import { loadConfig, type AiConfig } from '../src/config.js';
import type { FeatherlessClient } from '../src/featherless/client.js';
import { CAMPUS_LANDMARKS } from '../src/data/campusLandmarks.js';
import { normalizeCampusLocation } from '../src/services/locationNormalization.js';
import { normalizeToken } from '../src/utils/attributeComparison.js';

const config: AiConfig = loadConfig({ FEATHERLESS_API_KEY: 'test-key' });

const CONFIRMED_NAMES = [
  'Library',
  'Student Services',
  'Reception',
  'Security',
  'Main Gate',
  'Cafeteria',
  'Main Campus Security Desk',
];

const ALLOWED_ZONES = new Set(['academic', 'services', 'entrance', 'food', 'security']);

/** A client that fails the test if the AI is invoked (deterministic-only paths). */
function clientNeverCalled(): FeatherlessClient {
  return {
    chatCompletion: vi.fn(() => {
      throw new Error('AI should not have been called');
    }),
  };
}

function clientReturning(content: string): FeatherlessClient {
  return { chatCompletion: vi.fn().mockResolvedValue({ content, model: config.models.text, finishReason: 'stop' }) };
}

const interp = (landmarkName: string | null, confidence: number) =>
  JSON.stringify({ landmarkName, confidence });

describe('confirmed campus landmark dataset', () => {
  it('1. contains exactly the 7 confirmed landmarks', () => {
    expect(CAMPUS_LANDMARKS).toHaveLength(7);
    expect(CAMPUS_LANDMARKS.map((l) => l.name)).toEqual(CONFIRMED_NAMES);
  });

  it('2. has unique, stable ids', () => {
    const ids = CAMPUS_LANDMARKS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'library',
      'student-services',
      'reception',
      'security',
      'main-gate',
      'cafeteria',
      'main-campus-security-desk',
    ]);
  });

  it('3. has unique names', () => {
    const names = CAMPUS_LANDMARKS.map((l) => normalizeToken(l.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it('4. aliases are unique across landmarks and never collide with another landmark name', () => {
    const seen = new Set<string>();
    for (const landmark of CAMPUS_LANDMARKS) {
      for (const alias of landmark.aliases) {
        const norm = normalizeToken(alias);
        expect(seen.has(norm)).toBe(false); // no cross-landmark duplicate alias
        seen.add(norm);
      }
    }
    for (const landmark of CAMPUS_LANDMARKS) {
      for (const other of CAMPUS_LANDMARKS) {
        if (other.id === landmark.id) continue;
        expect(landmark.aliases.map(normalizeToken)).not.toContain(normalizeToken(other.name));
      }
    }
  });

  it('assigns only broad allowed zones', () => {
    for (const landmark of CAMPUS_LANDMARKS) {
      expect(ALLOWED_ZONES.has(landmark.zone)).toBe(true);
    }
  });

  it('5. resolves every exact landmark name deterministically without AI', async () => {
    for (const landmark of CAMPUS_LANDMARKS) {
      const client = clientNeverCalled();
      const result = await normalizeCampusLocation(landmark.name, { client, config });
      expect(result.method).toBe('exact');
      expect(result.landmarkId).toBe(landmark.id);
      expect(client.chatCompletion).not.toHaveBeenCalled();
    }
  });

  it('6. resolves obvious aliases deterministically without AI', async () => {
    const cases: Array<[string, string]> = [
      ['lib', 'library'],
      ['canteen', 'cafeteria'],
      ['main entrance', 'main-gate'],
      ['security desk', 'main-campus-security-desk'],
      ['reception desk', 'reception'],
      ['student service', 'student-services'],
    ];
    for (const [query, expectedId] of cases) {
      const client = clientNeverCalled();
      const result = await normalizeCampusLocation(query, { client, config });
      expect(result.method).toBe('alias');
      expect(result.landmarkId).toBe(expectedId);
      expect(client.chatCompletion).not.toHaveBeenCalled();
    }
  });

  it('7. resolves a natural-language phrase via deterministic fuzzy when supported', async () => {
    const client = clientNeverCalled();
    const result = await normalizeCampusLocation('cafeteria area', { client, config });
    expect(result.method).toBe('fuzzy');
    expect(result.landmarkId).toBe('cafeteria');
    expect(client.chatCompletion).not.toHaveBeenCalled();
  });

  it('8. does not guess when the AI cannot confidently identify a landmark', async () => {
    const client = clientReturning(interp(null, 0.1));
    const result = await normalizeCampusLocation('somewhere around campus', { client, config });
    expect(result.method).toBe('unmatched');
    expect(result.landmarkId).toBeNull();
  });

  it('9. returns unmatched for an unknown landmark not in the dataset', async () => {
    const client = clientReturning(interp('Underground Bunker', 0.9));
    const result = await normalizeCampusLocation('near the underground bunker', { client, config });
    expect(result.method).toBe('unmatched');
    expect(result.landmarkId).toBeNull();
  });

  it('10/11. the dataset contains no coordinates, verification, or ownership fields', () => {
    for (const landmark of CAMPUS_LANDMARKS) {
      expect(Object.keys(landmark).sort()).toEqual(['aliases', 'id', 'name', 'zone']);
    }
  });
});
