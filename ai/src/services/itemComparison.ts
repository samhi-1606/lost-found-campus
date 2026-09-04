/**
 * AI item comparison service.
 *
 * SERVER-ONLY. Compares the structured attributes of a LOST item and a FOUND
 * item and returns structured `AIComparison` EVIDENCE. It does NOT decide a
 * match and NEVER decides ownership — that is `matchDecision.ts`'s job.
 *
 * Uses the shared Featherless client (no HTTP duplication). Only the minimum,
 * non-sensitive structured attributes are sent to the model: no API keys,
 * credentials, tokens, coordinates, verification data, or contact info.
 */

import type { AiConfig } from '../config.js';
import type { AIComparison, ImageAttributes, ItemAttributes, LocationResult } from '../domain/types.js';
import { aiComparisonSchema } from '../domain/schemas.js';
import type { FeatherlessClient } from '../featherless/client.js';
import type { ChatMessage } from '../featherless/types.js';
import {
  ITEM_COMPARISON_PROMPT_VERSION,
  ITEM_COMPARISON_STRICT_RETRY_INSTRUCTION,
  ITEM_COMPARISON_SYSTEM_PROMPT,
  buildItemComparisonUserPrompt,
  type ComparisonPromptSide,
} from '../prompts/itemComparison.js';
import { extractJsonObject } from '../utils/json.js';

/** Thrown when the AI comparison output cannot be parsed/validated. */
export class ItemComparisonError extends Error {
  readonly promptVersion: string;

  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ItemComparisonError';
    this.promptVersion = ITEM_COMPARISON_PROMPT_VERSION;
  }
}

/** One side of a comparison: structured attributes produced by earlier services. */
export interface ComparisonItem {
  type?: 'lost' | 'found';
  attributes: ItemAttributes;
  image?: ImageAttributes | null;
  location?: LocationResult | null;
  timestamp?: string | null;
}

export interface ItemComparisonDeps {
  client: FeatherlessClient;
  config: AiConfig;
  /** Optional model override; defaults to `config.models.comparison`. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_MAX_TOKENS = 900;

/**
 * Project a comparison item into a coarse, non-sensitive summary for the prompt.
 * Location is reduced to landmark/zone/confidence — never coordinates or the
 * exact found location.
 */
function toPromptSide(item: ComparisonItem): ComparisonPromptSide {
  return {
    type: item.type,
    attributes: item.attributes,
    image: item.image ?? null,
    location: item.location
      ? {
          landmarkName: item.location.landmarkName,
          zone: item.location.zone,
          confidence: item.location.confidence,
        }
      : null,
    time: item.timestamp ?? null,
  };
}

/**
 * Compare a LOST and a FOUND item and return structured evidence.
 * Works with or without image evidence. One stricter retry on invalid output,
 * then throws `ItemComparisonError`. Provider/network errors propagate.
 */
export async function compareItems(
  lost: ComparisonItem,
  found: ComparisonItem,
  deps: ItemComparisonDeps,
): Promise<AIComparison> {
  const model = deps.model ?? deps.config.models.comparison;
  const temperature = deps.temperature ?? 0;
  const maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;

  const messages: ChatMessage[] = [
    { role: 'system', content: ITEM_COMPARISON_SYSTEM_PROMPT },
    {
      role: 'user',
      content: buildItemComparisonUserPrompt(toPromptSide(lost), toPromptSide(found)),
    },
  ];

  const maxAttempts = 2; // initial + one stricter retry
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await deps.client.chatCompletion({ model, messages, temperature, maxTokens });
    const json = extractJsonObject(result.content);
    if (json !== undefined) {
      const parsed = aiComparisonSchema.safeParse(json);
      if (parsed.success) return parsed.data;
    }
    if (attempt === 0) {
      messages.push({ role: 'user', content: ITEM_COMPARISON_STRICT_RETRY_INSTRUCTION });
    }
  }

  throw new ItemComparisonError(
    'AI item comparison returned invalid output after a stricter retry.',
  );
}
