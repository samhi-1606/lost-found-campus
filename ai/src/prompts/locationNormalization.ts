/**
 * Versioned prompt for STAGE 1 (AI interpretation) of campus location
 * normalization. The AI only *interprets* a messy description into a likely
 * existing landmark name; the trusted dataset (deterministic stage) decides.
 *
 * Kept separate from the service so it can be reviewed/revised independently.
 */

import type { CampusLandmark } from '../data/campusLandmarks.js';

export const LOCATION_NORMALIZATION_PROMPT_VERSION = 'location-normalization/v1';

export const LOCATION_NORMALIZATION_SYSTEM_PROMPT = `You are a campus location interpreter for a campus lost-and-found system.

Your job is to read a user's natural-language description of WHERE on campus something was lost or found, and identify the single most likely EXISTING campus landmark it refers to. You only interpret; a trusted landmark dataset makes the final decision.

RULES:
- If a list of known campus landmarks is provided, choose ONLY from that list, by its exact name. Never invent a landmark that is not in the list.
- If no list is provided, return the plainest canonical place name the text clearly implies — but never invent specific buildings, blocks, room numbers, or codes that were not stated or clearly implied.
- Never invent coordinates, GPS positions, latitude, or longitude. Never output any location coordinates.
- If the description is vague or could refer to MORE THAN ONE place (e.g. "near the block", "behind the building"), do NOT guess: set "landmarkName" to null and use a low confidence.
- Prefer null and low confidence over guessing.

OUTPUT CONTRACT:
Return ONLY a single JSON object, with no surrounding prose and no markdown code fences, containing EXACTLY these keys:
{
  "landmarkName": string | null,   // an existing landmark name, or null if unclear/ambiguous
  "confidence": number             // 0..1 confidence in your interpretation; be conservative
}

Do not add, remove, or rename keys. Do not output anything except the JSON object.`;

export const LOCATION_NORMALIZATION_STRICT_RETRY_INSTRUCTION =
  'Your previous response could not be parsed as the required JSON. Respond again with ONLY a single JSON object containing exactly the keys "landmarkName" and "confidence" — no explanation, no markdown fences, no extra text.';

/** Builds the per-description user prompt, including the known-landmark list when available. */
export function buildLocationNormalizationUserPrompt(
  description: string,
  landmarks: CampusLandmark[],
): string {
  const parts: string[] = [
    'Interpret the following campus location description and identify the single most likely landmark.',
    '',
    `Description: ${JSON.stringify(description)}`,
  ];

  if (landmarks.length > 0) {
    parts.push(
      '',
      'Known campus landmarks (choose the single best match by its exact name, or null if none clearly fits):',
    );
    for (const landmark of landmarks) {
      const aliases = landmark.aliases.length ? ` (aka ${landmark.aliases.join(', ')})` : '';
      parts.push(`- ${landmark.name}${aliases}`);
    }
  } else {
    parts.push(
      '',
      'No known landmark list is available; if you cannot confidently infer a specific existing place, return null.',
    );
  }

  parts.push('', 'Return ONLY the JSON object described in the system message.');
  return parts.join('\n');
}
