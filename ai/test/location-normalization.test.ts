import { describe, it, expect, vi } from 'vitest';
import { loadConfig, type AiConfig } from '../src/config.js';
import type { FeatherlessClient } from '../src/featherless/client.js';
import { FeatherlessServerError } from '../src/featherless/types.js';
import type { CampusLandmark } from '../src/data/campusLandmarks.js';
import {
  normalizeCampusLocation,
  resolveDeterministic,
  LocationNormalizationError,
  type LocationNormalizationDeps,
} from '../src/services/locationNormalization.js';

const SECRET = 'super-secret-KEY';
const config: AiConfig = loadConfig({ FEATHERLESS_API_KEY: SECRET });

// TEST FIXTURES ONLY — not shipped data. The real dataset is supplied by the team.
const landmarks: CampusLandmark[] = [
  { id: 'library', name: 'Library', aliases: ['central library', 'main library', 'lib'], zone: 'Academic Zone' },
  { id: 'cse-block', name: 'CSE Block', aliases: ['computer science block', 'cse'], zone: 'Academic Zone' },
  { id: 'canteen', name: 'Canteen', aliases: ['cafeteria', 'food court'], zone: 'Food Court Zone' },
  { id: 'main-gate', name: 'Main Gate', aliases: ['front gate', 'entrance gate'], zone: 'Entrance Zone' },
  { id: 'basketball-court', name: 'Basketball Court', aliases: ['bball court'], zone: 'Sports Zone' },
  { id: 'admin-block', name: 'Admin Block', aliases: ['administration block', 'admin'], zone: 'Admin Zone' },
];

const EXPECTED_KEYS = ['confidence', 'landmarkId', 'landmarkName', 'method', 'raw', 'zone'];

function clientReturning(...contents: string[]): FeatherlessClient {
  const fn = vi.fn();
  for (const c of contents) {
    fn.mockResolvedValueOnce({ content: c, model: config.models.text, finishReason: 'stop' });
  }
  return { chatCompletion: fn };
}

/** A client that fails the test if the AI is called (for deterministic-only paths). */
function clientNeverCalled(): FeatherlessClient {
  return {
    chatCompletion: vi.fn(() => {
      throw new Error('AI should not have been called');
    }),
  };
}

function deps(client: FeatherlessClient, extra: Partial<LocationNormalizationDeps> = {}) {
  return { client, config, landmarks, ...extra };
}

function fnOf(client: FeatherlessClient) {
  return client.chatCompletion as ReturnType<typeof vi.fn>;
}

function interp(landmarkName: string | null, confidence: number): string {
  return JSON.stringify({ landmarkName, confidence });
}

describe('normalizeCampusLocation', () => {
  it('1. resolves an exact landmark name without calling AI', async () => {
    const client = clientNeverCalled();
    const res = await normalizeCampusLocation('Library', deps(client));
    expect(res.method).toBe('exact');
    expect(res.landmarkId).toBe('library');
    expect(res.zone).toBe('Academic Zone');
    expect(res.confidence).toBe(1);
    expect(fnOf(client)).not.toHaveBeenCalled();
  });

  it('2. resolves a known alias without calling AI', async () => {
    const client = clientNeverCalled();
    const res = await normalizeCampusLocation('central library', deps(client));
    expect(res.method).toBe('alias');
    expect(res.landmarkId).toBe('library');
    expect(fnOf(client)).not.toHaveBeenCalled();
  });

  it('3. resolves a natural-language phrase via deterministic fuzzy (no AI)', async () => {
    const client = clientNeverCalled();
    const res = await normalizeCampusLocation('canteen area', deps(client));
    expect(res.method).toBe('fuzzy');
    expect(res.landmarkId).toBe('canteen');
    expect(res.confidence).toBeGreaterThanOrEqual(0.6);
    expect(fnOf(client)).not.toHaveBeenCalled();
  });

  it('4. uses AI interpretation when deterministic matching cannot resolve', async () => {
    const client = clientReturning(interp('Library', 0.8));
    const res = await normalizeCampusLocation('near the steps beside the library', deps(client));
    expect(res.method).toBe('ai');
    expect(res.landmarkId).toBe('library');
    expect(res.confidence).toBe(0.8);
    expect(fnOf(client)).toHaveBeenCalledTimes(1);
  });

  it('5. returns unmatched for an ambiguous location', async () => {
    // AI suggests a vague "Block" which matches multiple landmarks similarly.
    const client = clientReturning(interp('Block', 0.5));
    const res = await normalizeCampusLocation('somewhere near the block', deps(client));
    expect(res.method).toBe('unmatched');
    expect(res.landmarkId).toBeNull();
    expect(res.confidence).toBe(0);
  });

  it('6. returns unmatched for an unknown location', async () => {
    const client = clientReturning(interp(null, 0.1));
    const res = await normalizeCampusLocation('the moon', deps(client));
    expect(res.method).toBe('unmatched');
    expect(res.landmarkId).toBeNull();
    expect(fnOf(client)).toHaveBeenCalledTimes(1);
  });

  it('7. returns unmatched for an empty location without calling AI', async () => {
    const client = clientNeverCalled();
    const res = await normalizeCampusLocation('   ', deps(client));
    expect(res.method).toBe('unmatched');
    expect(res.confidence).toBe(0);
    expect(fnOf(client)).not.toHaveBeenCalled();
  });

  it('8. throws on malformed AI JSON after a stricter retry', async () => {
    const client = clientReturning('no json', 'still no json');
    await expect(
      normalizeCampusLocation('near the steps beside the library', deps(client)),
    ).rejects.toBeInstanceOf(LocationNormalizationError);
    expect(fnOf(client)).toHaveBeenCalledTimes(2);
  });

  it('9. throws on invalid AI schema (confidence out of range)', async () => {
    const bad = JSON.stringify({ landmarkName: 'Library', confidence: 1.5 });
    const client = clientReturning(bad, bad);
    await expect(
      normalizeCampusLocation('near the steps beside the library', deps(client)),
    ).rejects.toBeInstanceOf(LocationNormalizationError);
  });

  it('10. propagates a Featherless provider failure (no service-level retry)', async () => {
    const client: FeatherlessClient = {
      chatCompletion: vi.fn().mockRejectedValue(new FeatherlessServerError('500')),
    };
    await expect(
      normalizeCampusLocation('near the steps beside the library', deps(client)),
    ).rejects.toBeInstanceOf(FeatherlessServerError);
    expect(fnOf(client)).toHaveBeenCalledTimes(1);
  });

  it('11. succeeds on the stricter retry after a malformed first response', async () => {
    const client = clientReturning('garbage', interp('Library', 0.7));
    const res = await normalizeCampusLocation('near the steps beside the library', deps(client));
    expect(res.method).toBe('ai');
    expect(res.landmarkId).toBe('library');
    expect(fnOf(client)).toHaveBeenCalledTimes(2);
  });

  it('12. fails after the single retry is also invalid', async () => {
    const client = clientReturning('nope', 'still nope');
    await expect(
      normalizeCampusLocation('near the steps beside the library', deps(client)),
    ).rejects.toBeInstanceOf(LocationNormalizationError);
    expect(fnOf(client)).toHaveBeenCalledTimes(2);
  });

  it('13. never accepts an AI-invented landmark not in the trusted dataset', async () => {
    const client = clientReturning(interp('Underground Bunker', 0.95));
    const res = await normalizeCampusLocation('near the steps beside the library', deps(client));
    expect(res.method).toBe('unmatched');
    expect(res.landmarkId).toBeNull();
  });

  it('14. never includes coordinates, ownership, or verification in the result', async () => {
    const res = await normalizeCampusLocation('Library', deps(clientNeverCalled()));
    expect(Object.keys(res).sort()).toEqual(EXPECTED_KEYS);
    for (const forbidden of [
      'latitude',
      'longitude',
      'lat',
      'lng',
      'coordinates',
      'verified',
      'verification',
      'owner',
    ]) {
      expect(res).not.toHaveProperty(forbidden);
    }
  });

  it('15. deterministic resolution works fully without AI', () => {
    expect(resolveDeterministic('Library', landmarks)).toMatchObject({
      method: 'exact',
      landmark: { id: 'library' },
    });
    expect(resolveDeterministic('central library', landmarks)).toMatchObject({ method: 'alias' });
    expect(resolveDeterministic('canteen area', landmarks)).toMatchObject({
      method: 'fuzzy',
      landmark: { id: 'canteen' },
    });
    // No trusted data → nothing resolves.
    expect(resolveDeterministic('Library', [])).toBeNull();
  });

  it('16. multiple similar landmarks do not produce a false confident match', () => {
    // "block" is similar to both "CSE Block" and "Admin Block".
    expect(resolveDeterministic('block', landmarks)).toBeNull();
    expect(resolveDeterministic('the block', landmarks)).toBeNull();
  });

  it('never leaks the API key in the result', async () => {
    const res = await normalizeCampusLocation('Library', deps(clientNeverCalled()));
    expect(JSON.stringify(res)).not.toContain(SECRET);
  });

  it('sends the description and landmark names (not coordinates) to the AI', async () => {
    const client = clientReturning(interp('Library', 0.8));
    await normalizeCampusLocation('near the steps beside the library', deps(client));
    const userMessage = fnOf(client).mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain('near the steps beside the library');
    expect(userMessage).toContain('Library');
    expect(userMessage.toLowerCase()).not.toContain('latitude');
  });
});
