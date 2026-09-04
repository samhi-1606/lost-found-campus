import { describe, it, expect, vi } from 'vitest';
import { loadConfig, type AiConfig } from '../src/config.js';
import type { Report } from '../src/domain/types.js';
import type { FeatherlessClient } from '../src/featherless/client.js';
import { FeatherlessServerError } from '../src/featherless/types.js';
import {
  analyzeItemImage,
  ImageUnderstandingError,
  type ImageUnderstandingDeps,
} from '../src/services/imageUnderstanding.js';

const SECRET = 'super-secret-KEY';
const config: AiConfig = loadConfig({ FEATHERLESS_API_KEY: SECRET });
const IMAGE_URL = 'https://example.com/items/bag.jpg';

const reportWithImage: Report = {
  id: 'img1',
  type: 'found',
  description: 'Black backpack, possibly with a red sticker on the front.',
  imageUrl: IMAGE_URL,
  timestamp: '2026-09-04T09:00:00Z',
};

const validVisionJson = JSON.stringify({
  hasImage: true,
  category: 'bags',
  brand: null,
  model: null,
  colors: ['black'],
  material: 'nylon',
  detectedText: ['NORTHFACE'],
  distinguishingFeatures: [
    'red rectangular sticker on front pocket',
    'tear near left shoulder strap',
  ],
  mentionedByUserNotVisible: [],
  confidence: 0.72,
});

function clientReturning(...contents: string[]): FeatherlessClient {
  const fn = vi.fn();
  for (const c of contents) {
    fn.mockResolvedValueOnce({ content: c, model: config.models.vision, finishReason: 'stop' });
  }
  if (contents.length === 1) {
    // default to the same response for any further (unexpected) calls
    fn.mockResolvedValue({
      content: contents[0],
      model: config.models.vision,
      finishReason: 'stop',
    });
  }
  return { chatCompletion: fn };
}

function deps(client: FeatherlessClient, extra: Partial<ImageUnderstandingDeps> = {}) {
  return { client, config, ...extra };
}

function fnOf(client: FeatherlessClient) {
  return client.chatCompletion as ReturnType<typeof vi.fn>;
}

describe('analyzeItemImage', () => {
  it('1. analyzes a valid image response', async () => {
    const client = clientReturning(validVisionJson);
    const attrs = await analyzeItemImage(reportWithImage, deps(client));

    expect(attrs.hasImage).toBe(true);
    expect(attrs.category).toBe('bags');
    expect(attrs.material).toBe('nylon');
    expect(attrs.confidence).toBe(0.72);
    expect(fnOf(client)).toHaveBeenCalledTimes(1);
  });

  it('2. sends the description as context and preserves observed-vs-mentioned distinction', async () => {
    const body = JSON.parse(validVisionJson);
    body.mentionedByUserNotVisible = ['red sticker (mentioned by user, not visible)'];
    const client = clientReturning(JSON.stringify(body));

    const attrs = await analyzeItemImage(reportWithImage, deps(client));
    expect(attrs.mentionedByUserNotVisible).toContain(
      'red sticker (mentioned by user, not visible)',
    );

    const call = fnOf(client).mock.calls[0][0];
    const textPart = call.messages[1].content[0];
    expect(textPart.type).toBe('text');
    expect(textPart.text).toContain('Black backpack');
    expect(textPart.text).toContain('CONTEXT ONLY');
  });

  it('3. returns hasImage:false and does NOT call the provider when no image', async () => {
    const client = clientReturning(validVisionJson);
    const noImage: Report = { ...reportWithImage, imageUrl: null };
    const attrs = await analyzeItemImage(noImage, deps(client));

    expect(attrs.hasImage).toBe(false);
    expect(attrs.colors).toEqual([]);
    expect(attrs.confidence).toBe(0);
    expect(fnOf(client)).not.toHaveBeenCalled();
  });

  it('4. treats an empty/whitespace image URL as no image', async () => {
    const client = clientReturning(validVisionJson);
    const attrs = await analyzeItemImage({ ...reportWithImage, imageUrl: '   ' }, deps(client));
    expect(attrs.hasImage).toBe(false);
    expect(fnOf(client)).not.toHaveBeenCalled();
  });

  it('5. returns valid detected text', async () => {
    const client = clientReturning(validVisionJson);
    const attrs = await analyzeItemImage(reportWithImage, deps(client));
    expect(attrs.detectedText).toEqual(['NORTHFACE']);
  });

  it('6. handles no detected text', async () => {
    const body = JSON.parse(validVisionJson);
    body.detectedText = [];
    const client = clientReturning(JSON.stringify(body));
    const attrs = await analyzeItemImage(reportWithImage, deps(client));
    expect(attrs.detectedText).toEqual([]);
  });

  it('7. captures distinctive visual characteristics', async () => {
    const client = clientReturning(validVisionJson);
    const attrs = await analyzeItemImage(reportWithImage, deps(client));
    expect(attrs.distinguishingFeatures).toContain('tear near left shoulder strap');
    expect(attrs.distinguishingFeatures).toContain('red rectangular sticker on front pocket');
  });

  it('8. throws on malformed (non-JSON) output after a stricter retry', async () => {
    const client = clientReturning('Sorry, I cannot analyze this.', 'Still no JSON here.');
    await expect(analyzeItemImage(reportWithImage, deps(client))).rejects.toBeInstanceOf(
      ImageUnderstandingError,
    );
    expect(fnOf(client)).toHaveBeenCalledTimes(2);
  });

  it('9. extracts JSON wrapped in a markdown code fence', async () => {
    const client = clientReturning('```json\n' + validVisionJson + '\n```');
    const attrs = await analyzeItemImage(reportWithImage, deps(client));
    expect(attrs.category).toBe('bags');
    expect(fnOf(client)).toHaveBeenCalledTimes(1);
  });

  it('10. rejects a structurally invalid response (wrong types)', async () => {
    const bad = JSON.stringify({ hasImage: true, colors: 'black', confidence: 0.5 });
    const client = clientReturning(bad, bad);
    await expect(analyzeItemImage(reportWithImage, deps(client))).rejects.toBeInstanceOf(
      ImageUnderstandingError,
    );
  });

  it('11. rejects a confidence value outside 0..1', async () => {
    const bad = JSON.stringify({ hasImage: true, category: 'bags', confidence: 1.5 });
    const client = clientReturning(bad, bad);
    await expect(analyzeItemImage(reportWithImage, deps(client))).rejects.toBeInstanceOf(
      ImageUnderstandingError,
    );
  });

  it('12. propagates Featherless provider failures without a service-level retry', async () => {
    const client: FeatherlessClient = {
      chatCompletion: vi.fn().mockRejectedValue(new FeatherlessServerError('500')),
    };
    await expect(analyzeItemImage(reportWithImage, deps(client))).rejects.toBeInstanceOf(
      FeatherlessServerError,
    );
    expect(fnOf(client)).toHaveBeenCalledTimes(1);
  });

  it('13. succeeds on the stricter retry after a first invalid response', async () => {
    const client = clientReturning('no json first time', validVisionJson);
    const attrs = await analyzeItemImage(reportWithImage, deps(client));
    expect(attrs.category).toBe('bags');
    expect(fnOf(client)).toHaveBeenCalledTimes(2);

    // The retry message tightens the instruction.
    const secondCall = fnOf(client).mock.calls[1][0];
    const lastMessage = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMessage.content).toContain('ONLY a single JSON object');
  });

  it('14. fails after the single retry is also invalid', async () => {
    const client = clientReturning('nope', 'still nope');
    await expect(analyzeItemImage(reportWithImage, deps(client))).rejects.toBeInstanceOf(
      ImageUnderstandingError,
    );
    expect(fnOf(client)).toHaveBeenCalledTimes(2);
  });

  it('15. passes the configured vision model (and honors an override)', async () => {
    const client = clientReturning(validVisionJson);
    await analyzeItemImage(reportWithImage, deps(client));
    expect(fnOf(client).mock.calls[0][0].model).toBe('google/gemma-3-27b-it');

    const client2 = clientReturning(validVisionJson);
    await analyzeItemImage(reportWithImage, deps(client2, { model: 'Custom/Vision-1' }));
    expect(fnOf(client2).mock.calls[0][0].model).toBe('Custom/Vision-1');
  });

  it('16. passes image_url using the documented provider format (text first, then image)', async () => {
    const client = clientReturning(validVisionJson);
    await analyzeItemImage(reportWithImage, deps(client));

    const content = fnOf(client).mock.calls[0][0].messages[1].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0].type).toBe('text');
    expect(content[1].type).toBe('image_url');
    expect(content[1].image_url).toEqual({ url: IMAGE_URL });
  });

  it('17. never leaks the API key in returned data or errors', async () => {
    const okClient = clientReturning(validVisionJson);
    const attrs = await analyzeItemImage(reportWithImage, deps(okClient));
    expect(JSON.stringify(attrs)).not.toContain(SECRET);

    const badClient = clientReturning('nope', 'nope');
    const error = await analyzeItemImage(reportWithImage, deps(badClient)).catch((e) => e);
    const serialized = [error.message, error.stack ?? '', JSON.stringify({ m: error.message })].join(
      '\n',
    );
    expect(serialized).not.toContain(SECRET);
  });

  it('forces hasImage:true even if the model reports false (service is authoritative)', async () => {
    const body = JSON.parse(validVisionJson);
    body.hasImage = false;
    const client = clientReturning(JSON.stringify(body));
    const attrs = await analyzeItemImage(reportWithImage, deps(client));
    expect(attrs.hasImage).toBe(true);
  });
});
