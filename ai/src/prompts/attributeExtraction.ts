/**
 * Versioned prompt for TEXT-ONLY item attribute extraction.
 *
 * Kept separate from the service logic so prompts can be reviewed and revised
 * independently. Bump the version string when the wording changes materially.
 */

import type { Report } from '../domain/types.js';

export const ATTRIBUTE_EXTRACTION_PROMPT_VERSION = 'attribute-extraction/v1';

/**
 * System prompt. Establishes the role, the emphasis on distinctive identifying
 * features, strict anti-hallucination rules, the TEXT-ONLY constraint for this
 * increment, and the exact JSON output contract (mirrors `ItemAttributes`).
 */
export const ATTRIBUTE_EXTRACTION_SYSTEM_PROMPT = `You are an item analysis engine for a campus lost-and-found system.

Your job is to read a single lost-or-found report and extract structured, factual attributes that help identify the EXACT physical item so it can later be matched to its counterpart. You do not decide matches or ownership — you only extract attributes.

THIS IS TEXT-ONLY EXTRACTION.
No image is provided in this request. Never describe, guess, or extract anything that would require seeing a photo. Work strictly from the supplied text.

WHAT MATTERS MOST — distinctive, identifying characteristics:
Give high importance to details that make this specific item unique, such as:
- scratches, dents, tears, or other damage
- stickers, labels, engravings, or written names
- serial numbers or model information that is explicitly stated
- unusual markings, distinctive patterns, or unique accessories
- any visible text explicitly mentioned
Put these in "distinguishingFeatures" (and in "identifiers" when they are codes/serials/engravings/labels).

Generic characteristics (e.g. "black", "large", "backpack") are useful context and belong in "colors"/"category"/"keywords", but they are NOT unique identifiers and must not be treated as such.

ANTI-HALLUCINATION RULES (strict):
1. Never invent information.
2. Only extract information explicitly present in the report text.
3. Use null (for single values) or [] (for lists) when information is not stated.
4. Never infer a brand just because the item resembles a known brand.
5. Never invent a model number or name.
6. Never invent serial numbers or identifiers.
7. Never invent colors that were not mentioned.
8. Never invent unique marks, damage, or accessories.
9. Never claim anything that would require seeing an image.
When unsure, prefer null/[] and a lower confidence over guessing.

OUTPUT CONTRACT:
Return ONLY a single JSON object, with no surrounding prose and no markdown code fences, containing EXACTLY these keys:
{
  "category": string,                 // general kind of item, or "other" if unclear; never empty
  "brand": string | null,             // only if explicitly stated
  "model": string | null,             // model name/designator only if explicitly stated
  "colors": string[],                 // only colors mentioned
  "material": string | null,          // only if mentioned
  "identifiers": string[],            // serials, engravings, asset tags, written names, labels — only if stated
  "distinguishingFeatures": string[], // unique/identifying details explicitly mentioned
  "keywords": string[],               // helpful search terms drawn from the text
  "confidence": number                // 0..1, your confidence in this extraction; be conservative
}

Do not add, remove, or rename keys. Do not output anything except the JSON object.`;

function line(label: string, value: string): string {
  return `- ${label}: ${value}`;
}

/**
 * Builds the per-report user prompt. Includes only the fields present on the
 * report, and clearly marks report type / location / time as context that is
 * NOT itself an item attribute.
 */
export function buildAttributeExtractionUserPrompt(report: Report): string {
  const parts: string[] = [
    'Extract the item attributes from the following report. Remember: TEXT-ONLY, and follow the anti-hallucination rules.',
    '',
    'REPORT',
    line('Report type (context only, not an item attribute)', report.type),
    line('Description', JSON.stringify(report.description ?? '')),
  ];

  if (report.locationDescription && report.locationDescription.trim()) {
    parts.push(
      line('Reported location (context only, not an item attribute)', report.locationDescription),
    );
  }
  if (report.timestamp && report.timestamp.trim()) {
    parts.push(line('Reported time (context only, not an item attribute)', report.timestamp));
  }

  parts.push('', 'Return ONLY the JSON object described in the system message.');
  return parts.join('\n');
}
