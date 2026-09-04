/**
 * Safe JSON extraction for untrusted model output.
 *
 * Models sometimes wrap JSON in markdown code fences or add surrounding prose
 * (e.g. "Here is the JSON:\n{ ... }"). This locates a single JSON object and
 * parses it, returning `undefined` when none can be parsed. It never throws, so
 * each caller can raise its own typed, domain-specific error.
 */
export function extractJsonObject(text: string): unknown | undefined {
  if (typeof text !== 'string' || text.length === 0) return undefined;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return undefined;

  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return undefined;
  }
}
