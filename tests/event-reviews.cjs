const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTS(relativePath, mocks = {}) {
  const filename = path.resolve(relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : originalRequire(name);
  mod._compile(source, filename);
  return mod.exports;
}

const contract = loadTS('src/shared/eventReview.ts');
const reviews = loadTS('src/main/services/eventReviews.ts', {
  electron: { app: { getPath: () => '/tmp' } },
  './llm': { CLASSIFIER_VERSION: 'jev-food-v1', JEV_MODEL: 'jev-1.13.0' },
  '../../shared/eventReview': contract,
});
const sourceUrl = 'https://ducklink.stevens.edu/rsvp_boot?id=402454&rel=logo';
const event = () => ({
  id: 'event-7', name: 'Taco Night', sourceUrl, description: 'Tacos at the event',
  imageUrl: 'https://ducklink.stevens.edu/taco.png', imageCandidates: [{ url: 'https://ducklink.stevens.edu/taco.png', source: 'detail' }],
  imageEvidence: [{ url: 'https://ducklink.stevens.edu/taco.png', source: 'detail', sha256: 'a'.repeat(64) }],
  ocrText: 'Tacos', combinedText: 'Taco Night\nTacos', hasFood: true,
  foodStatus: 'provided', foodConfidence: 0.28, foodReasoning: 'Tacos are mentioned.',
});
const timestamp = '2026-09-30T15:00:00.000Z';

test('review identity uses RSVP id and scan date, independent of positional ids and query changes', () => {
  assert.equal(contract.getEventReviewKey('2026-09-30', sourceUrl), contract.getEventReviewKey('2026-09-30', 'https://ducklink.stevens.edu/rsvp_boot?rel=icon&id=402454'));
  assert.notEqual(contract.getEventReviewKey('2026-09-30', sourceUrl), contract.getEventReviewKey('2026-10-01', sourceUrl));
  assert.equal(contract.getEventReviewKey('2026-09-30', 'https://example.com/event?a=2&b=1'), contract.getEventReviewKey('2026-09-30', 'https://example.com/event?b=1&a=2'));
});

test('review saves snapshot exact captured evidence, model output, and staleness', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agora-review-'));
  try {
    const store = reviews.createReviewStore(path.join(root, 'reviews.json'));
    const draft = { scanDate: '2026-09-30', captureTimestamp: Date.parse(timestamp), sourceUrl, label: 'uncertain', basis: 'captured_evidence', note: 'No price shown.' };
    const saved = reviews.saveReviewDraft(draft, '2026-09-30', timestamp, [event()], store, new Date(timestamp));
    assert.equal(saved.model.confidence, 0.28);
    assert.equal(saved.model.status, 'provided');
    assert.equal(saved.capturedEvidence.ocrText, 'Tacos');
    assert.equal(saved.capturedEvidence.imageEvidence[0].sha256, 'a'.repeat(64));
    assert.equal(saved.capturedEvidence.localImagePath, undefined);
    assert.equal(reviews.getReviewsForScan('2026-09-30', timestamp, [event()], store.getAll())[0].stale, false);
    const changed = event(); changed.description = 'Free tacos';
    assert.equal(reviews.getReviewsForScan('2026-09-30', timestamp, [changed], store.getAll())[0].stale, true);
    assert.equal(store.getAll()[0].model.confidence, 0.28);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('review draft validation rejects non-Ducklink links and notes over the bound', () => {
  const good = { scanDate: '2026-09-30', captureTimestamp: Date.parse(timestamp), sourceUrl, label: 'provided', basis: 'attended', note: '' };
  assert.equal(contract.validateReviewDraft(good), true);
  assert.equal(contract.validateReviewDraft({ ...good, sourceUrl: 'file:///etc/passwd' }), false);
  assert.equal(contract.validateReviewDraft({ ...good, note: 'x'.repeat(1001) }), false);
});

test('saving against a replaced scan revision is rejected', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agora-review-'));
  try {
    const store = reviews.createReviewStore(path.join(root, 'reviews.json'));
    const draft = { scanDate: '2026-09-30', captureTimestamp: Date.parse(timestamp) - 1, sourceUrl, label: 'provided', basis: 'captured_evidence', note: '' };
    assert.throws(() => reviews.saveReviewDraft(draft, '2026-09-30', timestamp, [event()], store), /replaced by a newer scan/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('dataset contains unresolved current events and validates duplicate or invalid rows', () => {
  const result = reviews.buildEventReviewDataset('2026-09-30', timestamp, [event()], [], new Date(timestamp));
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.reviews.length, 0);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].label, null);
  assert.equal(contract.validateEventReviewDataset(result), true);
  assert.equal(contract.validateEventReviewDataset({ ...result, reviews: [result.unresolved[0]] }), false);
});

test('dataset keeps a previously reviewed event unresolved when captured evidence has changed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agora-review-'));
  try {
    const store = reviews.createReviewStore(path.join(root, 'reviews.json'));
    const draft = { scanDate: '2026-09-30', captureTimestamp: Date.parse(timestamp), sourceUrl, label: 'provided', basis: 'captured_evidence', note: '' };
    const saved = reviews.saveReviewDraft(draft, '2026-09-30', timestamp, [event()], store, new Date(timestamp));
    const changed = event(); changed.ocrText = 'Updated captured flyer text.';
    const dataset = reviews.buildEventReviewDataset('2026-09-30', timestamp, [changed], [saved], new Date(timestamp));
    assert.equal(dataset.reviews.length, 0);
    assert.equal(dataset.unresolved.length, 1);
    assert.equal(contract.validateEventReviewDataset(dataset), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('invalid persisted review store is moved aside and recovers empty', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agora-review-'));
  const filePath = path.join(root, 'reviews.json');
  try {
    fs.writeFileSync(filePath, '{broken');
    const store = reviews.createReviewStore(filePath);
    assert.deepEqual(store.getAll(), []);
    assert.equal(fs.existsSync(filePath), false);
    assert.equal(fs.readdirSync(root).some((name) => name.startsWith('reviews.json.corrupt-')), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('storage size limits preserve existing reviews and oversized stores stay visible', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agora-review-'));
  const filePath = path.join(root, 'reviews.json');
  try {
    const store = reviews.createReviewStore(filePath, 5000);
    const draft = { scanDate: '2026-09-30', captureTimestamp: Date.parse(timestamp), sourceUrl, label: 'provided', basis: 'captured_evidence', note: '' };
    const saved = reviews.saveReviewDraft(draft, '2026-09-30', timestamp, [event()], store);
    const before = fs.readFileSync(filePath, 'utf8');
    const secondEvent = event();
    secondEvent.sourceUrl = 'https://ducklink.stevens.edu/rsvp_boot?id=402455';
    secondEvent.description = 'x'.repeat(10_000);
    assert.throws(() => store.upsert({ ...saved, sourceUrl: secondEvent.sourceUrl, eventName: secondEvent.name, capturedEvidence: { ...saved.capturedEvidence, description: secondEvent.description } }), /storage limit/);
    assert.equal(fs.readFileSync(filePath, 'utf8'), before);
    const restrictedStore = reviews.createReviewStore(filePath, 100);
    assert.throws(() => restrictedStore.getAll(), /exceed the local storage limit/);
    assert.equal(fs.readFileSync(filePath, 'utf8'), before);
    assert.equal(fs.readdirSync(root).some((name) => name.includes('.corrupt-')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
