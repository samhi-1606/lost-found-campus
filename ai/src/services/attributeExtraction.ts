/**
 * TEXT-ONLY item attribute extraction service.
 *
 * SERVER-ONLY. Turns a generic `Report` into validated `ItemAttributes` by
 * calling the shared Featherless client (no HTTP logic is duplicated here) and
 * validating the model's JSON against the canonical `itemAttributesSchema`.
 *
 * This increment does NOT do image understanding, location, matching, scoring,
 * verification, or release — only attribute extraction.
 */

import type { AiConfig } from '../config.js';
import type { ItemAttributes, Report } from '../domain/types.js';
import { itemAttributesSchema } from '../domain/schemas.js';
import type { FeatherlessClient } from '../featherless/client.js';
import type { ChatMessage } from '../featherless/types.js';
import {
  ATTRIBUTE_EXTRACTION_PROMPT_VERSION,
  ATTRIBUTE_EXTRACTION_SYSTEM_PROMPT,
  buildAttributeExtractionUserPrompt,
} from '../prompts/attributeExtraction.js';

/** Thrown when the model output cannot be parsed/validated into ItemAttributes. */
export class AttributeExtractionError extends Error {
  readonly promptVersion: string;

  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AttributeExtractionError';
    this.promptVersion = ATTRIBUTE_EXTRACTION_PROMPT_VERSION;
  }
}

export interface AttributeExtractionDeps {
  client: FeatherlessClient;
  config: AiConfig;
  /** Optional model override; defaults to `config.models.text`. */
  model?: string;
  /** Low temperature keeps extraction deterministic; defaults to 0. */
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_MAX_TOKENS = 700;

/**
 * Extract structured, factual `ItemAttributes` from a report's text.
 *
 * Flow: build prompt → call Featherless → safely locate the JSON object in the
 * text → parse → validate with the canonical Zod schema → return, or throw
 * `AttributeExtractionError` on invalid output. Raw model output is never
 * trusted directly.
 */
export async function extractItemAttributes(
  report: Report,
  deps: AttributeExtractionDeps,
): Promise<ItemAttributes> {
  const model = deps.model ?? deps.config.models.text;
  const messages: ChatMessage[] = [
    { role: 'system', content: ATTRIBUTE_EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: buildAttributeExtractionUserPrompt(report) },
  ];

  const result = await deps.client.chatCompletion({
    model,
    messages,
    temperature: deps.temperature ?? 0,
    maxTokens: deps.maxTokens ?? DEFAULT_MAX_TOKENS,
  });

  const json = extractJsonObject(result.content);

  const parsed = itemAttributesSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new AttributeExtractionError(
      `Model output failed ItemAttributes validation: ${issues}`,
    );
  }

  return parsed.data;
}

/**
 * Safely locate and parse a single JSON object from model text.
 *
 * Tolerates common wrappers such as markdown code fences and leading prose
 * (e.g. "Here is the JSON:\n{ ... }") by preferring a fenced block if present,
 * then taking the outermost {...} span. Throws `AttributeExtractionError` when
 * no valid JSON object can be found.
 */
function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new AttributeExtractionError('No JSON object found in the model output.');
  }

  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (err) {
    throw new AttributeExtractionError('Model output was not valid JSON.', { cause: err });
  }
}
