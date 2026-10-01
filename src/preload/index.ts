import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../main/ipc/channels';
import type { ScrapedEvent } from '../renderer/src/types';
import type { EventReview, ReviewDraft } from '../shared/eventReview';

interface ScanProgressData {
  stage: string;
  message: string;
  progress: number;
}

interface ScanResultData {
  date: string;
  captureTimestamp: number;
  events: ScrapedEvent[];
  foodEvents: ScrapedEvent[];
  scanDuration: number;
  fromCache: boolean;
}

interface ScanErrorData {
  stage: string;
  message: string;
  retryAttempt: number;
  isFinal: boolean;
}

interface UpdateStateData {
  enabled: boolean;
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error';
  currentVersion: string;
  availableVersion: string | null;
  downloadedVersion: string | null;
  progress: number | null;
  transferredBytes: number | null;
  totalBytes: number | null;
  message: string;
  releaseDate: string | null;
  lastCheckedAt: number | null;
}

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('api', {
  // Scan
  startScan: (forceRefresh?: boolean) => ipcRenderer.invoke(IPC.SCAN_START, forceRefresh),
  cancelScan: () => ipcRenderer.invoke(IPC.SCAN_CANCEL),

  // Settings
  getApiKey: () => ipcRenderer.invoke(IPC.SETTINGS_GET_API_KEY),
  setApiKey: (key: string) => ipcRenderer.invoke(IPC.SETTINGS_SET_API_KEY, key),
  hasApiKey: () => ipcRenderer.invoke(IPC.SETTINGS_HAS_API_KEY),
  deleteApiKey: () => ipcRenderer.invoke(IPC.SETTINGS_DELETE_API_KEY),

  // Cache
  clearCache: () => ipcRenderer.invoke(IPC.CACHE_CLEAR),
  getCacheInfo: () => ipcRenderer.invoke(IPC.CACHE_INFO),
  getCachedScan: () => ipcRenderer.invoke(IPC.CACHE_GET),

  // Food reviews
  getReviewsForScan: (scanDate: string, captureTimestamp: number) => ipcRenderer.invoke(IPC.REVIEWS_GET_FOR_SCAN, scanDate, captureTimestamp),
  saveEventReview: (draft: ReviewDraft) => ipcRenderer.invoke(IPC.REVIEWS_SAVE, draft) as Promise<EventReview>,
  exportEventReviews: () => ipcRenderer.invoke(IPC.REVIEWS_EXPORT) as Promise<{
    filePath: string;
    reviewCount: number;
    unresolvedCount: number;
  } | null>,

  // App
  getAppInfo: () => ipcRenderer.invoke(IPC.APP_INFO),

  // Updates
  getUpdateState: () => ipcRenderer.invoke(IPC.UPDATE_GET_STATE),
  checkForUpdates: () => ipcRenderer.invoke(IPC.UPDATE_CHECK),
  downloadUpdate: () => ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
  installUpdate: () => ipcRenderer.invoke(IPC.UPDATE_INSTALL),

  // Browser
  openExternal: (url: string) => ipcRenderer.invoke(IPC.BROWSER_OPEN_EXTERNAL, url),

  // Progress listeners
  onScanProgress: (cb: (data: ScanProgressData) => void) => subscribe(IPC.SCAN_PROGRESS, cb),
  onScanComplete: (cb: (data: ScanResultData) => void) => subscribe(IPC.SCAN_COMPLETE, cb),
  onScanError: (cb: (data: ScanErrorData) => void) => subscribe(IPC.SCAN_ERROR, cb),
  onBrowserUrlChanged: (cb: (url: string) => void) => subscribe(IPC.BROWSER_URL_CHANGED, cb),
  onBrowserPreviewUpdated: (cb: (dataUrl: string) => void) => subscribe(IPC.BROWSER_PREVIEW_UPDATED, cb),
  onUpdateStateChanged: (cb: (data: UpdateStateData) => void) => subscribe(IPC.UPDATE_STATE_CHANGED, cb),
});
