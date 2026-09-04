/**
 * Featherless AI integration smoke test.
 *
 * SERVER-ONLY. Exercises the EXISTING AI layer end to end against the REAL
 * Featherless API with deterministic demo data:
 *
 *   1. Featherless connectivity          5. Campus location normalization
 *   2. Demo lost & found reports         6. Candidate ranking
 *   3. Text attribute extraction         7. Item comparison
 *   4. Image understanding               8. Deterministic match decision
 *
 * Nothing is mocked and no AI response is hard-coded: every attribute set,
 * comparison, and (when a fixture exists) image analysis comes from the live
 * provider. Only the INPUT data is fixed. Each stage reuses the shipped service
 * rather than re-implementing it, and each AI result is re-validated against the
 * canonical Zod schema, because the point is schema/type conformance and a
 * completed pipeline — never an exact score.
 *
 * SECURITY: the API key is read from the environment via the existing config
 * and used only inside the shared client. This script prints whether a key is
 * present, never its value, and it redacts the key from anything it prints.
 * Provider error text is sanitized before being shown.
 *
 * Usage (the key comes from your environment/secret, never from source):
 *   npm run smoke                # builds first, then runs this script
 *   # or, after `npm run build`:
 *   node scripts/featherless-smoke.mjs
 *
 * Runs against the compiled output in ../dist, so build before running.
 *
 * Exit code: 0 when no stage FAILed (a SKIPPED vision stage or a WARN does not
 * fail the run), 1 otherwise.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  aiComparisonSchema,
  analyzeItemImage,
  calculateMatchDecision,
  compareItems,
  createFeatherlessClient,
  extractItemAttributes,
  hasApiKey,
  imageAttributesSchema,
  itemAttributesSchema,
  loadConfig,
  locationResultSchema,
  matchDecisionSchema,
  normalizeCampusLocation,
  rankCandidates,
} from '../dist/index.js';

/**
 * The large comparison model is slow to warm up and regularly needs more than
 * the 30s production default. The smoke test widens the timeout and retry
 * budget through the existing configuration surface only — no service is
 * changed, and a real environment value always wins.
 */
const SMOKE_DEFAULT_TIMEOUT_MS = 90_000;
const SMOKE_DEFAULT_MAX_RETRIES = 3;

function loadSmokeConfig() {
  const env = { ...process.env };
  if (!env.FEATHERLESS_TIMEOUT_MS?.trim()) {
    env.FEATHERLESS_TIMEOUT_MS = String(SMOKE_DEFAULT_TIMEOUT_MS);
  }
  if (!env.FEATHERLESS_MAX_RETRIES?.trim()) {
    env.FEATHERLESS_MAX_RETRIES = String(SMOKE_DEFAULT_MAX_RETRIES);
  }
  return loadConfig(env);
}

const config = loadSmokeConfig();

// ---------------------------------------------------------------------------
// Deterministic demo data
// ---------------------------------------------------------------------------

/**
 * `title` and `category` are backend-side metadata: the AI layer's `Report`
 * contract deliberately carries neither, and extraction infers the category
 * from the text. They are kept here so the demo mirrors a real submission.
 */
const LOST_ITEM = {
  id: 'demo-lost-001',
  title: 'Black water bottle',
  category: 'water bottle',
  description:
    'Black Hydro Flask water bottle with a silver sticker near the bottom. ' +
    'I lost it near the Library.',
  locationText: 'near the Library',
  timestamp: '2026-09-01T13:45:00.000Z',
};

const FOUND_ITEM = {
  id: 'demo-found-001',
  title: 'Black Hydro Flask bottle',
  category: 'water bottle',
  description:
    'Black Hydro Flask bottle with a silver sticker near the bottom. Found near the Library.',
  locationText: 'Library',
  timestamp: '2026-09-01T17:20:00.000Z',
};

/** Maps a demo item onto the AI layer's generic `Report` contract. */
function toReport(item, type, imageUrl = null) {
  return {
    id: item.id,
    type,
    description: item.description,
    imageUrl,
    locationDescription: item.locationText,
    timestamp: item.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Reporting (safe output only)
// ---------------------------------------------------------------------------

/** Removes the key if it ever reaches a printable string (defence in depth). */
function redact(text) {
  const key = config.apiKey;
  return key && text.includes(key) ? text.split(key).join('[REDACTED]') : text;
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const LEVEL_RANK = { PASS: 0, SKIP: 1, WARN: 1, FAIL: 2 };
const stages = [];

function beginStage(number, title) {
  const stage = { number, title, checks: [] };
  stages.push(stage);
  console.log(`\n=== Stage ${number}/8 — ${title} ===`);
  const record = (level, message) => {
    stage.checks.push({ level, message });
    console.log(`  ${level}: ${redact(message)}`);
  };
  stage.pass = (message) => record('PASS', message);
  stage.warn = (message) => record('WARN', message);
  stage.fail = (message) => record('FAIL', message);
  stage.skip = (message) => record('SKIP', message);
  stage.info = (label, value) => console.log(`    ${label}: ${redact(JSON.stringify(value))}`);
  return stage;
}

/** A stage's verdict is its worst individual check. */
function stageVerdict(stage) {
  return stage.checks.reduce(
    (worst, check) => (LEVEL_RANK[check.level] > LEVEL_RANK[worst] ? check.level : worst),
    'PASS',
  );
}

/**
 * Builds a safe description of a thrown error. The client already redacts the
 * key from provider text; this redacts again and truncates before printing, so
 * no raw provider payload is echoed.
 */
function describeError(err) {
  if (!(err instanceof Error)) return redact(truncate(String(err), 200));
  const status = typeof err.status === 'number' ? ` status=${err.status}` : '';
  const provider =
    typeof err.providerMessage === 'string' && err.providerMessage
      ? ` provider="${truncate(err.providerMessage, 200)}"`
      : '';
  return redact(`${err.name}: ${err.message}${status}${provider}`);
}

/**
 * Re-validates a service result against the canonical schema. Services already
 * validate internally; doing it again here is the actual assertion this smoke
 * test makes — the shape is correct, whatever the model happened to say.
 */
function validate(stage, schema, value, label) {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    stage.pass(`${label} conforms to its schema`);
    return true;
  }
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  stage.fail(`${label} failed schema validation: ${issues}`);
  return false;
}

// ---------------------------------------------------------------------------
// Safe summaries of AI output
// ---------------------------------------------------------------------------

function summarizeAttributes(attributes) {
  return {
    category: attributes.category,
    brand: attributes.brand,
    model: attributes.model,
    colors: attributes.colors,
    material: attributes.material,
    identifiers: attributes.identifiers,
    distinguishingFeatures: attributes.distinguishingFeatures,
    confidence: attributes.confidence,
  };
}

function summarizeLocation(location) {
  return {
    landmarkId: location.landmarkId,
    landmarkName: location.landmarkName,
    zone: location.zone,
    method: location.method,
    confidence: location.confidence,
  };
}

function summarizeComparison(comparison) {
  return {
    attributeSimilarity: comparison.attributeSimilarity,
    distinctiveMatches: comparison.distinctiveMatches,
    distinctiveConflicts: comparison.distinctiveConflicts,
    matchingFeatures: comparison.matchingFeatures,
    conflictingFeatures: comparison.conflictingFeatures,
    unknownAttributes: comparison.unknownAttributes,
    locationPlausibility: comparison.locationPlausibility,
    timePlausibility: comparison.timePlausibility,
    rawScore: comparison.rawScore,
    reasoning: truncate(comparison.reasoning, 240),
  };
}

// ---------------------------------------------------------------------------
// Image fixture discovery (repository files only — nothing is downloaded)
// ---------------------------------------------------------------------------

const IMAGE_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** Conventional in-repo fixture locations, searched in order. */
const FIXTURE_DIRS = ['test/fixtures', 'test/fixtures/images', 'fixtures', 'assets', 'assets/images'];

const AI_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Finds a committed image fixture to analyze. Returns null when the repository
 * has none — the vision stage is then SKIPPED rather than inventing a URL or
 * fetching an image from the internet.
 */
function findImageFixture() {
  for (const relative of FIXTURE_DIRS) {
    const directory = join(AI_ROOT, relative);
    let entries;
    try {
      entries = readdirSync(directory);
    } catch {
      continue; // directory does not exist
    }
    for (const entry of entries.sort()) {
      const extension = extname(entry).toLowerCase();
      const mimeType = IMAGE_MIME_TYPES[extension];
      if (!mimeType) continue;
      const fullPath = join(directory, entry);
      if (!statSync(fullPath).isFile()) continue;
      return { path: `${relative}/${entry}`, fullPath, mimeType };
    }
  }
  return null;
}

/** Inlines a local fixture as a data URL, which the client already supports. */
function toDataUrl(fixture) {
  const bytes = readFileSync(fixture.fullPath);
  return `data:${fixture.mimeType};base64,${bytes.toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

async function stage1Connectivity(client) {
  const stage = beginStage(1, 'Featherless connectivity');
  stage.info('API key present', hasApiKey(config)); // boolean only — never the key
  stage.info('Base URL', config.baseUrl);
  stage.info('Text model', config.models.text);

  try {
    const result = await client.chatCompletion({
      model: config.models.text,
      messages: [
        { role: 'system', content: 'Reply with a single short word.' },
        { role: 'user', content: 'Say pong.' },
      ],
      maxTokens: 5,
      temperature: 0,
    });
    if (!result.content.trim()) {
      stage.fail('chat completion returned empty content');
      return false;
    }
    stage.pass(
      `real chat completion succeeded: content=${JSON.stringify(result.content)} ` +
        `model=${result.model} finishReason=${result.finishReason}`,
    );
    return true;
  } catch (err) {
    stage.fail(`chat completion failed — ${describeError(err)}`);
    return false;
  }
}

function stage2DemoReports(context) {
  const stage = beginStage(2, 'Demo lost & found reports');

  context.lostReport = toReport(LOST_ITEM, 'lost');
  context.foundReport = toReport(FOUND_ITEM, 'found');

  for (const [label, item, report] of [
    ['LOST', LOST_ITEM, context.lostReport],
    ['FOUND', FOUND_ITEM, context.foundReport],
  ]) {
    stage.info(`${label} demo item`, {
      id: item.id,
      title: item.title,
      category: item.category,
      description: item.description,
      locationText: item.locationText,
      timestamp: item.timestamp,
    });
    const valid =
      typeof report.id === 'string' &&
      (report.type === 'lost' || report.type === 'found') &&
      typeof report.description === 'string' &&
      report.description.trim().length > 0 &&
      typeof report.locationDescription === 'string' &&
      !Number.isNaN(Date.parse(report.timestamp));
    if (valid) {
      stage.pass(`${label} report matches the Report contract (id=${report.id})`);
    } else {
      stage.fail(`${label} report does not match the Report contract`);
    }
  }

  stage.pass('title/category stay backend-side; the AI infers the category from the text');
  return stageVerdict(stage) !== 'FAIL';
}

async function stage3Extraction(client, context) {
  const stage = beginStage(3, 'Text attribute extraction');
  stage.info('Text model', config.models.text);

  if (!context.connected) {
    stage.skip('blocked: Featherless connectivity failed, so no real extraction was attempted');
    return false;
  }

  const deps = { client, config };
  for (const [label, key, report] of [
    ['LOST', 'lostAttributes', context.lostReport],
    ['FOUND', 'foundAttributes', context.foundReport],
  ]) {
    try {
      const attributes = await extractItemAttributes(report, deps);
      stage.info(`${label} attributes`, summarizeAttributes(attributes));
      if (validate(stage, itemAttributesSchema, attributes, `${label} ItemAttributes`)) {
        context[key] = attributes;
      }
    } catch (err) {
      stage.fail(`${label} extraction failed — ${describeError(err)}`);
    }
  }

  return Boolean(context.lostAttributes && context.foundAttributes);
}

async function stage4Image(client, context) {
  const stage = beginStage(4, 'Image understanding');
  stage.info('Vision model', config.models.vision);

  const fixture = findImageFixture();
  if (!fixture) {
    stage.skip(
      'no committed image fixture found in ' +
        `${FIXTURE_DIRS.map((dir) => `ai/${dir}/`).join(', ')} — ` +
        'vision stage skipped (no image is downloaded and no URL is invented)',
    );
    return;
  }
  stage.info('Fixture', fixture.path);

  if (!context.connected) {
    stage.skip('blocked: Featherless connectivity failed, so no vision request was attempted');
    return;
  }

  const report = toReport(FOUND_ITEM, 'found', toDataUrl(fixture));
  try {
    const image = await analyzeItemImage(report, { client, config });
    stage.info('ImageAttributes', {
      hasImage: image.hasImage,
      category: image.category,
      brand: image.brand,
      colors: image.colors,
      material: image.material,
      detectedText: image.detectedText,
      distinguishingFeatures: image.distinguishingFeatures,
      mentionedByUserNotVisible: image.mentionedByUserNotVisible,
      confidence: image.confidence,
    });
    if (validate(stage, imageAttributesSchema, image, 'ImageAttributes')) {
      context.foundImage = image;
    }
  } catch (err) {
    // Vision access is plan-dependent; report it honestly without failing the run.
    stage.warn(`vision request unavailable — ${describeError(err)}`);
  }
}

async function stage5Location(client, context) {
  const stage = beginStage(5, 'Campus location normalization');
  const deps = { client, config };

  for (const [label, key, text] of [
    ['LOST', 'lostLocation', LOST_ITEM.locationText],
    ['FOUND', 'foundLocation', FOUND_ITEM.locationText],
  ]) {
    try {
      const location = await normalizeCampusLocation(text, deps);
      stage.info(`${label} location (${JSON.stringify(text)})`, summarizeLocation(location));
      if (validate(stage, locationResultSchema, location, `${label} LocationResult`)) {
        context[key] = location;
      }
      if (location.landmarkId === null) {
        stage.warn(`${label} location ${JSON.stringify(text)} did not resolve to a landmark`);
      }
    } catch (err) {
      stage.fail(`${label} location normalization failed — ${describeError(err)}`);
    }
  }

  if (
    context.lostLocation?.landmarkId &&
    context.lostLocation.landmarkId === context.foundLocation?.landmarkId
  ) {
    stage.pass(
      `both reports resolved to the same coarse landmark: ${context.lostLocation.landmarkId}`,
    );
  }
}

function toRankingItem(id, attributes, image, location, timestamp) {
  return { id, attributes, image: image ?? null, location: location ?? null, timestamp };
}

function stage6Ranking(context) {
  const stage = beginStage(6, 'Candidate ranking');

  if (!context.lostAttributes || !context.foundAttributes) {
    stage.skip('blocked: attribute extraction did not produce both attribute sets');
    return;
  }

  const lost = toRankingItem(
    LOST_ITEM.id,
    context.lostAttributes,
    null,
    context.lostLocation,
    LOST_ITEM.timestamp,
  );
  const found = toRankingItem(
    FOUND_ITEM.id,
    context.foundAttributes,
    context.foundImage,
    context.foundLocation,
    FOUND_ITEM.timestamp,
  );

  const ranked = rankCandidates(lost, [found], { topK: 5 });
  stage.info('Ranked candidates', ranked);

  if (ranked.length === 0) {
    stage.warn(
      `the found report was filtered out before comparison ` +
        `(categories: lost=${JSON.stringify(context.lostAttributes.category)} ` +
        `found=${JSON.stringify(context.foundAttributes.category)})`,
    );
    return;
  }

  const candidate = ranked[0];
  const shapeOk =
    typeof candidate.candidateId === 'string' &&
    typeof candidate.score === 'number' &&
    candidate.score >= 0 &&
    candidate.score <= 1 &&
    Array.isArray(candidate.reasons) &&
    Array.isArray(candidate.contradictions) &&
    typeof candidate.eligible === 'boolean';
  if (shapeOk) {
    stage.pass(
      `RankedCandidate conforms to its type (candidateId=${candidate.candidateId}, ` +
        `score=${candidate.score}, reasons=${candidate.reasons.length})`,
    );
  } else {
    stage.fail('RankedCandidate does not conform to its type');
  }
  context.ranked = ranked;
}

function toComparisonItem(type, attributes, image, location, timestamp) {
  return { type, attributes, image: image ?? null, location: location ?? null, timestamp };
}

async function stage7Comparison(client, context) {
  const stage = beginStage(7, 'Item comparison');
  stage.info('Comparison model', config.models.comparison);

  if (!context.lostAttributes || !context.foundAttributes) {
    stage.skip('blocked: attribute extraction did not produce both attribute sets');
    return;
  }

  const lost = toComparisonItem(
    'lost',
    context.lostAttributes,
    null,
    context.lostLocation,
    LOST_ITEM.timestamp,
  );
  const found = toComparisonItem(
    'found',
    context.foundAttributes,
    context.foundImage,
    context.foundLocation,
    FOUND_ITEM.timestamp,
  );

  try {
    const comparison = await compareItems(lost, found, { client, config });
    stage.info('AIComparison', summarizeComparison(comparison));
    if (validate(stage, aiComparisonSchema, comparison, 'AIComparison')) {
      context.comparison = comparison;
    }
    if (comparison.distinctiveMatches.length + comparison.matchingFeatures.length === 0) {
      stage.warn('the comparison found no shared evidence between two near-identical reports');
    }
  } catch (err) {
    stage.fail(`item comparison failed — ${describeError(err)}`);
  }
}

function stage8Decision(context) {
  const stage = beginStage(8, 'Deterministic match decision');
  stage.info('Thresholds', config.thresholds);

  if (!context.comparison) {
    stage.skip('blocked: no AI comparison evidence was produced');
    return;
  }

  const decision = calculateMatchDecision(context.comparison, config.thresholds);
  stage.info('MatchDecision', {
    tier: decision.tier,
    score: decision.score,
    recommendVerification: decision.recommendVerification,
    revealExactLocation: decision.revealExactLocation,
    evidence: decision.evidence.map((entry) => truncate(entry, 120)),
  });

  // The schema is strict and pins revealExactLocation to the literal false.
  validate(stage, matchDecisionSchema, decision, 'MatchDecision');

  if (decision.revealExactLocation === false) {
    stage.pass('revealExactLocation is false — matching never releases the exact location');
  } else {
    stage.fail('revealExactLocation was not false');
  }

  if (decision.tier === 'no_match') {
    stage.warn(
      `the two near-identical demo reports were scored as no_match ` +
        `(score=${decision.score}); no fixed score is expected, but this is worth a look`,
    );
  } else {
    stage.pass(`pipeline completed with tier=${decision.tier} score=${decision.score}`);
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function printSummary() {
  console.log('\n=== Summary ===');
  for (const stage of stages) {
    const label = `Stage ${stage.number} ${stage.title} `;
    console.log(`  ${label.padEnd(42, '.')} ${stageVerdict(stage)}`);
  }
}

async function main() {
  console.log('Featherless AI integration smoke test (real API, deterministic demo data)');
  console.log(`  API key present: ${hasApiKey(config)}`); // boolean only — never the key
  console.log(`  Base URL: ${config.baseUrl}`);
  console.log(
    `  Models: text=${config.models.text} vision=${config.models.vision} ` +
      `comparison=${config.models.comparison}`,
  );

  if (!hasApiKey(config)) {
    const stage = beginStage(1, 'Featherless connectivity');
    stage.fail(
      'FEATHERLESS_API_KEY is not set. Export it in your shell/secret and retry — ' +
        'no stage can run against the real API without it.',
    );
    for (const [index, title] of [
      'Demo lost & found reports',
      'Text attribute extraction',
      'Image understanding',
      'Campus location normalization',
      'Candidate ranking',
      'Item comparison',
      'Deterministic match decision',
    ].entries()) {
      beginStage(index + 2, title).skip('blocked: no API key configured');
    }
    printSummary();
    return 1;
  }

  const client = createFeatherlessClient(config);
  const context = {};

  context.connected = await stage1Connectivity(client);
  stage2DemoReports(context);
  await stage3Extraction(client, context);
  await stage4Image(client, context);
  await stage5Location(client, context);
  stage6Ranking(context);
  await stage7Comparison(client, context);
  stage8Decision(context);

  printSummary();

  const failed = stages.filter((stage) => stageVerdict(stage) === 'FAIL');
  const skipped = stages.filter((stage) => stageVerdict(stage) === 'SKIP');
  if (failed.length > 0) {
    console.log(
      `\nFAIL: ${failed.length} stage(s) failed: ` +
        `${failed.map((stage) => `${stage.number} (${stage.title})`).join(', ')}`,
    );
    return 1;
  }
  if (skipped.length > 0) {
    console.log(
      `\nPASS: no stage failed. Skipped: ` +
        `${skipped.map((stage) => `${stage.number} (${stage.title})`).join(', ')}.`,
    );
    return 0;
  }
  console.log('\nPASS: all stages completed.');
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    // A crash is itself a failure; keep the message secret-safe.
    console.error(`\nFAIL: smoke test crashed — ${describeError(err)}`);
    process.exitCode = 1;
  });
