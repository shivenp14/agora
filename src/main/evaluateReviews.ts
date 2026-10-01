import { readFile } from 'node:fs/promises';
import { loadApiKeyFromKeychain, hasApiKey } from './services/keytarStore';
import { classifyBatchWithRetry, JEV_MODEL, CLASSIFIER_VERSION } from './services/llm';
import {
  evaluateEventReviewDataset,
  reviewSourceKey,
  validateEventReviewDataset,
  type EvaluationPrediction,
  type ReviewEvaluationReport,
} from './reviewEvaluation';

function printReport(report: ReviewEvaluationReport, label: string): void {
  const percent = (rate: number | null) => rate === null ? 'n/a' : `${(rate * 100).toFixed(1)}%`;
  const agreement = report.agreement;
  console.log(`${label}: ${agreement.overall.matched}/${agreement.overall.denominator} labeled decisions matched (${percent(agreement.overall.rate)}).`);
  console.log(`Records: ${report.totalRecords} total; ${report.labeledRecords} labeled; ${report.unresolvedRecords} unresolved.`);
  console.log(`Labels: provided ${report.labelCounts.provided}, not provided ${report.labelCounts.not_provided}, uncertain ${report.labelCounts.uncertain}. Reviewer uncertain: ${report.reviewerUncertain.count}/${report.reviewerUncertain.denominator} (${percent(report.reviewerUncertain.rate)}).`);
  console.log(`Model uncertain: ${report.recordedModelUncertain.count}/${report.recordedModelUncertain.denominator} (${percent(report.recordedModelUncertain.rate)}).`);
  console.log(`Captured-evidence agreement: ${agreement.capturedEvidence.matched}/${agreement.capturedEvidence.denominator} (${percent(agreement.capturedEvidence.rate)}).`);
  console.log(`Externally confirmed agreement (organizer-confirmed or attended): ${agreement.externallyConfirmed.matched}/${agreement.externallyConfirmed.denominator} (${percent(agreement.externallyConfirmed.rate)}).`);
  for (const cohort of report.cohorts) {
    console.log(`Model cohort ${cohort.modelName} ${cohort.modelVersion} (${cohort.classifierVersion}): ${cohort.agreement.matched}/${cohort.agreement.denominator} (${percent(cohort.agreement.rate)}).`);
  }
  if (report.mismatches.length) {
    console.log('Mismatches:');
    for (const mismatch of report.mismatches) {
      console.log(`- ${mismatch.eventName} [${mismatch.basis}]: model=${mismatch.modelStatus}, label=${mismatch.label}, confidence=${Math.round(mismatch.confidence * 100)}% (${mismatch.sourceUrl})`);
    }
  } else {
    console.log('Mismatches: none among labeled records.');
  }
  console.log('Agreement describes these manually reviewed records only; it is not a general production accuracy estimate.');
}

async function rerun(datasetValue: unknown): Promise<Map<string, EvaluationPrediction>> {
  const dataset = validateEventReviewDataset(datasetValue);
  await loadApiKeyFromKeychain();
  if (!hasApiKey()) throw new Error('Save a TypeSafe API key in the desktop app Settings before using --rerun.');
  const records = [...dataset.reviews, ...dataset.unresolved];
  const predictions = new Map<string, EvaluationPrediction>();
  for (let offset = 0; offset < records.length; offset += 5) {
    const batch = records.slice(offset, offset + 5);
    const results = await classifyBatchWithRetry(batch.map((record, index) => ({
      index,
      title: record.eventName,
      description: record.capturedEvidence.description,
      imageText: record.capturedEvidence.ocrText,
    })));
    for (const result of results) {
      const record = batch[result.index];
      if (!record) throw new Error('Rerun returned an unknown event index.');
      predictions.set(reviewSourceKey(record.scanDate, record.sourceUrl), {
        status: result.foodStatus,
        confidence: result.confidence,
        modelName: 'Jev',
        modelVersion: JEV_MODEL,
        classifierVersion: CLASSIFIER_VERSION,
      });
    }
  }
  return predictions;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const rerunRequested = args.includes('--rerun');
  const paths = args.filter((arg) => arg !== '--rerun');
  if (paths.length !== 1 || paths[0].startsWith('-')) {
    throw new Error('Usage: npm run eval:reviews -- <export.json> [--rerun]');
  }
  const value: unknown = JSON.parse(await readFile(paths[0], 'utf8'));
  validateEventReviewDataset(value);
  const predictions = rerunRequested ? await rerun(value) : undefined;
  const report = evaluateEventReviewDataset(value, predictions);
  printReport(report, rerunRequested ? `Rerun with ${JEV_MODEL}` : 'Recorded model replay');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Review evaluation failed.');
  process.exitCode = 1;
});

