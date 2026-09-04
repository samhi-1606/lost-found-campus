/**
 * Image / multimodal item understanding service.
 *
 * SERVER-ONLY. Sends an item image (and optional description as context) to a
 * Featherless vision-capable model and returns validated `ImageAttributes`.
 * Uses the shared Featherless client — no HTTP logic is duplicated here.
 *
 * This increment does NOT do matching, scoring, location, verification, or
 * release — only image → visual attributes.
 *
 * MODEL: the vision model comes from `config.models.vision` (default
 * `google/gemma-3-27b-it`). That model is vision-capable per the Featherless
 * catalog (`features.image_input: true`, `vision_supported: true`), but it is a
 * gated model and its availability on the team's plan must be confirmed with an
 * authenticated `GET /v1/models?available_on_current_plan=true`. The model is
 * kept configurable and is never silently substituted.
 */

import type { AiConfig } from '../config.js';
import type { ImageAttributes, Report } from '../domain/types.js';
import { imageAttributesSchema } from '../domain/schemas.js';
import type { FeatherlessClient } from '../featherless/client.js';
import type { ChatMessage } from '../featherless/types.js';
import {
  IMAGE_UNDERSTANDING_PROMPT_VERSION,
  IMAGE_UNDERSTANDING_STRICT_RETRY_INSTRUCTION,
  IMAGE_UNDERSTANDING_SYSTEM_PROMPT,
  buildImageUnderstandingUserText,
} from '../prompts/imageUnderstanding.js';
import { extractJsonObject } from '../utils/json.js';

/** Thrown when the model output cannot be parsed/validated into ImageAttributes. */
export class ImageUnderstandingError extends Error {
  readonly promptVersion: string;

  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ImageUnderstandingError';
    this.promptVersion = IMAGE_UNDERSTANDING_PROMPT_VERSION;
  }
}

export interface ImageUnderstandingDeps {
  client: FeatherlessClient;
  config: AiConfig;
  /** Optional model override; defaults to `config.models.vision`. */
  model?: string;
  /** Low temperature keeps extraction stable; defaults to 0. */
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_MAX_TOKENS = 800;

/** The deterministic result when no image is available (no API call is made). */
function emptyImageAttributes(): ImageAttributes {
  return {
    hasImage: false,
    category: null,
    brand: null,
    model: null,
    colors: [],
    material: null,
    detectedText: [],
    distinguishingFeatures: [],
    mentionedByUserNotVisible: [],
    confidence: 0,
  };
}

/**
 * Analyze a report's image and return validated `ImageAttributes`.
 *
 * If the report has no usable image URL, returns `hasImage: false` WITHOUT
 * calling the provider. Otherwise sends text-first + image content to the
 * vision model, then safely parses and validates the JSON. On invalid output it
 * allows exactly ONE stricter retry before throwing `ImageUnderstandingError`.
 */
export async function analyzeItemImage(
  report: Report,
  deps: ImageUnderstandingDeps,
): Promise<ImageAttributes> {
  const imageUrl = report.imageUrl?.trim();
  if (!imageUrl) {
    return emptyImageAttributes();
  }

  const model = deps.model ?? deps.config.models.vision;
  const temperature = deps.temperature ?? 0;
  const maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;

  // Text first, then the image — per the documented Featherless vision format.
  const messages: ChatMessage[] = [
    { role: 'system', content: IMAGE_UNDERSTANDING_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: buildImageUnderstandingUserText(report) },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    },
  ];

  const maxAttempts = 2; // initial attempt + at most one stricter retry
  let lastFailure = '';
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // Provider/network errors are NOT caught here — they propagate as typed
    // Featherless errors (the client already handles their own retries).
    const result = await deps.client.chatCompletion({ model, messages, temperature, maxTokens });

    const validated = tryValidate(result.content);
    if (validated) {
      return validated;
    }

    lastFailure = 'model output could not be parsed/validated as ImageAttributes';
    if (attempt === 0) {
      // Tighten the instruction and try exactly once more.
      messages.push({ role: 'user', content: IMAGE_UNDERSTANDING_STRICT_RETRY_INSTRUCTION });
    }
  }

  throw new ImageUnderstandingError(
    `Image understanding failed after a stricter retry: ${lastFailure}.`,
  );
}

/**
 * Parse + validate model text into `ImageAttributes`, or return null on failure.
 * `hasImage` is authoritative from the service (an image was sent), so it is
 * forced to true rather than trusted from the model.
 */
function tryValidate(content: string): ImageAttributes | null {
  const json = extractJsonObject(content);
  if (json === undefined || typeof json !== 'object' || json === null) {
    return null;
  }

  (json as Record<string, unknown>).hasImage = true;

  const parsed = imageAttributesSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
