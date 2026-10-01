import type { ScrapedEvent } from '../renderer/src/types';
import type { EventReview, ReviewDraft } from '../shared/eventReview';

interface ScanProgress {
  stage: 'idle' | 'browser' | 'scraping' | 'ocr' | 'llm' | 'done';
  message: string;
  progress: number;
}

interface ScanError {
  stage: string;
  message: string;
  retryAttempt: number;
  isFinal: boolean;
}

interface ScanResult {
  date: string;
  captureTimestamp: number;
  events: ScrapedEvent[];
  foodEvents: ScrapedEvent[];
  scanDuration: number;
  fromCache: boolean;
}

interface CacheInfo {
  date: string;
  eventCount: number;
  timestamp: number;
}

interface WindowApi {
  startScan: (forceRefresh?: boolean) => Promise<void>;
  cancelScan: () => Promise<void>;
  getApiKey: () => Promise<string | null>;
  setApiKey: (key: string) => Promise<void>;
  hasApiKey: () => Promise<boolean>;
  deleteApiKey: () => Promise<void>;
  clearCache: () => Promise<void>;
  getCacheInfo: () => Promise<CacheInfo | null>;
  getCachedScan: () => Promise<ScanResult | null>;
  getReviewsForScan: (scanDate: string, captureTimestamp: number) => Promise<{
    scanDate: string;
    captureTimestamp: number;
    reviews: Array<{ sourceUrl: string; review: EventReview | null; stale: boolean }>;
  }>;
  saveEventReview: (draft: ReviewDraft) => Promise<EventReview>;
  exportEventReviews: () => Promise<{ filePath: string; reviewCount: number; unresolvedCount: number } | null>;
  onScanProgress: (cb: (data: ScanProgress) => void) => void;
  onScanComplete: (cb: (data: ScanResult) => void) => void;
  onScanError: (cb: (data: ScanError) => void) => void;
  onBrowserUrlChanged: (cb: (url: string) => void) => void;
  onBrowserPreviewUpdated: (cb: (dataUrl: string) => void) => void;
}

declare global {
  interface Window {
    api: WindowApi;
  }
}

export {};
