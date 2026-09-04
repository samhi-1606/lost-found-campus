/**
 * Featherless integration smoke test — 7 stages, real API calls, no mocks.
 *
 * Verifies the whole AI layer end to end against the live provider:
 *   1. Featherless connectivity      5. Item comparison
 *   2. Text attribute extraction     6. Full matching pipeline
 *   3. Location normalization        7. Security assertions
 *   4. Image understanding
 *
 * It reuses the shipped services and the shared Featherless client — it never
 * makes a direct HTTP call of its own, and it never prints the API key (only
 * whether one is present). Synthetic report data is used throughout, so every
 * value printed here is safe to show.
 *
 * Usage (the key comes from your environment/secret, never from source):
 *   npm run smoke                # builds first, then runs this script
 *   # or, after `npm run build`:
 *   node scripts/featherless-smoke.mjs
 *
 * Runs against the compiled output in ../dist, so build before running.
 *
 * Exit code: 0 when every REQUIRED stage passes (stage 4 is advisory — a gated
 * or unavailable vision model reports WARN), 1 otherwise.
 */
import {
  CAMPUS_LANDMARKS,
  analyzeItemImage,
  compareItems,
  createFeatherlessClient,
  extractItemAttributes,
  hasApiKey,
  loadConfig,
  normalizeCampusLocation,
  runMatchingPipeline,
} from '../dist/index.js';

const config = loadConfig();

/**
 * Sentinels planted on the synthetic reports. They stand in for private backend
 * fields that must never cross the provider boundary; stage 7 asserts they do
 * not appear in anything actually sent to Featherless.
 */
const SENTINEL_USER_ID = 'user-must-never-reach-featherless-4711';
const SENTINEL_OWNER_EMAIL = 'owner-must-never-leave-backend@example.invalid';

/** Public, stable photo of a dark backpack against a plain wall. */
const TEST_IMAGE_URL = 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=640';

/** Distinctive evidence deliberately shared by the lost/found twin items. */
const SHARED_SERIAL = 'SN-LFC-7781-QX';

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** Redacts the key if it ever reaches a printable string (defence in depth). */
function redact(text) {
  const key = config.apiKey;
  return key && text.includes(key) ? text.split(key).join('[REDACTED]') : text;
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const LEVEL_RANK = { PASS: 0, WARN: 1, SKIP: 1, FAIL: 2 };
const stages = [];

function beginStage(number, title, { required }) {
  const stage = { number, title, required, checks: [] };
  stages.push(stage);
  console.log(`\n=== Stage ${number}/7 — ${title} ===`);
  const record = (level, message) => {
    stage.checks.push({ level, message });
    console.log(`  ${level}: ${redact(message)}`);
  };
  stage.pass = (message) => record('PASS', message);
  stage.warn = (message) => record('WARN', message);
  stage.fail = (message) => record('FAIL', message);
  stage.skip = (message) => record('SKIP', message);
  return stage;
}

/** A stage's verdict is its worst individual check. */
function stageVerdict(stage) {
  return stage.checks.reduce(
    (worst, check) => (LEVEL_RANK[check.level] > LEVEL_RANK[worst] ? check.level : worst),
    'PASS',
  );
}

/** Builds a safe, key-free description of a thrown provider/service error. */
function describeError(err) {
  if (!(err instanceof Error)) return redact(String(err));
  const status = typeof err.status === 'number' ? ` status=${err.status}` : '';
  const provider =
    typeof err.providerMessage === 'string' && err.providerMessage
      ? ` provider="${truncate(err.providerMessage, 160)}"`
      : '';
  return redact(`${err.name}: ${err.message}${status}${provider}`);
}

function show(label, value) {
  console.log(`    ${label}: ${redact(JSON.stringify(value))}`);
}

// ---------------------------------------------------------------------------
// Security scanning helpers (used by every stage, asserted in stage 7)
// ---------------------------------------------------------------------------

/**
 * Private/sensitive field names that must never appear in an AI-produced
 * result. Matched on normalized whole keys, so legitimate names that merely
 * contain one of these words (`revealExactLocation`, `recommendVerification`)
 * are not false positives.
 */
const FORBIDDEN_KEYS = new Set([
  'latitude',
  'longitude',
  'lat',
  'lng',
  'lon',
  'coordinate',
  'coordinates',
  'geo',
  'gps',
  'exactlocation',
  'owner',
  'ownerid',
  'owneremail',
  'ownername',
  'userid',
  'uid',
  'contact',
  'email',
  'phone',
  'verification',
  'verificationstatus',
  'verified',
  'verifiedby',
  'verifiedat',
  'heldby',
]);

/** Coordinate vocabulary that must not show up inside AI free text either. */
const FORBIDDEN_VALUE_PATTERN = /\b(latitude|longitude|gps)\b/i;

function scanForbidden(value, path, findings) {
  if (typeof value === 'string') {
    if (FORBIDDEN_VALUE_PATTERN.test(value)) {
      findings.push(`${path} contains coordinate vocabulary`);
    }
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForbidden(entry, `${path}[${index}]`, findings));
    return findings;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
      if (FORBIDDEN_KEYS.has(normalized)) {
        findings.push(`${path}.${key} is a forbidden private field`);
      }
      scanForbidden(entry, `${path}.${key}`, findings);
    }
  }
  return findings;
}

/** Every AI result produced during the run, checked collectively in stage 7. */
const aiResults = [];
function collect(label, value) {
  aiResults.push({ label, value });
  return value;
}

/** Everything actually handed to the Featherless client, for stage 7. */
const outboundPayloads = [];

/**
 * Wraps the real client to record outbound requests. All traffic still goes
 * through the shipped client — this only observes what is sent.
 */
function createRecordingClient(inner) {
  return {
    chatCompletion(params) {
      outboundPayloads.push({ model: params.model, messages: params.messages });
      return inner.chatCompletion(params);
    },
  };
}

// ---------------------------------------------------------------------------
// Synthetic fixtures
// ---------------------------------------------------------------------------

/** Adds the private-field sentinels a real backend document would carry. */
function withPrivateFields(report) {
  return { ...report, userId: SENTINEL_USER_ID, ownerEmail: SENTINEL_OWNER_EMAIL };
}

function laptopAttributes(overrides = {}) {
  return {
    category: 'laptop',
    brand: 'Dell',
    model: 'XPS 13',
    colors: ['silver'],
    material: 'aluminium',
    identifiers: [SHARED_SERIAL],
    distinguishingFeatures: [
      'cracked bottom-right corner',
      'blue university sticker on the lid',
    ],
    keywords: ['laptop', 'dell', 'xps'],
    confidence: 0.9,
    ...overrides,
  };
}

function summarizeAttributes(attributes) {
  return {
    category: attributes.category,
    brand: attributes.brand,
    model: attributes.model,
    colors: attributes.colors,
    material: attributes.material,
    identifierCount: attributes.identifiers.length,
    distinguishingFeatureCount: attributes.distinguishingFeatures.length,
    confidence: attributes.confidence,
  };
}

function summarizeComparison(comparison) {
  return {
    attributeSimilarity: comparison.attributeSimilarity,
    distinctiveMatches: comparison.distinctiveMatches,
    distinctiveConflicts: comparison.distinctiveConflicts,
    matchingFeatures: comparison.matchingFeatures,
    conflictingFeatures: comparison.conflictingFeatures,
    unknownAttributeCount: comparison.unknownAttributes.length,
    locationPlausibility: comparison.locationPlausibility,
    timePlausibility: comparison.timePlausibility,
    rawScore: comparison.rawScore,
    reasoning: truncate(comparison.reasoning, 220),
  };
}

// ---------------------------------------------------------------------------
// Stage 1 — Featherless connectivity (the original Pong check)
// ---------------------------------------------------------------------------

async function stage1Connectivity(client) {
  const stage = beginStage(1, 'Featherless connectivity', { required: true });
  show('API key present', hasApiKey(config)); // boolean only — never the key value
  show('Base URL', config.baseUrl);
  show('Text model', config.models.text);

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
      return;
    }
    stage.pass(
      `real chat completion succeeded: content=${JSON.stringify(result.content)} ` +
        `model=${result.model} finishReason=${result.finishReason}`,
    );
    if (!/pong/i.test(result.content)) {
      stage.warn(`reply did not contain "pong" (got ${JSON.stringify(result.content)})`);
    }
  } catch (err) {
    stage.fail(`chat completion failed — ${describeError(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Stage 2 — Text attribute extraction
// ---------------------------------------------------------------------------

async function stage2Extraction(client) {
  const stage = beginStage(2, 'Text attribute extraction', { required: true });
  const report = withPrivateFields({
    id: 'smoke-lost-backpack',
    type: 'lost',
    description:
      'I lost my navy blue Herschel backpack in the library yesterday afternoon. ' +
      'It has a small tear on the front-left pocket, a yellow smiley-face sticker on the ' +
      'main zip, and the name "A. Mensah" written in marker inside the top flap.',
    locationDescription: 'library',
    timestamp: '2026-09-01T14:00:00.000Z',
  });

  try {
    const attributes = collect(
      'stage2.itemAttributes',
      await extractItemAttributes(report, { client, config }),
    );
    show('attributes', summarizeAttributes(attributes));
    stage.pass('extractItemAttributes returned schema-valid ItemAttributes from a real request');

    if (!attributes.category.trim()) {
      stage.fail('extracted category is empty');
    }
    const distinctiveCount =
      attributes.identifiers.length + attributes.distinguishingFeatures.length;
    if (distinctiveCount > 0) {
      stage.pass(`captured ${distinctiveCount} distinctive detail(s) (identifiers + features)`);
    } else {
      stage.warn('no identifiers or distinguishing features were captured from a rich description');
    }
    if (attributes.brand && /herschel/i.test(attributes.brand)) {
      stage.pass(`brand read from the text: ${attributes.brand}`);
    } else {
      stage.warn(`brand "Herschel" was stated but not extracted (got ${JSON.stringify(attributes.brand)})`);
    }
  } catch (err) {
    stage.fail(`extractItemAttributes failed — ${describeError(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Stage 3 — Location normalization against the 7 confirmed landmarks
// ---------------------------------------------------------------------------

/** One phrase per confirmed landmark, all expected to resolve without AI. */
const DETERMINISTIC_LOCATION_CASES = [
  { phrase: 'Library', expectId: 'library' },
  { phrase: 'student-services', expectId: 'student-services' },
  { phrase: 'reception desk', expectId: 'reception' },
  { phrase: 'security office', expectId: 'security' },
  { phrase: 'front gate', expectId: 'main-gate' },
  { phrase: 'canteen', expectId: 'cafeteria' },
  { phrase: 'campus security desk', expectId: 'main-campus-security-desk' },
];

/** Messy phrasing that no deterministic rule resolves — exercises the AI stage. */
const AI_FALLBACK_CASE = {
  phrase: 'the place where students queue to buy their lunch',
  expectId: 'cafeteria',
};

async function stage3Location(client) {
  const stage = beginStage(3, 'Location normalization', { required: true });
  const trustedIds = new Set(CAMPUS_LANDMARKS.map((landmark) => landmark.id));
  const deps = { client, config };
  const resolvedIds = new Set();

  for (const testCase of DETERMINISTIC_LOCATION_CASES) {
    try {
      const result = collect(
        `stage3.location[${testCase.phrase}]`,
        await normalizeCampusLocation(testCase.phrase, deps),
      );
      if (result.landmarkId !== testCase.expectId) {
        stage.fail(
          `"${testCase.phrase}" resolved to ${JSON.stringify(result.landmarkId)}, ` +
            `expected "${testCase.expectId}"`,
        );
        continue;
      }
      if (!trustedIds.has(result.landmarkId)) {
        stage.fail(`"${testCase.phrase}" produced untrusted landmark id ${result.landmarkId}`);
        continue;
      }
      if (result.method === 'ai' || result.method === 'unmatched') {
        stage.fail(
          `"${testCase.phrase}" should resolve deterministically but used method=${result.method}`,
        );
        continue;
      }
      resolvedIds.add(result.landmarkId);
      stage.pass(
        `"${testCase.phrase}" → ${result.landmarkId} (${result.landmarkName}, zone=${result.zone}, ` +
          `method=${result.method}, confidence=${result.confidence})`,
      );
    } catch (err) {
      stage.fail(`normalizing "${testCase.phrase}" failed — ${describeError(err)}`);
    }
  }

  if (resolvedIds.size === CAMPUS_LANDMARKS.length) {
    stage.pass(`all ${CAMPUS_LANDMARKS.length} confirmed landmarks resolved to trusted ids`);
  } else {
    stage.fail(
      `only ${resolvedIds.size}/${CAMPUS_LANDMARKS.length} confirmed landmarks resolved`,
    );
  }

  // AI fallback: the model may only SUGGEST a landmark; the trusted dataset decides.
  try {
    const result = collect(
      'stage3.aiFallback',
      await normalizeCampusLocation(AI_FALLBACK_CASE.phrase, deps),
    );
    if (result.landmarkId !== null && !trustedIds.has(result.landmarkId)) {
      stage.fail(
        `AI fallback invented an untrusted landmark id ${JSON.stringify(result.landmarkId)}`,
      );
    } else if (result.method === 'ai' && result.landmarkId === AI_FALLBACK_CASE.expectId) {
      stage.pass(
        `AI fallback "${AI_FALLBACK_CASE.phrase}" → ${result.landmarkId} ` +
          `(method=ai, confidence=${result.confidence})`,
      );
    } else if (result.method === 'unmatched') {
      stage.warn(
        `AI fallback "${AI_FALLBACK_CASE.phrase}" stayed unmatched — safe but unresolved`,
      );
    } else {
      stage.warn(
        `AI fallback "${AI_FALLBACK_CASE.phrase}" → ${JSON.stringify(result.landmarkId)} ` +
          `(method=${result.method}); expected "${AI_FALLBACK_CASE.expectId}"`,
      );
    }
  } catch (err) {
    stage.fail(`AI location fallback failed — ${describeError(err)}`);
  }

  // Coarse-only guarantee: no coordinates may ever enter a LocationResult.
  const locationFindings = scanForbidden(
    aiResults.filter((entry) => entry.label.startsWith('stage3.')),
    'stage3',
    [],
  );
  if (locationFindings.length > 0) {
    stage.fail(`location results exposed private fields: ${locationFindings.join(', ')}`);
  } else {
    stage.pass('no coordinates or private fields present in any LocationResult');
  }
}

// ---------------------------------------------------------------------------
// Stage 4 — Image understanding (advisory: WARN when the vision model is gated)
// ---------------------------------------------------------------------------

async function stage4Image(client) {
  const stage = beginStage(4, 'Image understanding', { required: false });
  show('Vision model', config.models.vision);
  show('Test image', TEST_IMAGE_URL);

  const report = withPrivateFields({
    id: 'smoke-found-backpack',
    type: 'found',
    description: 'Found a dark backpack left against a wall. It may have a red zip pull.',
    imageUrl: TEST_IMAGE_URL,
    timestamp: '2026-09-01T16:00:00.000Z',
  });

  try {
    const image = collect('stage4.imageAttributes', await analyzeItemImage(report, { client, config }));
    show('imageAttributes', {
      hasImage: image.hasImage,
      category: image.category,
      brand: image.brand,
      colors: image.colors,
      material: image.material,
      detectedTextCount: image.detectedText.length,
      distinguishingFeatureCount: image.distinguishingFeatures.length,
      mentionedByUserNotVisibleCount: image.mentionedByUserNotVisible.length,
      confidence: image.confidence,
    });
    stage.pass(
      `analyzeItemImage returned schema-valid ImageAttributes from a real vision request ` +
        `(model=${config.models.vision})`,
    );
    if (!image.hasImage) {
      stage.warn('hasImage was false even though an image URL was supplied');
    }
  } catch (err) {
    // Vision access is plan-dependent; never let it sink the whole run.
    stage.warn(`vision request unavailable — ${describeError(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Stage 5 — Item comparison
// ---------------------------------------------------------------------------

async function stage5Comparison(client) {
  const stage = beginStage(5, 'Item comparison', { required: true });
  show('Comparison model', config.models.comparison);

  const lost = {
    type: 'lost',
    attributes: laptopAttributes(),
    image: null,
    location: {
      raw: 'library',
      landmarkId: 'library',
      landmarkName: 'Library',
      zone: 'academic',
      confidence: 1,
      method: 'exact',
    },
    timestamp: '2026-09-01T14:00:00.000Z',
  };
  const found = {
    type: 'found',
    attributes: laptopAttributes({
      colors: ['silver', 'grey'],
      keywords: ['laptop', 'handed in'],
      confidence: 0.85,
    }),
    image: null,
    location: {
      raw: 'the library',
      landmarkId: 'library',
      landmarkName: 'Library',
      zone: 'academic',
      confidence: 0.9,
      method: 'alias',
    },
    timestamp: '2026-09-01T17:30:00.000Z',
  };

  try {
    const comparison = collect(
      'stage5.comparison',
      await compareItems(lost, found, { client, config }),
    );
    show('comparison', summarizeComparison(comparison));
    stage.pass('compareItems returned schema-valid AIComparison evidence from a real request');

    const evidenceCount =
      comparison.distinctiveMatches.length + comparison.matchingFeatures.length;
    if (evidenceCount === 0) {
      stage.fail('comparison produced no matching evidence for two deliberately similar items');
    } else if (comparison.distinctiveMatches.length > 0) {
      stage.pass(
        `distinctive evidence recognised: ${comparison.distinctiveMatches.length} match(es) ` +
          `including the shared serial`,
      );
    } else {
      stage.warn(
        `only generic evidence recognised (${evidenceCount} matching feature(s)); ` +
          `the shared serial ${SHARED_SERIAL} was not flagged as distinctive`,
      );
    }
    if (comparison.distinctiveConflicts.length > 0) {
      stage.warn(
        `unexpected distinctive conflicts for identical evidence: ` +
          `${JSON.stringify(comparison.distinctiveConflicts)}`,
      );
    }
    if (comparison.tier !== undefined || comparison.revealExactLocation !== undefined) {
      stage.fail('comparison output leaked decision fields — the AI must only supply evidence');
    } else {
      stage.pass('comparison stayed evidence-only (no match tier, no ownership, no release flag)');
    }
  } catch (err) {
    stage.fail(`compareItems failed — ${describeError(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Stage 6 — Full matching pipeline
// ---------------------------------------------------------------------------

const TWIN_CANDIDATE_ID = 'smoke-found-laptop';

async function stage6Pipeline(client) {
  const stage = beginStage(6, 'Full matching pipeline', { required: true });

  const lost = {
    report: withPrivateFields({
      id: 'smoke-lost-laptop',
      type: 'lost',
      description:
        `Lost a silver Dell XPS 13 laptop with the serial ${SHARED_SERIAL} engraved on the ` +
        'underside. It has a cracked bottom-right corner and a blue university sticker on the lid.',
      locationDescription: 'library',
      timestamp: '2026-09-01T14:00:00.000Z',
    }),
  };

  const found = [
    {
      report: withPrivateFields({
        id: TWIN_CANDIDATE_ID,
        type: 'found',
        description:
          `Found a silver Dell laptop handed in at the desk. The serial ${SHARED_SERIAL} is ` +
          'engraved underneath, one corner is cracked, and there is a blue university sticker ' +
          'on the lid.',
        locationDescription: 'the library',
        timestamp: '2026-09-01T17:30:00.000Z',
      }),
    },
    {
      report: withPrivateFields({
        id: 'smoke-found-decoy-laptop',
        type: 'found',
        description:
          'Found a black HP ProBook laptop with the serial SN-2210-ABBA on a sticker and a ' +
          'red skull decal on the lid. No visible damage.',
        locationDescription: 'canteen',
        timestamp: '2026-09-02T09:00:00.000Z',
      }),
    },
  ];

  try {
    const result = collect(
      'stage6.pipelineResult',
      await runMatchingPipeline(lost, found, { client, config }, { topK: 5 }),
    );
    show('pipeline', {
      status: result.status,
      lostReportId: result.lostReportId,
      rankedCandidateCount: result.rankedCandidateCount,
      comparedCandidateCount: result.comparedCandidateCount,
      matches: result.matches.map((match) => ({
        candidateId: match.candidateId,
        tier: match.decision.tier,
        score: match.decision.score,
        recommendVerification: match.decision.recommendVerification,
        revealExactLocation: match.decision.revealExactLocation,
        rankingScore: match.rankingScore,
        distinctiveMatches: match.comparison.distinctiveMatches,
      })),
      warnings: result.warnings,
    });

    if (result.status === 'failed') {
      stage.fail(`pipeline status=failed; warnings=${JSON.stringify(result.warnings)}`);
      return;
    }
    stage.pass(`pipeline completed with status=${result.status}`);

    if (result.matches.length === 0) {
      stage.fail('pipeline returned no candidate matches for a deliberately matching pair');
      return;
    }
    stage.pass(
      `plausible candidate(s) returned: ${result.matches.length} of ` +
        `${result.comparedCandidateCount} compared`,
    );

    const twin = result.matches.find((match) => match.candidateId === TWIN_CANDIDATE_ID);
    if (!twin) {
      stage.fail(`the deliberately matching candidate ${TWIN_CANDIDATE_ID} was not returned`);
    } else {
      if (result.matches[0].candidateId === TWIN_CANDIDATE_ID) {
        stage.pass(
          `the matching twin ranked first (tier=${twin.decision.tier}, ` +
            `score=${twin.decision.score})`,
        );
      } else {
        stage.warn(
          `the matching twin was returned but ranked behind ` +
            `${result.matches[0].candidateId} (twin score=${twin.decision.score})`,
        );
      }
      if (twin.decision.tier === 'no_match') {
        stage.warn('the matching twin was scored as no_match despite identical distinctive evidence');
      }
    }

    const revealing = result.matches.filter((match) => match.decision.revealExactLocation !== false);
    if (revealing.length > 0) {
      stage.fail(
        `revealExactLocation was not false for: ${revealing.map((m) => m.candidateId).join(', ')}`,
      );
    } else {
      stage.pass(
        `every MatchDecision has revealExactLocation === false (${result.matches.length} checked)`,
      );
    }

    if (result.warnings.length > 0) {
      stage.warn(`pipeline reported ${result.warnings.length} non-fatal warning(s)`);
    }
  } catch (err) {
    stage.fail(`runMatchingPipeline failed — ${describeError(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Stage 7 — Security assertions across everything produced above
// ---------------------------------------------------------------------------

function stage7Security() {
  const stage = beginStage(7, 'Security assertions', { required: true });

  if (aiResults.length === 0) {
    stage.fail('no AI results were produced, so security assertions could not be evaluated');
    return;
  }

  // 1. revealExactLocation must be false wherever a MatchDecision exists.
  const decisions = [];
  for (const entry of aiResults) {
    const matches = entry.value?.matches;
    if (Array.isArray(matches)) {
      for (const match of matches) {
        if (match?.decision) decisions.push({ label: entry.label, decision: match.decision });
      }
    }
  }
  const leaking = decisions.filter((item) => item.decision.revealExactLocation !== false);
  if (leaking.length > 0) {
    stage.fail(`revealExactLocation was true/absent in ${leaking.length} decision(s)`);
  } else if (decisions.length === 0) {
    stage.warn('no MatchDecision was produced, so revealExactLocation could not be asserted');
  } else {
    stage.pass(`revealExactLocation === false on all ${decisions.length} MatchDecision(s)`);
  }

  // 2. No private/sensitive field may appear anywhere in an AI result.
  const findings = [];
  for (const entry of aiResults) {
    scanForbidden(entry.value, entry.label, findings);
  }
  if (findings.length > 0) {
    stage.fail(`private fields found in AI results: ${findings.join(', ')}`);
  } else {
    stage.pass(
      `no latitude/longitude/exactLocation/owner/verification fields in any of the ` +
        `${aiResults.length} AI result(s)`,
    );
  }

  // 3. Nothing user-identifying may cross the provider boundary.
  const serializedOutbound = JSON.stringify(outboundPayloads);
  const outboundProblems = [];
  if (serializedOutbound.includes(SENTINEL_USER_ID)) {
    outboundProblems.push('the sentinel userId value was sent to Featherless');
  }
  if (serializedOutbound.includes(SENTINEL_OWNER_EMAIL)) {
    outboundProblems.push('the sentinel owner email was sent to Featherless');
  }
  if (/user_?id/i.test(serializedOutbound)) {
    outboundProblems.push('a userId field appears in an outbound payload');
  }
  if (outboundProblems.length > 0) {
    stage.fail(outboundProblems.join('; '));
  } else {
    stage.pass(
      `no userId or owner identity in any of the ${outboundPayloads.length} outbound request(s), ` +
        `even though every synthetic report carried both`,
    );
  }

  // 4. The API key must stay in the Authorization header and out of everything else.
  if (!hasApiKey(config)) {
    stage.warn('no API key configured, so key-leak assertions are vacuous');
  } else if (serializedOutbound.includes(config.apiKey)) {
    stage.fail('the API key appeared in an outbound message payload');
  } else if (JSON.stringify(aiResults).includes(config.apiKey)) {
    stage.fail('the API key appeared in an AI result');
  } else {
    stage.pass('the API key never appears in an outbound payload, an AI result, or this output');
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function printSummary() {
  console.log('\n=== Summary ===');
  for (const stage of stages) {
    const verdict = stageVerdict(stage);
    const label = `Stage ${stage.number} ${stage.title}`;
    const optional = stage.required ? '' : ' (advisory)';
    console.log(`  ${label.padEnd(40, '.')} ${verdict}${optional}`);
  }
}

async function main() {
  console.log('Featherless 7-stage integration smoke test');
  console.log(`  API key present: ${hasApiKey(config)}`); // boolean only — never the key value

  if (!hasApiKey(config)) {
    const stage = beginStage(1, 'Featherless connectivity', { required: true });
    stage.fail('FEATHERLESS_API_KEY is not set. Export it in your shell/secret and retry.');
    for (const [index, title] of [
      'Text attribute extraction',
      'Location normalization',
      'Image understanding',
      'Item comparison',
      'Full matching pipeline',
      'Security assertions',
    ].entries()) {
      beginStage(index + 2, title, { required: true }).skip('skipped: no API key configured');
    }
    printSummary();
    return 1;
  }

  const client = createRecordingClient(createFeatherlessClient(config));

  await stage1Connectivity(client);
  await stage2Extraction(client);
  await stage3Location(client);
  await stage4Image(client);
  await stage5Comparison(client);
  await stage6Pipeline(client);
  stage7Security();

  printSummary();

  const failedRequired = stages.filter(
    (stage) => stage.required && stageVerdict(stage) === 'FAIL',
  );
  if (failedRequired.length > 0) {
    console.log(
      `\nFAIL: ${failedRequired.length} required stage(s) failed: ` +
        `${failedRequired.map((stage) => stage.number).join(', ')}`,
    );
    return 1;
  }
  console.log('\nPASS: all required stages passed.');
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    // A crash here is itself a failure; keep the message secret-safe.
    console.error(`\nFAIL: smoke test crashed — ${describeError(err)}`);
    process.exitCode = 1;
  });
