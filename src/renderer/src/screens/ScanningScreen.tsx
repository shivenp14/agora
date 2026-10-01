import { ScanProgress, ScanError } from '../types'
import ErrorMessage from '../components/ErrorMessage'
import { useState, useEffect } from 'react'

interface Props {
  state: string
  progress: ScanProgress | null
  error: ScanError | null
  onCancel: () => void
  onRetry: () => void
  onBack: () => void
}

const STAGES = [
  { key: 'browser', label: 'Launching browser', icon: 'language', desc: 'Headless instance initialized successfully.' },
  { key: 'scraping', label: 'Finding events', icon: 'search', desc: 'Upcoming events detected in portal.' },
  { key: 'ocr', label: 'Reading event flyers via OCR', icon: 'view_in_ar', desc: 'Extracting text from images...' },
  { key: 'llm', label: 'Jev Food Classification', icon: 'psychology', desc: 'Checking event text with TypeSafe Jev.' },
] as const

export default function ScanningScreen({
  state,
  progress,
  error,
  onCancel,
  onRetry,
  onBack,
}: Props) {
  const [currentUrl, setCurrentUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    const detachUrl = window.api.onBrowserUrlChanged((url) => setCurrentUrl(url));
    const detachPreview = window.api.onBrowserPreviewUpdated((dataUrl) => setPreviewUrl(dataUrl));
    return () => { detachUrl(); detachPreview(); };
  }, []);

  if (state === 'error' && error?.isFinal) {
    return (
      <ErrorMessage
        message={error.message}
        stage={error.stage}
        onRetry={onRetry}
        onBack={onBack}
      />
    )
  }

  const currentStageIndex = STAGES.findIndex(
    (s) => s.key === progress?.stage
  )

  const progressPercent = Math.max(10, progress?.progress ?? 0)

  return (
    <div className="max-w-6xl mx-auto pb-8">
      {/* Hero Scanning Header */}
      <section className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2 max-w-3xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-3 h-3 bg-tertiary rounded-full availability-pulse"></div>
            <span className="text-tertiary font-bold tracking-widest text-xs uppercase font-headline">Live Scrape in Progress</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-headline font-extrabold text-on-surface tracking-tight leading-tight">
            Analyzing the <br/><span className="text-primary italic">Ducklink</span> Ecosystem.
          </h2>
          <p className="text-on-surface-variant max-w-xl text-sm sm:text-base lg:text-lg leading-relaxed pt-1">
            Our concierge is currently navigating campus events to identify available culinary opportunities. This typically takes 45-60 seconds.
          </p>
        </div>
        
        <div className="w-full md:w-auto bg-surface-container-lowest p-4 sm:p-5 rounded-2xl shadow-sm border border-outline-variant/10 min-w-0 md:min-w-[260px]">
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Global Progress</span>
            <span className="text-xl sm:text-2xl font-headline font-black text-primary">{Math.round(progressPercent)}%</span>
          </div>
          <div className="h-2.5 sm:h-3 w-full bg-surface-container rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-primary-container rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
          </div>
          <button
            onClick={onCancel}
            className="w-full mt-3 py-2 bg-surface-container-highest hover:bg-surface-container-high rounded-full text-xs font-bold text-on-surface-variant uppercase tracking-widest transition-colors"
          >
            Cancel Scan
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)] xl:items-stretch">
          {/* Live Browser Preview Section */}
          <div className="flex h-full flex-col bg-inverse-surface rounded-3xl overflow-hidden shadow-2xl border border-surface-container-highest/20 min-h-0 xl:max-h-[calc(100vh-16rem)]">
            <div className="bg-slate-800/50 px-4 sm:px-6 py-3 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/50"></div>
                </div>
                <div className="h-6 w-px bg-white/10 mx-1 sm:mx-2"></div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 min-w-0">
                  <span className="material-symbols-outlined text-xs">language</span>
                  <span className="truncate max-w-[140px] sm:max-w-[220px]">{currentUrl || 'ducklink.stevens.edu/events'}</span>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Live Stream</span>
              </div>
            </div>
            
            <div className="relative aspect-[16/10] min-h-[220px] sm:min-h-[260px] lg:min-h-[320px] flex-1 bg-slate-900 overflow-hidden group flex items-center justify-center xl:aspect-auto xl:min-h-0">
              {previewUrl ? (
                <>
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-primary/50 shadow-[0_0_15px_2px_rgba(163,38,56,0.8)] z-20 animate-[scan_3s_linear_infinite]" />
                  <img
                    src={previewUrl}
                    alt="Browser preview"
                    className="w-full h-full object-cover opacity-60 mix-blend-luminosity grayscale contrast-125 group-hover:scale-[1.02] transition-transform duration-[2000ms]"
                  />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-500 gap-2">
                  <span className="material-symbols-outlined text-4xl animate-spin">sync</span>
                  <span className="text-xs font-mono">Initializing Headless Browser...</span>
                </div>
              )}
              
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/40 backdrop-blur-sm border border-white/10 px-4 py-2 rounded-lg flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary-fixed-dim animate-spin">sync</span>
                  <span className="text-xs font-mono text-white/80">Active Session: Ducklink Scraper</span>
                </div>
              </div>
            </div>
          </div>

          {/* Analysis Pipeline */}
          <div className="h-full min-h-0 bg-surface-container-low rounded-3xl p-5 sm:p-6 xl:p-8 space-y-5 xl:space-y-6 xl:max-h-[calc(100vh-16rem)] xl:overflow-y-auto">
            <h3 className="text-xl font-headline font-bold text-on-surface px-2">Analysis Pipeline</h3>
            <div className="space-y-4">
              {STAGES.map((stage, i) => {
                const isPast = i < currentStageIndex
                const isCurrent = i === currentStageIndex

                if (isPast) {
                  return (
                    <div key={stage.key} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl bg-surface-container-lowest transition-all hover:scale-[1.01]">
                      <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-tertiary-container text-on-tertiary-container">
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-on-surface">{stage.label}</h4>
                        <p className="text-sm text-on-surface-variant">{stage.desc}</p>
                      </div>
                      <span className="text-xs font-bold text-tertiary uppercase tracking-tighter">Verified</span>
                    </div>
                  )
                }

                if (isCurrent) {
                  return (
                    <div key={stage.key} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl bg-surface-container-lowest border-2 border-primary/10 shadow-lg shadow-primary/5 transition-all">
                      <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-primary text-on-primary">
                        <span className="material-symbols-outlined animate-spin">{stage.icon}</span>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <h4 className="font-bold text-on-surface">{stage.label}</h4>
                        <p className="text-sm text-on-surface-variant italic truncate">
                          {progress?.message || stage.desc}
                        </p>
                      </div>
                      <div className="w-2 h-2 bg-primary rounded-full availability-pulse"></div>
                    </div>
                  )
                }

                return (
                    <div key={stage.key} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl bg-surface-container-low opacity-60">
                    <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-surface-container-high text-slate-400">
                      <span className="material-symbols-outlined">{stage.icon}</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-500">{stage.label}</h4>
                      <p className="text-sm text-slate-400">{stage.desc}</p>
                    </div>
                    <span className="material-symbols-outlined text-slate-300">lock</span>
                  </div>
                )
              })}

              {error && !error.isFinal && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-center gap-3">
                  <span className="material-symbols-outlined text-yellow-500">warning</span>
                  <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                    Retrying... (attempt {error.retryAttempt}/3)
                  </p>
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
  )
}
