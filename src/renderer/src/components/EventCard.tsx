import { useState } from 'react'
import { ScrapedEvent } from '../types'
import FoodBadge from './FoodBadge'

interface Props {
  event: ScrapedEvent
  showFoodBadge?: boolean
}

export default function EventCard({ event, showFoodBadge = false }: Props) {
  const [expanded, setExpanded] = useState(false)
  const imageSrc = getEventImageSrc(event)

  return (
    <div
      className={`bg-gray-900 rounded-xl border transition-all duration-200 cursor-pointer hover:bg-gray-800/60 ${
        showFoodBadge
          ? 'border-orange-500/40 shadow-lg shadow-orange-500/5'
          : 'border-gray-800'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-4">
        <div className="flex gap-4">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={event.name}
              className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="w-20 h-20 bg-gray-800 rounded-lg flex-shrink-0 flex items-center justify-center">
              <span className="text-2xl text-gray-600">📅</span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-lg leading-tight truncate">
                {event.name}
              </h3>
              {showFoodBadge && <FoodBadge size="sm" confidence={event.foodConfidence ?? 0} />}
            </div>

            <div className="flex items-center gap-3 mt-2 text-sm text-gray-400">
              {event.startTime && (
                <span className="flex items-center gap-1">
                  <ClockIcon />
                  {event.startTime}
                  {event.endTime ? ` – ${event.endTime}` : ''}
                </span>
              )}
            </div>

            {event.location && (
              <p className="flex items-center gap-1 text-sm text-gray-400 mt-1">
                <LocationIcon />
                {event.location}
              </p>
            )}

            {event.description && !expanded && (
              <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                {event.description}
              </p>
            )}
          </div>

          <ExpandIcon expanded={expanded} />
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-gray-800 space-y-3">
            {event.description && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Description
                </h4>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {event.description}
                </p>
              </div>
            )}

            {showFoodBadge && event.foodReasoning && (
              <div className="bg-orange-500/10 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1">
                  Jev's food result
                </h4>
                <p className="text-sm text-orange-300/80 italic">
                  {event.foodReasoning}{(event.foodConfidence ?? 0) < 0.5 ? ' Check the listing before relying on this result.' : ''}
                </p>
              </div>
            )}

            {event.ocrText && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Image Text (OCR)
                </h4>
                <p className="text-xs text-gray-500 font-mono bg-gray-800 rounded p-2 max-h-24 overflow-y-auto">
                  {event.ocrText}
                </p>
              </div>
            )}

            {event.sourceUrl && (
              <a
                href={event.sourceUrl}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
              >
                View on Ducklink ↗
              </a>
            )}
          </div>
        )}
      </div>
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

function ClockIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  )
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  )
}
