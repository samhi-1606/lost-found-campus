/**
 * Deterministic attribute-comparison helpers for candidate ranking.
 *
 * Pure functions only — no AI, no network, no Firebase, no React. Used to
 * compare coarse structured attributes without inventing a large taxonomy.
 */

const VALUE_UNKNOWN = new Set(['', 'unknown', 'n a', 'na', 'none', 'null', 'unspecified']);
const CATEGORY_UNKNOWN = new Set([
  '',
  'other',
  'unknown',
  'misc',
  'miscellaneous',
  'general',
  'item',
]);

/**
 * Small, intentionally-limited alias groups for common campus item categories.
 * This is a heuristic, NOT a taxonomy: it only exists so obviously-related
 * category words are treated as compatible and obviously-different ones can be
 * filtered. Categories not present here are treated as "unknown relation" (never
 * eliminated). Ambiguous words (e.g. bare "notebook") are deliberately omitted.
 */
export const CATEGORY_GROUPS: Record<string, string[]> = {
  computer: ['laptop', 'notebook computer', 'macbook', 'computer', 'chromebook', 'ultrabook'],
  phone: ['phone', 'mobile', 'smartphone', 'iphone', 'cellphone', 'mobile phone'],
  bag: ['bag', 'backpack', 'rucksack', 'handbag', 'tote', 'satchel', 'bags'],
  bottle: ['bottle', 'water bottle', 'flask', 'tumbler', 'thermos'],
  keys: ['key', 'keys', 'keychain', 'keyring'],
  wallet: ['wallet', 'purse'],
  headphones: ['headphones', 'earphones', 'earbuds', 'airpods', 'headset'],
  book: ['book', 'textbook'],
  idcard: ['id card', 'student id', 'identity card', 'id'],
  clothing: ['jacket', 'coat', 'hoodie', 'sweater', 'clothing', 'clothes'],
  umbrella: ['umbrella'],
  watch: ['watch', 'wristwatch', 'smartwatch'],
  glasses: ['glasses', 'spectacles', 'sunglasses', 'eyeglasses'],
};

/** Generic descriptive words excluded from "distinctive" token overlap. */
const STOPWORDS = new Set([
  'black', 'white', 'blue', 'green', 'yellow', 'brown', 'grey', 'gray', 'silver',
  'gold', 'orange', 'purple', 'pink', 'beige', 'dark', 'light', 'plain',
  'large', 'small', 'medium', 'tiny', 'huge', 'mini', 'size', 'sized',
  'with', 'near', 'from', 'that', 'this', 'have', 'some', 'very',
  'front', 'back', 'side', 'left', 'right', 'top', 'bottom', 'over', 'under',
  'item', 'thing', 'object', 'colour', 'color',
]);

const REVERSE_CATEGORY = buildReverseCategory();

function buildReverseCategory(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [group, aliases] of Object.entries(CATEGORY_GROUPS)) {
    for (const alias of aliases) {
      map.set(normalizeToken(alias), group);
    }
  }
  return map;
}

export function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a scalar attribute carries usable (non-empty, non-"unknown") info. */
export function isKnownValue(value: string | null | undefined): value is string {
  if (value == null) return false;
  return !VALUE_UNKNOWN.has(normalizeToken(value));
}

/** Case/punctuation-insensitive equality; assumes both values are known. */
export function normEqual(a: string, b: string): boolean {
  return normalizeToken(a) === normalizeToken(b);
}

/** Normalized, de-duplicated intersection of two string lists. */
export function overlapValues(a: string[], b: string[]): string[] {
  const other = new Set(b.map(normalizeToken).filter((x) => x.length > 0));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of a) {
    const norm = normalizeToken(value);
    if (norm && other.has(norm) && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

function tokenize(phrases: string[]): string[] {
  const tokens: string[] = [];
  for (const phrase of phrases) {
    for (const word of normalizeToken(phrase).split(' ')) {
      if (word.length >= 4 && !STOPWORDS.has(word)) tokens.push(word);
    }
  }
  return tokens;
}

/** Significant (non-generic) tokens shared between two sets of phrases. */
export function sharedSignificantTokens(a: string[], b: string[]): string[] {
  const other = new Set(tokenize(b));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokenize(a)) {
    if (other.has(token) && !seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

function categoryKnown(norm: string): boolean {
  return norm !== '' && !CATEGORY_UNKNOWN.has(norm);
}

function categoryGroup(norm: string): string | null {
  return REVERSE_CATEGORY.get(norm) ?? null;
}

/**
 * Coarse category relationship:
 *  - 'match'        equal, or both map to the same alias group
 *  - 'incompatible' both are known AND map to DIFFERENT known groups (strong)
 *  - 'unknown'      either is unknown/"other", or at least one is unmapped
 * Elimination should only occur on 'incompatible'.
 */
export function categoryRelation(
  a: string | null,
  b: string | null,
): 'match' | 'incompatible' | 'unknown' {
  const na = normalizeToken(a ?? '');
  const nb = normalizeToken(b ?? '');
  if (!categoryKnown(na) || !categoryKnown(nb)) return 'unknown';
  if (na === nb) return 'match';
  const ga = categoryGroup(na);
  const gb = categoryGroup(nb);
  if (ga && gb) return ga === gb ? 'match' : 'incompatible';
  return 'unknown';
}
