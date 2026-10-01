import { useState, useEffect } from 'react'

interface Props {
  onScan: () => void
  onSettings: () => void
}

export default function HomeScreen({ onScan, onSettings }: Props) {
  const [hasKey, setHasKey] = useState(false)

  useEffect(() => {
    window.api.hasApiKey().then(setHasKey)
  }, [])

  return (
    <div className="max-w-3xl mx-auto min-h-[70vh] flex flex-col justify-center">
      {!hasKey && (
        <div className="mb-8 p-4 sm:p-6 rounded-xl bg-error-container/40 flex flex-col sm:flex-row items-start gap-4 border-l-4 border-error editorial-shadow">
          <span className="material-symbols-outlined text-error mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
          <div>
            <h3 className="font-bold text-on-error-container text-sm sm:text-base">API Configuration Required</h3>
            <p className="text-sm text-on-error-container/80 mt-1 leading-relaxed">
              Your TypeSafe API key is not yet configured. Jev food classification is currently disabled. Please visit <button onClick={onSettings} className="font-bold underline decoration-error/30 hover:decoration-error cursor-pointer">Settings</button> to resolve this.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-3xl bg-surface-container-lowest editorial-shadow px-6 py-10 sm:px-8 sm:py-12 md:px-12 md:py-16 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="availability-pulse"></div>
          <span className="text-xs font-bold uppercase tracking-widest text-tertiary">Live Feed Ready</span>
        </div>
        <h1 className="font-headline text-3xl sm:text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight mb-4">
          No scans yet today.
        </h1>
        <p className="text-on-surface-variant text-base sm:text-lg leading-relaxed max-w-xl mx-auto mb-8">
          Run a fresh scan to populate the main feed with today&apos;s Ducklink events and food detections.
        </p>
        <div className="flex w-full flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <button
            onClick={onScan}
            disabled={!hasKey}
            className={`w-full sm:w-auto bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-full py-4 px-8 sm:px-10 font-bold text-base sm:text-lg shadow-lg hover:shadow-xl active:scale-95 transition-all inline-flex items-center justify-center gap-3 ${!hasKey ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="material-symbols-outlined">flare</span>
            Start New Scan
          </button>
          <button
            onClick={onSettings}
            aria-label="Open settings"
            className="flex h-12 w-full sm:h-14 sm:w-14 shrink-0 items-center justify-center gap-2 self-center rounded-full bg-surface-container-high text-primary shadow-sm transition-colors hover:bg-surface-dim cursor-pointer"
          >
            <span className="material-symbols-outlined">settings</span>
            <span className="text-sm font-bold sm:hidden">Settings</span>
          </button>
        </div>
      </div>
    </div>
  )
}
