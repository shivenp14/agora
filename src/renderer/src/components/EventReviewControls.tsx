import { FormEvent, useEffect, useState } from 'react'
import type { EventReview, ReviewBasis, ReviewLabel } from '../../../shared/eventReview'
import type { ScrapedEvent } from '../types'

interface Props {
  event: ScrapedEvent
  scanDate: string
  captureTimestamp: number
  review: EventReview | null
  stale: boolean
  onSaved: (review: EventReview) => void
  defaultOpen?: boolean
}

const labels: Array<{ value: ReviewLabel; label: string }> = [
  { value: 'provided', label: 'Food provided' },
  { value: 'not_provided', label: 'No food provided' },
  { value: 'uncertain', label: 'Still uncertain' },
]

const bases: Array<{ value: ReviewBasis; label: string }> = [
  { value: 'captured_evidence', label: 'Captured listing and flyer' },
  { value: 'organizer_confirmed', label: 'Organizer confirmed' },
  { value: 'attended', label: 'I attended' },
]

export default function EventReviewControls({ event, scanDate, captureTimestamp, review, stale, onSaved, defaultOpen = false }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [label, setLabel] = useState<ReviewLabel>(review?.label ?? 'uncertain')
  const [basis, setBasis] = useState<ReviewBasis>(review?.basis ?? 'captured_evidence')
  const [note, setNote] = useState(review?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setLabel(review?.label ?? 'uncertain')
    setBasis(review?.basis ?? 'captured_evidence')
    setNote(review?.note ?? '')
    setError('')
    setMessage('')
  }, [review, event.sourceUrl])

  const save = async (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault()
    if (!scanDate || !event.sourceUrl || captureTimestamp <= 0) {
      setError(captureTimestamp <= 0
        ? 'This result set has no saved scan snapshot. Run a fresh scan before reviewing events.'
        : 'This event has no stable Ducklink RSVP link, so its review cannot be saved.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const saved = await window.api.saveEventReview({ scanDate, captureTimestamp, sourceUrl: event.sourceUrl, label, basis, note })
      onSaved(saved)
      setMessage('Review saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The review could not be saved. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <details open={isOpen} onToggle={(toggle) => setIsOpen(toggle.currentTarget.open)} className="mt-4 border-t border-surface-container-high pt-3">
      <summary className="cursor-pointer font-headline font-bold text-on-surface focus:outline-2 focus:outline-primary">
        Manual food review{review ? ` · Saved ${new Date(review.reviewedAt).toLocaleDateString()}` : ''}
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
        This stores your label and review basis. A captured-evidence judgment reflects the saved listing and flyer; it does not confirm what happened at the event.
      </p>
      <form onSubmit={save} className="mt-3" aria-label={`Review food evidence for ${event.name}`}>

      {stale && review && (
        <p role="status" className="mt-3 rounded-lg bg-secondary-container px-3 py-2 text-xs text-on-secondary-container">
          The listing or flyer changed since this review. Saving again will attach your label to the current captured evidence.
        </p>
      )}

      <details className="mt-3 rounded-lg bg-surface-container-low px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-primary">View captured evidence</summary>
        <div className="mt-3 space-y-3 text-sm text-on-surface-variant">
          <div>
            <h5 className="text-xs font-bold uppercase tracking-wide text-on-surface">Event description</h5>
            <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap">{event.description || 'No description was captured.'}</p>
          </div>
          {event.ocrText && <div>
            <h5 className="text-xs font-bold uppercase tracking-wide text-on-surface">Flyer text (OCR)</h5>
            <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap">{event.ocrText}</p>
          </div>}
          {event.localImageDataUrl && <div>
            <h5 className="text-xs font-bold uppercase tracking-wide text-on-surface">Captured flyer image</h5>
            <img src={event.localImageDataUrl} alt={`Captured flyer for ${event.name}`} className="mt-2 max-h-64 max-w-full rounded-lg object-contain object-left-top" />
            {event.imageEvidence && <p className="mt-1 text-xs">{event.imageEvidence.length} flyer image{event.imageEvidence.length === 1 ? '' : 's'} captured for OCR.</p>}
          </div>}
          {!event.localImageDataUrl && event.imageCandidates?.length ? <p className="text-xs">Flyer links were found, but no image was saved with this scan.</p> : null}
          {event.sourceUrl && <a href={event.sourceUrl} onClick={(click) => { click.preventDefault(); void window.api.openExternal(event.sourceUrl) }} className="inline-flex text-primary underline underline-offset-2">Open original Ducklink listing</a>}
        </div>
      </details>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-on-surface-variant">
          Your label
          <select value={label} onChange={(change) => setLabel(change.target.value as ReviewLabel)} className="mt-1 block min-h-10 w-full rounded-lg border border-surface-container-highest bg-surface-container-lowest px-3 text-sm text-on-surface focus:outline-2 focus:outline-primary">
            {labels.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-on-surface-variant">
          Review basis
          <select value={basis} onChange={(change) => setBasis(change.target.value as ReviewBasis)} className="mt-1 block min-h-10 w-full rounded-lg border border-surface-container-highest bg-surface-container-lowest px-3 text-sm text-on-surface focus:outline-2 focus:outline-primary">
            {bases.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-3 block text-xs font-semibold text-on-surface-variant">
        Note <span className="font-normal">(optional, up to 1,000 characters)</span>
        <textarea value={note} onChange={(change) => setNote(change.target.value)} maxLength={1000} rows={2} className="mt-1 block w-full resize-y rounded-lg border border-surface-container-highest bg-surface-container-lowest px-3 py-2 text-sm font-normal text-on-surface focus:outline-2 focus:outline-primary" />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving || !scanDate || captureTimestamp <= 0} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
          {saving ? 'Saving review…' : review ? 'Update review' : 'Save review'}
        </button>
        {message && <span role="status" className="text-sm text-primary">{message}</span>}
        {error && <span role="alert" className="text-sm text-error">{error}</span>}
      </div>
      </form>
    </details>
  )
}
