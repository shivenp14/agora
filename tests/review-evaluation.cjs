const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTS(relativePath) {
  const filename = path.resolve(relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(source, filename);
  return mod.exports;
}

const evaluator = loadTS('src/main/reviewEvaluation.ts');
const timestamp = '2026-09-30T12:00:00.000Z';
function record(id, label, basis, status = label) {
  return {
    schemaVersion: 1,
    scanDate: '2026-09-30',
    capturedAt: timestamp,
    sourceUrl: `https://ducklink.stevens.edu/rsvp_boot?id=${id}&rel=logo`,
    eventName: `Event ${id}`,
    evidenceFingerprint: id.padStart(64, '0'),
    capturedEvidence: {
      description: 'Captured description',
      ocrText: 'Captured OCR',
      combinedText: 'Captured description\nCaptured OCR',
      imageUrl: null,
      imageCandidates: [],
      imageEvidence: [],
    },
    model: { name: 'Jev', version: 'jev-1.13.0', classifierVersion: 'jev-food-v1', status,
      hasFood: status === 'provided', confidence: 0.8, reasoning: 'Recorded model summary' },
    ...(label === null ? { label: null } : { label, basis, note: 'Reviewed captured evidence', reviewedAt: timestamp }),
  };
}
function dataset() {
  return {
    schemaVersion: 1,
    exportedAt: timestamp,
    reviews: [
      record('1', 'provided', 'captured_evidence'),
      record('2', 'not_provided', 'organizer_confirmed'),
      record('3', 'uncertain', 'attended', 'provided'),
    ],
    unresolved: [record('4', null, null, 'uncertain')],
  };
}

test('real-event evaluation preserves labeled, unresolved, and provenance denominators', () => {
  const report = evaluator.evaluateEventReviewDataset(dataset());
  assert.equal(report.totalRecords, 4);
  assert.equal(report.labeledRecords, 3);
  assert.equal(report.unresolvedRecords, 1);
  assert.deepEqual(report.labelCounts, { provided: 1, not_provided: 1, uncertain: 1 });
  assert.deepEqual(report.agreement.overall, { matched: 2, denominator: 3, rate: 2 / 3 });
  assert.deepEqual(report.agreement.capturedEvidence, { matched: 1, denominator: 1, rate: 1 });
  assert.deepEqual(report.agreement.externallyConfirmed, { matched: 1, denominator: 2, rate: 0.5 });
  assert.deepEqual(report.reviewerUncertain, { count: 1, denominator: 3, rate: 1 / 3 });
  assert.deepEqual(report.recordedModelUncertain, { count: 1, denominator: 4, rate: 0.25 });
  assert.equal(report.mismatches.length, 1);
  assert.equal(report.mismatches[0].eventName, 'Event 3');
  assert.equal(report.mismatches[0].label, 'uncertain');
});

test('review evaluation rejects incomplete results and duplicate event sources', () => {
  const incomplete = dataset();
  incomplete.reviews[0].model.status = 'unavailable';
  assert.throws(() => evaluator.evaluateEventReviewDataset(incomplete), /unavailable or invalid recorded model result/);

  const duplicate = dataset();
  duplicate.unresolved[0].sourceUrl = 'https://ducklink.stevens.edu/rsvp_boot?id=1';
  assert.throws(() => evaluator.evaluateEventReviewDataset(duplicate), /duplicate event source/);
});

test('review evaluation rejects absent labels and incomplete rerun predictions', () => {
  const invalidLabel = dataset();
  invalidLabel.reviews[0].label = null;
  assert.throws(() => evaluator.evaluateEventReviewDataset(invalidLabel), /missing or invalid review label/);

  const data = dataset();
  const partial = new Map();
  partial.set(evaluator.reviewSourceKey(data.reviews[0].scanDate, data.reviews[0].sourceUrl), {
    status: 'provided', confidence: 0.9, modelName: 'Jev', modelVersion: 'jev-1.13.0', classifierVersion: 'jev-food-v1',
  });
  assert.throws(() => evaluator.evaluateEventReviewDataset(data, partial), /Rerun results are incomplete/);
});
