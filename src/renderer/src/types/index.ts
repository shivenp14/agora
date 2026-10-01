export interface ScanProgress {
  stage: 'idle' | 'browser' | 'scraping' | 'ocr' | 'llm' | 'done'
  message: string
  progress: number
}

export interface ScanError {
  stage: string
  message: string
  retryAttempt: number
  isFinal: boolean
}

export interface ScrapedEvent {
  id: string
  name: string
  date: string
  rawDateText: string
  startTime: string
  endTime: string
  location: string
  description: string
  imageUrl: string | null
  localImagePath: string | null
  localImageDataUrl: string | null
  ocrText: string
  combinedText: string
  hasFood: boolean
  foodReasoning: string
  foodStatus?: 'provided' | 'not_provided' | 'uncertain' | 'unavailable';
  foodConfidence: number
  sourceUrl: string
}

export interface ScanResult {
  date: string
  events: ScrapedEvent[]
  foodEvents: ScrapedEvent[]
  scanDuration: number
  fromCache: boolean
}

export interface CacheInfo {
  date: string
  eventCount: number
  timestamp: number
}

export interface AppInfo {
  version: string
  platform: string
  isPackaged: boolean
  updatesEnabled: boolean
}

export interface UpdateState {
  enabled: boolean
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
  currentVersion: string
  availableVersion: string | null
  downloadedVersion: string | null
  progress: number | null
  transferredBytes: number | null
  totalBytes: number | null
  message: string
  releaseDate: string | null
  lastCheckedAt: number | null
}
