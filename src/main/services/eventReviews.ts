import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { app } from 'electron'
import { CLASSIFIER_VERSION, JEV_MODEL } from './llm'
import {
  EventReview,
  EventReviewDataset,
  ReviewDraft,
  ReviewEvidenceSnapshot,
  ReviewImageCandidate,
  ReviewModelSnapshot,
  UnresolvedEventReview,
  getEventReviewKey,
  validateEventReview,
  validateReviewDraft,
} from '../../shared/eventReview'

interface ReviewStore {
  schemaVersion: 1
  reviews: EventReview[]
}

interface ReviewableEvent {
  id: string
  name: string
  description: string
  sourceUrl: string
  imageUrl: string | null
  ocrText: string
  combinedText: string
  hasFood: boolean
  foodStatus?: 'provided' | 'not_provided' | 'uncertain' | 'unavailable'
  foodConfidence: number
  foodReasoning: string
  imageCandidates?: ReviewImageCandidate[]
  imageEvidence?: Array<ReviewImageCandidate & { sha256: string }>
}

const MAX_STORE_BYTES = 20 * 1024 * 1024

export function getEventReviewStorePath(): string {
  return path.join(app.getPath('userData'), 'event-reviews.json')
}

export function createReviewStore(filePath: string, maxBytes = MAX_STORE_BYTES) {
  function read(): ReviewStore {
    let stat: fs.Stats
    try {
      stat = fs.statSync(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore()
      throw new Error('Saved reviews could not be read. Check available disk access and try again.')
    }
    if (stat.size > maxBytes) throw new Error('Saved reviews exceed the local storage limit. Export or remove older review data before saving more.')
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (!isValidStore(parsed)) throw new Error('Review store has an unsupported or invalid format')
      return parsed
    } catch {
      recoverInvalidFile(filePath)
      return emptyStore()
    }
  }

  function write(store: ReviewStore): void {
    const directory = path.dirname(filePath)
    fs.mkdirSync(directory, { recursive: true })
    const tempPath = `${filePath}.tmp`
    const serialized = JSON.stringify(store, null, 2)
    if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
      throw new Error('Saved reviews reached the local storage limit. Export existing reviews before adding more.')
    }
    fs.writeFileSync(tempPath, serialized, { mode: 0o600 })
    fs.renameSync(tempPath, filePath)
  }

  return {
    getAll(): EventReview[] {
      return read().reviews
    },
    upsert(review: EventReview): EventReview[] {
      const store = read()
      const key = getEventReviewKey(review.scanDate, review.sourceUrl)
      const next = store.reviews.filter((item) => getEventReviewKey(item.scanDate, item.sourceUrl) !== key)
      next.push(review)
      write({ schemaVersion: 1, reviews: next })
      return next
    },
  }
}

export function getReviewsForScan(
  scanDate: string,
  capturedAt: string,
  events: ReviewableEvent[],
  reviews: EventReview[],
): Array<{ sourceUrl: string; review: EventReview | null; stale: boolean }> {
  return events.map((event) => {
    const review = findReview(reviews, scanDate, event.sourceUrl)
    if (!review) return { sourceUrl: event.sourceUrl, review: null, stale: false }
    const snapshot = createSnapshot(scanDate, capturedAt, event)
    return {
      sourceUrl: event.sourceUrl,
      review,
      stale: review.evidenceFingerprint !== snapshot.evidenceFingerprint,
    }
  })
}

export function saveReviewDraft(
  draftValue: unknown,
  scanDate: string,
  capturedAt: string,
  events: ReviewableEvent[],
  store: ReturnType<typeof createReviewStore>,
  now: Date = new Date(),
): EventReview {
  if (!validateReviewDraft(draftValue)) throw new Error('Review details are invalid. Choose a label and enter a note up to 1,000 characters.')
  const draft = draftValue as ReviewDraft
  if (draft.scanDate !== scanDate) throw new Error('These results are out of date. Reload the current scan before saving the review.')
  if (draft.captureTimestamp !== Date.parse(capturedAt)) throw new Error('These results have been replaced by a newer scan. Reload the current results before saving the review.')
  const event = events.find((candidate) => getEventReviewKey(scanDate, candidate.sourceUrl) === getEventReviewKey(scanDate, draft.sourceUrl))
  if (!event) throw new Error('This event is no longer in the current cached scan. Refresh the results before saving.')
  const snapshot = createSnapshot(scanDate, capturedAt, event)
  const review: EventReview = {
    schemaVersion: 1,
    scanDate,
    capturedAt,
    sourceUrl: event.sourceUrl,
    eventName: event.name,
    evidenceFingerprint: snapshot.evidenceFingerprint,
    capturedEvidence: snapshot.capturedEvidence,
    model: snapshot.model,
    label: draft.label,
    basis: draft.basis,
    note: draft.note.trim(),
    reviewedAt: now.toISOString(),
  }
  if (!validateEventReview(review)) throw new Error('The review could not be saved because the captured event data is invalid.')
  store.upsert(review)
  return review
}

export function buildEventReviewDataset(
  scanDate: string,
  capturedAt: string,
  events: ReviewableEvent[],
  reviews: EventReview[],
  exportedAt: Date = new Date(),
): EventReviewDataset {
  const current = events.map((event) => createSnapshot(scanDate, capturedAt, event))
  const currentByKey = new Map(current.map((snapshot) => [getEventReviewKey(scanDate, snapshot.event.sourceUrl), snapshot]))
  const scanReviews = reviews.filter((review) => {
    const snapshot = currentByKey.get(getEventReviewKey(review.scanDate, review.sourceUrl))
    return Boolean(snapshot && review.evidenceFingerprint === snapshot.evidenceFingerprint)
  })
  const reviewedKeys = new Set(scanReviews.map((review) => getEventReviewKey(review.scanDate, review.sourceUrl)))
  const unresolved: UnresolvedEventReview[] = current
    .filter(({ event }) => !reviewedKeys.has(getEventReviewKey(scanDate, event.sourceUrl)))
    .map(({ event, evidenceFingerprint, capturedEvidence, model }) => ({
      schemaVersion: 1,
      scanDate,
      capturedAt,
      sourceUrl: event.sourceUrl,
      eventName: event.name,
      evidenceFingerprint,
      capturedEvidence,
      model,
      label: null,
    }))
  return { schemaVersion: 1, exportedAt: exportedAt.toISOString(), reviews: scanReviews, unresolved }
}

function createSnapshot(scanDate: string, capturedAt: string, event: ReviewableEvent) {
  const capturedEvidence: ReviewEvidenceSnapshot = {
    description: event.description ?? '',
    ocrText: event.ocrText ?? '',
    combinedText: event.combinedText ?? '',
    imageUrl: event.imageUrl ?? null,
    imageCandidates: Array.isArray(event.imageCandidates) ? event.imageCandidates.map(({ url, source }) => ({ url, source })) : [],
    imageEvidence: Array.isArray(event.imageEvidence)
      ? event.imageEvidence.map(({ url, source, sha256 }) => ({ url, source, sha256 }))
      : null,
  }
  const model: ReviewModelSnapshot = {
    name: 'Jev',
    version: JEV_MODEL,
    classifierVersion: CLASSIFIER_VERSION,
    status: event.foodStatus ?? (event.hasFood ? 'provided' : 'not_provided'),
    hasFood: event.hasFood,
    confidence: Number.isFinite(event.foodConfidence) ? event.foodConfidence : 0,
    reasoning: event.foodReasoning ?? '',
  }
  const fingerprintInput = JSON.stringify({ scanDate, eventName: event.name, capturedEvidence, model })
  const evidenceFingerprint = createHash('sha256').update(fingerprintInput).digest('hex')
  return { event, capturedAt, capturedEvidence, model, evidenceFingerprint }
}

function findReview(reviews: EventReview[], scanDate: string, sourceUrl: string): EventReview | null {
  const key = getEventReviewKey(scanDate, sourceUrl)
  return reviews.find((review) => getEventReviewKey(review.scanDate, review.sourceUrl) === key) ?? null
}

function isValidStore(value: unknown): value is ReviewStore {
  if (!value || typeof value !== 'object') return false
  const store = value as Partial<ReviewStore>
  if (store.schemaVersion !== 1 || !Array.isArray(store.reviews) || store.reviews.length > 100_000) return false
  const keys = new Set<string>()
  for (const review of store.reviews) {
    if (!validateEventReview(review)) return false
    const key = getEventReviewKey(review.scanDate, review.sourceUrl)
    if (keys.has(key)) return false
    keys.add(key)
  }
  return true
}

function emptyStore(): ReviewStore {
  return { schemaVersion: 1, reviews: [] }
}

function recoverInvalidFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.renameSync(filePath, `${filePath}.corrupt-${Date.now()}`)
  } catch {
    // Keep the store usable in memory if recovery cannot rename the damaged file.
  }
}
