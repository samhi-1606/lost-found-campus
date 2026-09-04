import { describe, it, expect, vi } from 'vitest';
import { loadConfig, type AiConfig } from '../src/config.js';
import type { Report } from '../src/domain/types.js';
import type { FeatherlessClient } from '../src/featherless/client.js';
import { FeatherlessRateLimitError } from '../src/featherless/types.js';
import {
  extractItemAttributes,
  AttributeExtractionError,
  type AttributeExtractionDeps,
} from '../src/services/attributeExtraction.js';

const config: AiConfig = loadConfig({
  FEATHERLESS_API_KEY: 'test-key',
  FEATHERLESS_TEXT_MODEL: 'Qwen/Qwen2.5-32B-Instruct',
});

const report: Report = {
  id: 'r1',
  type: 'lost',
  description:
    'Black iPhone 13 with a cracked top-left corner and a blue cat sticker on the back. Initials "JS" engraved near the camera.',
  locationDescription: 'Main Library, 2nd floor',
  timestamp: '2026-09-03T10:00:00Z',
};

const fullAttributesJson = JSON.stringify({
  category: 'electronics',
  brand: 'Apple',
  model: 'iPhone 13',
  colors: ['black'],
  material: null,
  identifiers: ['engraved initials JS'],
  distinguishingFeatures: ['cracked top-left corner', 'blue cat sticker on back'],
  keywords: ['phone', 'iphone'],
  confidence: 0.7,
});

function mockClient(content: string): FeatherlessClient {
  return {
    chatCompletion: vi.fn().mockResolvedValue({
      content,
      model: config.models.text,
      finishReason: 'stop',
    }),
  };
}

function deps(client: FeatherlessClient, extra: Partial<AttributeExtractionDeps> = {}) {
  return { client, config, ...extra };
}

describe('extractItemAttributes', () => {
  it('parses and validates a clean JSON response', async () => {
    const client = mockClient(fullAttributesJson);
    const attrs = await extractItemAttributes(report, deps(client));

    expect(attrs.category).toBe('electronics');
    expect(attrs.brand).toBe('Apple');
    expect(attrs.model).toBe('iPhone 13');
    expect(attrs.distinguishingFeatures).toContain('blue cat sticker on back');
    expect(attrs.confidence).toBe(0.7);
  });

  it('passes the configured text model, temperature 0, and the report text to the client', async () => {
    const client = mockClient(fullAttributesJson);
    await extractItemAttributes(report, deps(client));

    const call = (client.chatCompletion as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.model).toBe('Qwen/Qwen2.5-32B-Instruct');
    expect(call.temperature).toBe(0);
    expect(call.messages[0].role).toBe('system');
    expect(call.messages[0].content).toContain(
      'item analysis engine for a campus lost-and-found system',
    );
    expect(call.messages[1].role).toBe('user');
    expect(call.messages[1].content).toContain('cracked top-left corner');
    // Location is provided only as context, explicitly not an item attribute.
    expect(call.messages[1].content).toContain('context only, not an item attribute');
  });

  it('applies schema defaults when optional fields are omitted', async () => {
    const client = mockClient(JSON.stringify({ category: 'other', confidence: 0.2 }));
    const attrs = await extractItemAttributes(report, deps(client));

    expect(attrs.brand).toBeNull();
    expect(attrs.model).toBeNull();
    expect(attrs.material).toBeNull();
    expect(attrs.colors).toEqual([]);
    expect(attrs.identifiers).toEqual([]);
    expect(attrs.distinguishingFeatures).toEqual([]);
    expect(attrs.keywords).toEqual([]);
  });

  it('extracts JSON wrapped in a markdown code fence', async () => {
    const client = mockClient('```json\n' + fullAttributesJson + '\n```');
    const attrs = await extractItemAttributes(report, deps(client));
    expect(attrs.brand).toBe('Apple');
  });

  it('extracts JSON preceded by prose and followed by trailing text', async () => {
    const client = mockClient(`Here is the JSON:\n${fullAttributesJson}\nHope this helps!`);
    const attrs = await extractItemAttributes(report, deps(client));
    expect(attrs.model).toBe('iPhone 13');
  });

  it('strips unexpected extra keys', async () => {
    const client = mockClient(
      JSON.stringify({ category: 'bags', confidence: 0.5, injected: 'nope' }),
    );
    const attrs = await extractItemAttributes(report, deps(client));
    expect((attrs as Record<string, unknown>).injected).toBeUndefined();
    expect(attrs.category).toBe('bags');
  });

  it('rejects a confidence value outside 0..1', async () => {
    const client = mockClient(JSON.stringify({ category: 'electronics', confidence: 1.5 }));
    await expect(extractItemAttributes(report, deps(client))).rejects.toBeInstanceOf(
      AttributeExtractionError,
    );
  });

  it('rejects an empty category', async () => {
    const client = mockClient(JSON.stringify({ category: '', confidence: 0.5 }));
    await expect(extractItemAttributes(report, deps(client))).rejects.toBeInstanceOf(
      AttributeExtractionError,
    );
  });

  it('throws AttributeExtractionError on non-JSON output', async () => {
    const client = mockClient('I could not analyze this item.');
    await expect(extractItemAttributes(report, deps(client))).rejects.toBeInstanceOf(
      AttributeExtractionError,
    );
  });

  it('uses an explicit model override when provided', async () => {
    const client = mockClient(fullAttributesJson);
    await extractItemAttributes(report, deps(client, { model: 'Custom/Model-1' }));
    const call = (client.chatCompletion as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.model).toBe('Custom/Model-1');
  });

  it('propagates Featherless client errors unchanged', async () => {
    const client: FeatherlessClient = {
      chatCompletion: vi.fn().mockRejectedValue(new FeatherlessRateLimitError('429')),
    };
    await expect(extractItemAttributes(report, deps(client))).rejects.toBeInstanceOf(
      FeatherlessRateLimitError,
    );
  });
});
