import { ScrapedEvent } from '../types'

const TIME_VALUE_PATTERN = String.raw`(?<![:\d])\d{1,2}(?::\d{2})?\s*[AP]M`
const TIME_SUFFIX_PATTERN = String.raw`(?:\s+[A-Z]{2,5}(?:\s*\(GMT[+-]\d{1,2}\))?)?`
const TIME_RANGE_REGEX = new RegExp(
  String.raw`\b(${TIME_VALUE_PATTERN})\s*[–-]\s*(${TIME_VALUE_PATTERN}${TIME_SUFFIX_PATTERN})\b`,
  'i'
)
const SINGLE_TIME_REGEX = new RegExp(
  String.raw`\b(${TIME_VALUE_PATTERN}${TIME_SUFFIX_PATTERN})\b`,
  'i'
)

interface Props {
  events: ScrapedEvent[]
  foodEvents: ScrapedEvent[]
  fromCache: boolean
  onSettings: () => void
  onRefresh: () => void
}

export default function ResultsScreen({
  events,
  foodEvents,
  fromCache,
  onSettings,
  onRefresh,
}: Props) {
  const otherEvents = events.filter((e) => !e.hasFood)
  const hasUncertainEvents = events.some((e) => e.foodStatus === 'uncertain')
  const hasPartialFailure = events.some(
    (e) => e.foodReasoning === 'Food detection failed for this batch'
  )
  const averageFoodConfidence = foodEvents.length
    ? foodEvents.reduce((sum, event) => sum + (event.foodConfidence ?? 0), 0) / foodEvents.length
    : 0

  const getCertaintyLabel = (confidence: number): string => {
    if (confidence >= 0.8) return 'High Certainty'
    if (confidence >= 0.5) return 'Medium Certainty'
    return 'Low Certainty'
  }

  const getCertaintyTone = (confidence: number): string => {
    if (confidence >= 0.8) return 'bg-tertiary-container text-on-tertiary-container'
    if (confidence >= 0.5) return 'bg-secondary-container text-on-secondary-container'
    return 'bg-surface-container-high text-on-surface-variant'
  }

  const formatConfidence = (confidence: number): string => `${Math.round(confidence * 100)}%`

  const openEvent = (url: string) => {
    if (!url) return
    void window.api.openExternal(url)
  }

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8 sm:mb-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-primary font-headline font-bold uppercase tracking-widest text-xs">Scan Results</span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-headline font-extrabold tracking-tight mt-2">Campus Feed Updated</h1>
            <p className="text-on-surface-variant mt-2 text-sm sm:text-base lg:text-lg max-w-2xl leading-relaxed">
              We've identified {events.length} active events across the Hoboken campus. {getCertaintyLabel(averageFoodConfidence).toLowerCase()} confidence of catering detected at {foodEvents.length} locations.
              {fromCache && ' (Loaded from cache)'}
            </p>
          </div>
          <div className="flex w-full flex-col sm:flex-row items-stretch sm:items-center gap-3 md:w-auto md:justify-end">
            <button
              onClick={onSettings}
              aria-label="Open settings"
              className="flex h-11 w-full sm:h-12 sm:w-12 shrink-0 items-center justify-center gap-2 self-center rounded-full bg-surface-container-high text-primary shadow-sm transition-colors hover:bg-surface-dim cursor-pointer"
            >
              <span className="material-symbols-outlined">settings</span>
              <span className="text-sm font-bold sm:hidden">Settings</span>
            </button>
            <button 
              onClick={onRefresh}
              className="w-full sm:w-auto px-6 py-3 bg-surface-container-high text-primary font-headline font-bold rounded-full hover:bg-surface-dim transition-colors cursor-pointer"
            >
              Refresh Data
            </button>
          </div>
        </div>

        {/* Bento Dashboard Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mt-8 sm:mt-10">
          <div className="col-span-1 lg:col-span-2 bg-surface-container-lowest p-6 sm:p-8 rounded-2xl shadow-sm">
            <div>
              <div>
                <h3 className="font-headline font-bold text-slate-500 text-sm uppercase">Total Events Found</h3>
                <div className="text-5xl sm:text-6xl font-headline font-extrabold mt-2">{events.length}</div>
              </div>
            </div>
          </div>
          
          <div className="bg-primary bg-gradient-to-br from-primary to-primary-container p-6 sm:p-8 rounded-2xl text-white flex flex-col justify-between shadow-lg">
            <div>
              <h3 className="font-headline font-bold opacity-80 text-sm uppercase">Free Food Detection</h3>
              <div className="text-5xl sm:text-6xl font-headline font-extrabold mt-2">{foodEvents.length.toString().padStart(2, '0')}</div>
              <p className="mt-4 text-sm font-medium leading-relaxed opacity-90">
                Food identified from event descriptions and flyer text. Check the feed below.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-white">restaurant</span>
              <span className="text-sm font-bold uppercase">Food Detected</span>
            </div>
          </div>
        </div>
      </header>

      {/* Warning Area */}
      {hasPartialFailure && (
        <section className="max-w-6xl mx-auto mb-10">
          <div className="bg-error-container/40 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 border-l-4 border-error">
            <span className="material-symbols-outlined text-error">warning</span>
            <p className="text-sm font-medium text-on-error-container">
              <strong>AI classification incomplete:</strong> Some events could not be checked for food. Refresh to try again.
            </p>
            <button onClick={onRefresh} className="sm:ml-auto w-full sm:w-auto text-error text-xs font-bold uppercase tracking-wider cursor-pointer hover:underline text-left sm:text-right">Refresh Data</button>
          </div>
        </section>
      )}

      {/* Events List */}
      <section className="max-w-6xl mx-auto grid grid-cols-1 gap-12">
        {/* Free Food Category */}
        {foodEvents.length > 0 ? (
          <div>
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-xl sm:text-2xl font-headline font-extrabold">Free Food Detected</h2>
              <div className="h-[2px] flex-grow bg-surface-container-high"></div>
            </div>
            <div className="space-y-4 sm:space-y-6">
              {foodEvents.map((event) => (
                <div key={event.id} className="group flex flex-col md:flex-row bg-surface-container-lowest rounded-2xl overflow-hidden hover:shadow-xl transition-shadow duration-300 border border-surface-container-highest/30">
                  <div className="w-full md:w-64 h-44 sm:h-48 md:h-auto overflow-hidden bg-surface-container-low flex-shrink-0 relative">
                    {getEventImageSrc(event) ? (
                      <img className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" src={getEventImageSrc(event)!} alt={event.name} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <span className="material-symbols-outlined text-6xl opacity-50">fastfood</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-grow p-5 sm:p-8 flex flex-col justify-between gap-4">
                    <div>
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                        <span className={`${getCertaintyTone(event.foodConfidence ?? 0)} px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 w-fit`}>
                          <span>{getCertaintyLabel(event.foodConfidence ?? 0)}</span>
                          <span className="opacity-70 normal-case tracking-normal font-semibold">{formatConfidence(event.foodConfidence ?? 0)}</span>
                        </span>
                        <div className="text-left sm:text-right text-on-surface-variant font-headline font-bold text-sm">
                          {getEventDateLabel(event) && <div>{getEventDateLabel(event)}</div>}
                          {getEventTimeLabel(event) && <div>{getEventTimeLabel(event)}</div>}
                        </div>
                      </div>
                      <h3 className="text-xl sm:text-2xl font-headline font-bold text-on-surface group-hover:text-primary transition-colors">{event.name}</h3>
                      <p className="mt-3 sm:mt-4 text-slate-600 line-clamp-2">{event.foodReasoning || 'Food confirmed by visual analysis.'}</p>
                    </div>
                    <div className="mt-2 flex justify-center sm:justify-end items-end">
                      <button
                        type="button"
                        onClick={() => openEvent(event.sourceUrl)}
                        disabled={!event.sourceUrl}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-surface-container-low hover:bg-surface-dim text-primary font-headline font-bold px-6 py-3 rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                        Open on Ducklink
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : events.length > 0 && (
          <div className="bg-surface-container-low rounded-2xl p-8 sm:p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-slate-300 mb-4 block">search_off</span>
            <h3 className="text-xl sm:text-2xl font-headline font-bold text-on-surface mb-2">{hasUncertainEvents || hasPartialFailure ? 'No Free Food Confirmed' : 'No Free Food Detected'}</h3>
            <p className="text-on-surface-variant max-w-md mx-auto">
              {hasUncertainEvents || hasPartialFailure
                ? 'Some food checks are uncertain or unavailable. Review the original event listings or refresh the scan.'
                : `We scanned ${events.length} events, but found no evidence of food provided to attendees.`}
            </p>
          </div>
        )}

        {/* Other Events Category */}
        {otherEvents.length > 0 && (
          <div>
            <div className="flex items-center gap-4 mb-6 opacity-60">
              <h2 className="text-xl sm:text-2xl font-headline font-extrabold">Other Campus Events</h2>
              <div className="h-[2px] flex-grow bg-surface-container-high"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {otherEvents.map((event) => (
                <div key={event.id} className="bg-surface-container-low hover:bg-surface-dim transition-colors p-5 sm:p-6 rounded-2xl flex items-center gap-4 sm:gap-6">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-surface-container-highest flex items-center justify-center text-slate-400 flex-shrink-0 overflow-hidden">
                    {getEventImageSrc(event) ? (
                      <img src={getEventImageSrc(event)!} alt={event.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-3xl">event_busy</span>
                    )}
                  </div>
                  <div className="flex-grow min-w-0">
                    <h4 className="font-headline font-bold text-on-surface truncate text-sm sm:text-base">{event.name}</h4>
                    <p className="text-xs text-on-surface-variant truncate">
                      {getEventDateLabel(event) || 'Date TBA'}
                    </p>
                    <p className="text-xs text-on-surface-variant truncate">
                      {getEventTimeLabel(event) || 'Time TBA'}
                    </p>
                    <span className="text-[10px] font-bold text-slate-400 uppercase mt-2 block">{event.foodStatus === 'uncertain' ? 'Food availability uncertain' : event.foodReasoning === 'Food detection failed for this batch' ? 'Food check unavailable' : 'No Food Detected'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEvent(event.sourceUrl)}
                    disabled={!event.sourceUrl}
                    className="inline-flex items-center justify-center gap-1 text-slate-400 hover:text-primary flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined">open_in_new</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No events at all */}
        {events.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[320px] sm:min-h-[400px] gap-4 text-center">
            <span className="material-symbols-outlined text-6xl text-slate-300 block">event_busy</span>
            <h2 className="text-xl sm:text-2xl font-headline font-bold text-on-surface">No Events Today</h2>
            <p className="text-on-surface-variant max-w-sm">
              No events were found on Ducklink for today. Check back later or try rescanning.
            </p>
            <button
              onClick={onRefresh}
              className="mt-4 w-full sm:w-auto px-6 py-3 bg-surface-container-highest hover:bg-surface-dim rounded-full text-sm font-bold transition-colors cursor-pointer"
            >
              Refresh Data
            </button>
          </div>
        )}
      </section>

    </div>
  )
}

function getEventImageSrc(event: ScrapedEvent): string | null {
  if (event.localImageDataUrl) {
    return event.localImageDataUrl
  }

  if (event.localImagePath) {
    return encodeURI(`file://${event.localImagePath.replace(/\\/g, '/')}`)
  }

  return event.imageUrl
}

function getEventDateLabel(event: ScrapedEvent): string {
  const matches = Array.from(
    event.rawDateText.matchAll(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/g)
  ).map((match) => match[0])

  if (matches.length > 1) {
    return `${matches[0]} – ${matches[matches.length - 1]}`
  }

  if (matches.length === 1) {
    return matches[0]
  }

  if (!event.date) return ''

  const parsed = new Date(`${event.date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return ''

  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getEventTimeLabel(event: ScrapedEvent): string {
  if (event.startTime && event.endTime) {
    return `${event.startTime} – ${event.endTime}`
  }

  if (event.startTime) {
    return event.startTime
  }

  const normalizedRawDateText = normalizeScheduleText(event.rawDateText)
  const match = normalizedRawDateText.match(TIME_RANGE_REGEX)

  if (match) {
    return `${match[1].replace(/\s+/g, ' ').trim()} – ${match[2].replace(/\s+/g, ' ').trim()}`
  }

  const single = normalizedRawDateText.match(SINGLE_TIME_REGEX)
  return single ? single[1].replace(/\s+/g, ' ').trim() : ''
}

function normalizeScheduleText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/(\b\d{4})(?=\d{1,2}(?::\d{2})?\s*[AP]M\b)/g, '$1 ')
}
