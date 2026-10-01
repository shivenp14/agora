export type ReviewLabel = 'provided' | 'not_provided' | 'uncertain'
export type ReviewBasis = 'captured_evidence' | 'organizer_confirmed' | 'attended'

export interface ReviewImageCandidate {
  url: string
  source: string
}

export interface ReviewEvidenceSnapshot {
  description: string
  ocrText: string
  combinedText: string
  imageUrl: string | null
  imageCandidates: ReviewImageCandidate[]
  imageEvidence: Array<ReviewImageCandidate & { sha256: string }> | null
}

export interface ReviewModelSnapshot {
  name: string
  version: string
  classifierVersion: string
  status: ReviewLabel | 'unavailable'
  hasFood: boolean
  confidence: number
  reasoning: string
}

export interface EventReview {
  schemaVersion: 1
  scanDate: string
  capturedAt: string
  sourceUrl: string
  eventName: string
  evidenceFingerprint: string
  capturedEvidence: ReviewEvidenceSnapshot
  model: ReviewModelSnapshot
  label: ReviewLabel
  basis: ReviewBasis
  note: string
  reviewedAt: string
}

export interface UnresolvedEventReview extends Omit<EventReview, 'label' | 'basis' | 'note' | 'reviewedAt'> {
  label: null
}

export interface EventReviewDataset {
  schemaVersion: 1
  exportedAt: string
  reviews: EventReview[]
  unresolved: UnresolvedEventReview[]
}

export interface ReviewDraft {
  scanDate: string
  captureTimestamp: number
  sourceUrl: string
  label: ReviewLabel
  basis: ReviewBasis
  note: string
}

export const REVIEW_DATASET_SCHEMA_VERSION = 1 as const
export const MAX_REVIEW_NOTE_LENGTH = 1000
const REVIEW_LABELS: ReviewLabel[] = ['provided', 'not_provided', 'uncertain']
const REVIEW_BASES: ReviewBasis[] = ['captured_evidence', 'organizer_confirmed', 'attended']

export function getEventReviewKey(scanDate: string, sourceUrl: string): string {
  const parsed = parseRsvpUrl(sourceUrl)
  const identity = parsed?.rsvpId ?? normalizeSourceUrl(sourceUrl)
  return `${scanDate.trim()}::${identity}`
}

export function validateReviewDraft(value: unknown): value is ReviewDraft {
  if (!isRecord(value)) return false
  if (typeof value.scanDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.scanDate)) return false
  if (typeof value.captureTimestamp !== 'number' || !Number.isInteger(value.captureTimestamp) || value.captureTimestamp <= 0) return false
  if (typeof value.sourceUrl !== 'string' || !isDucklinkRsvpUrl(value.sourceUrl)) return false
  if (!REVIEW_LABELS.includes(value.label as ReviewLabel)) return false
  if (!REVIEW_BASES.includes(value.basis as ReviewBasis)) return false
  return typeof value.note === 'string' && value.note.length <= MAX_REVIEW_NOTE_LENGTH
}

export function validateEventReview(value: unknown): value is EventReview {
  if (!isRecord(value) || value.schemaVersion !== REVIEW_DATASET_SCHEMA_VERSION) return false
  if (typeof value.scanDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.scanDate)) return false
  if (typeof value.capturedAt !== 'string' || !isIsoDate(value.capturedAt)) return false
  if (typeof value.sourceUrl !== 'string' || !isDucklinkRsvpUrl(value.sourceUrl)) return false
  if (typeof value.eventName !== 'string' || value.eventName.length > 500) return false
  if (typeof value.evidenceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.evidenceFingerprint)) return false
  if (!isReviewEvidenceSnapshot(value.capturedEvidence) || !isReviewModelSnapshot(value.model)) return false
  if (!REVIEW_LABELS.includes(value.label as ReviewLabel) || !REVIEW_BASES.includes(value.basis as ReviewBasis)) return false
  return typeof value.note === 'string' && value.note.length <= MAX_REVIEW_NOTE_LENGTH &&
    typeof value.reviewedAt === 'string' && isIsoDate(value.reviewedAt)
}

export function validateEventReviewDataset(value: unknown): value is EventReviewDataset {
  if (!isRecord(value) || value.schemaVersion !== REVIEW_DATASET_SCHEMA_VERSION) return false
  if (typeof value.exportedAt !== 'string' || !isIsoDate(value.exportedAt)) return false
  if (!Array.isArray(value.reviews) || !value.reviews.every(validateEventReview)) return false
  if (!Array.isArray(value.unresolved) || !value.unresolved.every(validateUnresolvedEventReview)) return false
  const keys = new Set<string>()
  for (const review of [...value.reviews, ...value.unresolved]) {
    const key = getEventReviewKey(review.scanDate, review.sourceUrl)
    if (keys.has(key)) return false
    keys.add(key)
  }
  return true
}

export function validateUnresolvedEventReview(value: unknown): value is UnresolvedEventReview {
  if (!isRecord(value) || value.schemaVersion !== REVIEW_DATASET_SCHEMA_VERSION || value.label !== null) return false
  return typeof value.scanDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.scanDate) &&
    typeof value.capturedAt === 'string' && isIsoDate(value.capturedAt) &&
    typeof value.sourceUrl === 'string' && isDucklinkRsvpUrl(value.sourceUrl) &&
    typeof value.eventName === 'string' && value.eventName.length <= 500 &&
    typeof value.evidenceFingerprint === 'string' && /^[a-f0-9]{64}$/.test(value.evidenceFingerprint) &&
    isReviewEvidenceSnapshot(value.capturedEvidence) && isReviewModelSnapshot(value.model)
}

export function isDucklinkRsvpUrl(sourceUrl: string): boolean {
  const parsed = parseRsvpUrl(sourceUrl)
  return parsed !== null
}

function parseRsvpUrl(sourceUrl: string): { rsvpId: string } | null {
  try {
    const url = new URL(sourceUrl)
    if (url.protocol !== 'https:' || url.hostname !== 'ducklink.stevens.edu' || !url.pathname.endsWith('/rsvp_boot')) return null
    const rsvpId = url.searchParams.get('id')
    if (!rsvpId || !/^\d+$/.test(rsvpId)) return null
    return { rsvpId }
  } catch {
    return null
  }
}

function normalizeSourceUrl(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl)
    url.hash = ''
    url.searchParams.sort()
    return url.toString().replace(/\/$/, '')
  } catch {
    return sourceUrl.trim()
  }
}

function isReviewEvidenceSnapshot(value: unknown): value is ReviewEvidenceSnapshot {
  if (!isRecord(value)) return false
  if (!['description', 'ocrText', 'combinedText'].every((key) => typeof value[key] === 'string')) return false
  if (value.imageUrl !== null && typeof value.imageUrl !== 'string') return false
  if (!Array.isArray(value.imageCandidates) || !value.imageCandidates.every((candidate) =>
    isRecord(candidate) && typeof candidate.url === 'string' && typeof candidate.source === 'string'
  )) return false
  if (value.imageEvidence === null) return true
  return Array.isArray(value.imageEvidence) && value.imageEvidence.every((image) =>
    isRecord(image) && typeof image.url === 'string' && typeof image.source === 'string' &&
    typeof image.sha256 === 'string' && /^[a-f0-9]{64}$/.test(image.sha256)
  )
}

function isReviewModelSnapshot(value: unknown): value is ReviewModelSnapshot {
  return isRecord(value) && typeof value.name === 'string' && typeof value.version === 'string' &&
    typeof value.classifierVersion === 'string' &&
    (REVIEW_LABELS.includes(value.status as ReviewLabel) || value.status === 'unavailable') &&
    typeof value.hasFood === 'boolean' && typeof value.confidence === 'number' &&
    Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1 &&
    typeof value.reasoning === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value)) && value === new Date(value).toISOString()
}
