import type { EventReviewDataset, EventReview, UnresolvedEventReview } from '../shared/eventReview';

export type EvaluationPrediction = {
  status: 'provided' | 'not_provided' | 'uncertain';
  confidence: number;
  modelName: string;
  modelVersion: string;
  classifierVersion: string;
};

export type ReviewEvaluationReport = {
  totalRecords: number;
  labeledRecords: number;
  unresolvedRecords: number;
  labelCounts: Record<'provided' | 'not_provided' | 'uncertain', number>;
  recordedModelUncertain: { count: number; denominator: number; rate: number | null };
  reviewerUncertain: { count: number; denominator: number; rate: number | null };
  agreement: {
    overall: AgreementSummary;
    capturedEvidence: AgreementSummary;
    externallyConfirmed: AgreementSummary;
    byBasis: Record<string, AgreementSummary>;
  };
  mismatches: Array<{
    eventName: string;
    sourceUrl: string;
    basis: string;
    modelStatus: string;
    label: string;
    confidence: number;
  }>;
  cohorts: Array<{
    modelName: string;
    modelVersion: string;
    classifierVersion: string;
    agreement: AgreementSummary;
  }>;
};

type AgreementSummary = { matched: number; denominator: number; rate: number | null };
type ReviewRecord = (EventReview | UnresolvedEventReview) & {
  label: EventReview['label'] | null;
  basis?: EventReview['basis'];
};

const LABELS = ['provided', 'not_provided', 'uncertain'] as const;
const BASES = ['captured_evidence', 'organizer_confirmed', 'attended'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Review dataset has a missing or empty ${field}.`);
}

function validDate(value: unknown, field: string): asserts value is string {
  requiredString(value, field);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`Review dataset has an invalid ${field}.`);
  }
}

export function reviewSourceKey(scanDate: string, sourceUrl: string): string {
  const url = new URL(sourceUrl);
  const rsvpId = url.searchParams.get('id');
  return rsvpId ? `${scanDate.trim()}::${rsvpId}` : `${scanDate.trim()}::${url.origin.toLowerCase()}${url.pathname}`;
}

function normalizedSourceKey(record: Record<string, unknown>): string {
  return reviewSourceKey(record.scanDate as string, record.sourceUrl as string);
}

function validateRecord(value: unknown, kind: 'review' | 'unresolved'): ReviewRecord {
  if (!isObject(value)) throw new Error(`Review dataset contains an invalid ${kind} record.`);
  if (value.schemaVersion !== 1) throw new Error(`Review dataset ${kind} has an unsupported schemaVersion.`);
  const scanDate = typeof value.scanDate === 'string' ? value.scanDate : '';
  const parsedScanDate = /^\d{4}-\d{2}-\d{2}$/.test(scanDate) ? new Date(`${scanDate}T00:00:00.000Z`) : null;
  if (!parsedScanDate || !Number.isFinite(parsedScanDate.getTime()) || parsedScanDate.toISOString().slice(0, 10) !== scanDate) {
    throw new Error(`Review dataset has an invalid ${kind}.scanDate.`);
  }
  validDate(value.capturedAt, `${kind}.capturedAt`);
  requiredString(value.sourceUrl, `${kind}.sourceUrl`);
  try {
    const url = new URL(value.sourceUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'ducklink.stevens.edu' ||
      !url.pathname.endsWith('/rsvp_boot') || !/^\d+$/.test(url.searchParams.get('id') ?? '')) throw new Error();
  } catch { throw new Error(`Review dataset has an invalid ${kind}.sourceUrl.`); }
  requiredString(value.eventName, `${kind}.eventName`);
  requiredString(value.evidenceFingerprint, `${kind}.evidenceFingerprint`);
  if (!/^[a-f0-9]{64}$/.test(value.evidenceFingerprint)) throw new Error(`Review dataset has an invalid ${kind}.evidenceFingerprint.`);

  if (!isObject(value.capturedEvidence)) throw new Error(`Review dataset ${kind} is missing capturedEvidence.`);
  for (const key of ['description', 'ocrText', 'combinedText'] as const) {
    if (typeof value.capturedEvidence[key] !== 'string') {
      throw new Error(`Review dataset ${kind}.capturedEvidence.${key} must be a string.`);
    }
  }
  if (value.capturedEvidence.imageUrl !== null && typeof value.capturedEvidence.imageUrl !== 'string') {
    throw new Error(`Review dataset ${kind}.capturedEvidence.imageUrl must be a string or null.`);
  }
  if (!Array.isArray(value.capturedEvidence.imageCandidates) ||
    value.capturedEvidence.imageCandidates.some((candidate) => !isObject(candidate) ||
      typeof candidate.url !== 'string' || typeof candidate.source !== 'string')) {
    throw new Error(`Review dataset ${kind}.capturedEvidence.imageCandidates is incomplete.`);
  }
  const imageEvidence = value.capturedEvidence.imageEvidence;
  if (imageEvidence !== null && (!Array.isArray(imageEvidence) || imageEvidence.some((image) =>
    !isObject(image) || typeof image.url !== 'string' || typeof image.source !== 'string' ||
    typeof image.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(image.sha256)))) {
    throw new Error(`Review dataset ${kind}.capturedEvidence.imageEvidence is incomplete.`);
  }

  if (!isObject(value.model)) throw new Error(`Review dataset ${kind} is missing its recorded model result.`);
  for (const key of ['name', 'version', 'classifierVersion'] as const) requiredString(value.model[key], `${kind}.model.${key}`);
  if (!LABELS.includes(value.model.status as typeof LABELS[number])) {
    throw new Error(`Review dataset ${kind} has an unavailable or invalid recorded model result.`);
  }
  if (typeof value.model.confidence !== 'number' || !Number.isFinite(value.model.confidence) ||
    value.model.confidence < 0 || value.model.confidence > 1) {
    throw new Error(`Review dataset ${kind} has an invalid recorded confidence.`);
  }
  if (typeof value.model.hasFood !== 'boolean' || value.model.hasFood !== (value.model.status === 'provided')) {
    throw new Error(`Review dataset ${kind} has an inconsistent recorded hasFood result.`);
  }
  if (typeof value.model.reasoning !== 'string') throw new Error(`Review dataset ${kind}.model.reasoning must be a string.`);

  if (kind === 'review') {
    if (!LABELS.includes(value.label as typeof LABELS[number])) throw new Error('Review dataset has a missing or invalid review label.');
    if (!BASES.includes(value.basis as typeof BASES[number])) throw new Error('Review dataset has a missing or invalid review basis.');
    if (typeof value.note !== 'string' || value.note.length > 1000) throw new Error('Review dataset has an invalid review.note.');
    validDate(value.reviewedAt, 'review.reviewedAt');
  } else if (value.label !== null) {
    throw new Error('Unresolved review records must have a null label.');
  }
  return value as unknown as ReviewRecord;
}

export function validateEventReviewDataset(value: unknown): EventReviewDataset {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.reviews) || !Array.isArray(value.unresolved)) {
    throw new Error('Invalid review dataset: expected schemaVersion 1 with reviews and unresolved arrays.');
  }
  validDate(value.exportedAt, 'exportedAt');
  const records = [
    ...value.reviews.map((record) => validateRecord(record, 'review')),
    ...value.unresolved.map((record) => validateRecord(record, 'unresolved')),
  ];
  const seen = new Set<string>();
  for (const record of records) {
    const key = normalizedSourceKey(record as unknown as Record<string, unknown>);
    if (seen.has(key)) throw new Error(`Review dataset has duplicate event source: ${record.sourceUrl}.`);
    seen.add(key);
  }
  return value as unknown as EventReviewDataset;
}

function summary(records: ReviewRecord[], predictionFor: (record: ReviewRecord) => EvaluationPrediction): AgreementSummary {
  const labeled = records.filter((record) => record.label !== null);
  const matched = labeled.filter((record) => predictionFor(record).status === record.label).length;
  return { matched, denominator: labeled.length, rate: labeled.length ? matched / labeled.length : null };
}

export function evaluateEventReviewDataset(
  input: unknown,
  rerunPredictions?: Map<string, EvaluationPrediction>,
): ReviewEvaluationReport {
  const dataset = validateEventReviewDataset(input);
  const records = [
    ...(dataset.reviews as ReviewRecord[]),
    ...(dataset.unresolved as ReviewRecord[]),
  ];
  const predictionFor = (record: ReviewRecord): EvaluationPrediction => {
    const key = normalizedSourceKey(record as unknown as Record<string, unknown>);
    const rerun = rerunPredictions?.get(key);
    if (rerun) return rerun;
    return {
      status: record.model.status as EvaluationPrediction['status'],
      confidence: record.model.confidence,
      modelName: record.model.name,
      modelVersion: record.model.version,
      classifierVersion: record.model.classifierVersion,
    };
  };
  if (rerunPredictions) {
    for (const record of records) {
      if (!rerunPredictions.has(normalizedSourceKey(record as unknown as Record<string, unknown>))) {
        throw new Error(`Rerun results are incomplete: missing ${record.sourceUrl}.`);
      }
    }
    if (rerunPredictions.size !== records.length) throw new Error('Rerun results contain unknown or duplicate event sources.');
  }

  const reviews = dataset.reviews as ReviewRecord[];
  const labelCounts = { provided: 0, not_provided: 0, uncertain: 0 };
  for (const review of reviews) labelCounts[review.label as keyof typeof labelCounts]++;
  const byBasis: Record<string, AgreementSummary> = {};
  for (const basis of BASES) {
    byBasis[basis] = summary(reviews.filter((record) => record.basis === basis), predictionFor);
  }
  const mismatches = reviews.flatMap((record) => {
    const prediction = predictionFor(record);
    return prediction.status === record.label ? [] : [{
      eventName: record.eventName,
      sourceUrl: record.sourceUrl,
      basis: record.basis as string,
      modelStatus: prediction.status,
      label: record.label as string,
      confidence: prediction.confidence,
    }];
  });
  const cohorts = new Map<string, { name: string; version: string; classifierVersion: string; records: ReviewRecord[] }>();
  for (const record of reviews) {
    const prediction = predictionFor(record);
    const key = `${prediction.modelName}\u0000${prediction.modelVersion}\u0000${prediction.classifierVersion}`;
    const cohort = cohorts.get(key) ?? { name: prediction.modelName, version: prediction.modelVersion,
      classifierVersion: prediction.classifierVersion, records: [] };
    cohort.records.push(record);
    cohorts.set(key, cohort);
  }
  const labeled = reviews.length;
  const total = records.length;
  const modelUncertain = records.filter((record) => predictionFor(record).status === 'uncertain').length;
  const reviewerUncertain = labelCounts.uncertain;
  return {
    totalRecords: total,
    labeledRecords: labeled,
    unresolvedRecords: dataset.unresolved.length,
    labelCounts,
    recordedModelUncertain: { count: modelUncertain, denominator: total, rate: total ? modelUncertain / total : null },
    reviewerUncertain: { count: reviewerUncertain, denominator: labeled, rate: labeled ? reviewerUncertain / labeled : null },
    agreement: {
      overall: summary(reviews, predictionFor),
      capturedEvidence: byBasis.captured_evidence,
      externallyConfirmed: (() => {
        const matched = byBasis.organizer_confirmed.matched + byBasis.attended.matched;
        const denominator = byBasis.organizer_confirmed.denominator + byBasis.attended.denominator;
        return { matched, denominator, rate: denominator ? matched / denominator : null };
      })(),
      byBasis,
    },
    mismatches,
    cohorts: [...cohorts.values()].map((cohort) => {
      const agreement = summary(cohort.records, predictionFor);
      return { modelName: cohort.name, modelVersion: cohort.version, classifierVersion: cohort.classifierVersion, agreement };
    }),
  };
}
