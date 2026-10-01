import { ipcMain, BrowserWindow, shell, app, dialog } from 'electron';
import { IPC } from './channels';
import {
  launchBrowser,
  navigateToDucklink,
  navigateToEventsTab,
  closeBrowser,
  getPage,
  setUrlChangeCallback,
  setScreenshotCallback,
} from '../services/playwright';
import { scrapeEvents, ScrapedEvent } from '../services/scraper';
import { downloadAllImages, getLocalImageDataUrl } from '../services/imageDownloader';
import { processAllImages, combineTextForLLM } from '../services/ocr';
import { detectFood, sortEventsByFood } from '../services/foodDetector';
import { getApiKey, setApiKey, hasApiKey, deleteApiKey } from '../services/keytarStore';
import { getCachedScan, saveCache, clearCache, getCacheInfo } from '../services/cache';
import { retryWithBackoff } from '../utils/retry';
import { logger } from '../utils/logger';
import { getLocalDateKey } from '../../shared/date';
import { buildEventReviewDataset, createReviewStore, getEventReviewStorePath, getReviewsForScan, saveReviewDraft } from '../services/eventReviews';
import fs from 'fs';
import {
  getUpdateState,
  initializeUpdater,
  checkForUpdates,
  downloadUpdate,
  quitAndInstallUpdate,
  isUpdateConfigured,
} from '../services/updater';

type ScanStage = 'idle' | 'browser' | 'scraping' | 'ocr' | 'llm' | 'done' | 'error';

let currentStage: ScanStage = 'idle';
let mainWindow: BrowserWindow | null = null;
let scanStartTime = 0;
let scanRunning = false;
let scanGeneration = 0;

export function registerHandlers(window: BrowserWindow): void {
  mainWindow = window;
  initializeUpdater(window);
  // macOS can recreate the window after its last window was closed.
  for (const channel of Object.values(IPC)) ipcMain.removeHandler(channel);
  const reviewStore = createReviewStore(getEventReviewStorePath());

  setUrlChangeCallback((url: string) => {
    mainWindow?.webContents.send(IPC.BROWSER_URL_CHANGED, url);
  });

  setScreenshotCallback((dataUrl: string) => {
    mainWindow?.webContents.send(IPC.BROWSER_PREVIEW_UPDATED, dataUrl);
  });

  // ─── Scan Lifecycle ───────────────────────────────────────

  ipcMain.handle(IPC.SCAN_START, async (_event, forceRefresh: boolean = false) => {
    if (scanRunning) {
      throw new Error('Scan already in progress');
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCachedScan();
      if (cached) {
        logger.info('Returning cached results');
        currentStage = 'done';
        mainWindow?.webContents.send(IPC.SCAN_COMPLETE, {
          date: cached.date,
          captureTimestamp: cached.timestamp,
          events: cached.events,
          foodEvents: cached.foodEvents,
          scanDuration: cached.scanDurationMs,
          fromCache: true,
        });
        currentStage = 'idle';
        return;
      }
    }

    if (!hasApiKey()) {
      throw new Error('TypeSafe API key not configured. Please set it in Settings.');
    }

    scanRunning = true;
    const generation = ++scanGeneration;
    currentStage = 'browser';
    scanStartTime = Date.now();
    emitProgress('browser', 'Starting browser...', 10);

    try {
      await launchBrowser();
      assertActiveScan(generation);
      await navigateToDucklink();
      assertActiveScan(generation);

      currentStage = 'scraping';
      emitProgress('scraping', 'Navigating to Events...', 20);
      await navigateToEventsTab();
      assertActiveScan(generation);
      await runScraping(generation);
    } catch (error) {
      if (generation !== scanGeneration) return;
      const failedStage = currentStage;
      currentStage = 'error';
      const message = (error as Error).message;
      logger.error(`Scan failed at stage ${failedStage}: ${message}`);
      emitError(failedStage, message, 0, true);
      await closeBrowser();
    } finally {
      if (generation !== scanGeneration) await closeBrowser();
      scanRunning = false;
    }
  });

  ipcMain.handle(IPC.SCAN_CANCEL, async () => {
    logger.info('Scan cancelled by user');
    scanGeneration++;
    await closeBrowser();
    currentStage = 'idle';
    emitProgress('idle', 'Scan cancelled', 0);
  });

  // ─── Settings ─────────────────────────────────────────────

  ipcMain.handle(IPC.SETTINGS_GET_API_KEY, () => {
    return getApiKey();
  });

  ipcMain.handle(IPC.SETTINGS_SET_API_KEY, async (_event, key: string) => {
    if (typeof key !== 'string' || !key.trim()) throw new Error('API key cannot be empty.');
    await setApiKey(key.trim());
    logger.info('API key saved to secure storage');
  });

  ipcMain.handle(IPC.SETTINGS_HAS_API_KEY, () => {
    return hasApiKey();
  });

  ipcMain.handle(IPC.SETTINGS_DELETE_API_KEY, async () => {
    await deleteApiKey();
    logger.info('API key deleted from secure storage');
  });

  // ─── Cache ────────────────────────────────────────────────

  ipcMain.handle(IPC.CACHE_CLEAR, () => {
    clearCache();
  });

  ipcMain.handle(IPC.CACHE_INFO, () => {
    return getCacheInfo();
  });

  ipcMain.handle(IPC.CACHE_GET, () => {
    const cached = getCachedScan();
    if (!cached) return null;

    return {
      date: cached.date,
      captureTimestamp: cached.timestamp,
      events: cached.events,
      foodEvents: cached.foodEvents,
      scanDuration: cached.scanDurationMs,
      fromCache: true,
    };
  });

  // ─── Food Reviews ─────────────────────────────────────────

  ipcMain.handle(IPC.REVIEWS_GET_FOR_SCAN, (_event, requestedScanDate: unknown, requestedCaptureTimestamp: unknown) => {
    if (typeof requestedScanDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(requestedScanDate)) {
      throw new Error('The scan date is invalid. Reload the current results and try again.');
    }
    if (typeof requestedCaptureTimestamp !== 'number' || !Number.isInteger(requestedCaptureTimestamp) || requestedCaptureTimestamp <= 0) {
      throw new Error('These results do not have a saved scan snapshot. Run a fresh scan before reviewing events.');
    }
    const cached = getCachedScan();
    if (!cached || cached.date !== requestedScanDate || cached.timestamp !== requestedCaptureTimestamp) {
      throw new Error('These results have been replaced by a newer scan. Reopen the current results before reviewing events.');
    }
    return {
      scanDate: cached.date,
      captureTimestamp: cached.timestamp,
      reviews: getReviewsForScan(cached.date, new Date(cached.timestamp).toISOString(), cached.events as ScrapedEvent[], reviewStore.getAll()),
    };
  });

  ipcMain.handle(IPC.REVIEWS_SAVE, (_event, draft: unknown) => {
    const cached = getCachedScan();
    if (!cached) throw new Error('The current scan is no longer available. Refresh the results before saving a review.');
    if (!draft || typeof draft !== 'object' || (draft as { captureTimestamp?: unknown }).captureTimestamp !== cached.timestamp) {
      throw new Error('These results have been replaced by a newer scan. Reload the current results before saving the review.');
    }
    return saveReviewDraft(
      draft,
      cached.date,
      new Date(cached.timestamp).toISOString(),
      cached.events as ScrapedEvent[],
      reviewStore,
    );
  });

  ipcMain.handle(IPC.REVIEWS_EXPORT, async () => {
    const cached = getCachedScan();
    if (!cached) throw new Error('There is no current scan to export. Run a scan, then export its review dataset.');
    const dataset = buildEventReviewDataset(
      cached.date,
      new Date(cached.timestamp).toISOString(),
      cached.events as ScrapedEvent[],
      reviewStore.getAll(),
    );
    const options = {
      title: 'Export event review dataset',
      defaultPath: `ducklink-food-reviews-${cached.date}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    try {
      fs.writeFileSync(result.filePath, JSON.stringify(dataset, null, 2));
    } catch {
      throw new Error('The review dataset could not be saved. Choose another location and try again.');
    }
    return { filePath: result.filePath, reviewCount: dataset.reviews.length, unresolvedCount: dataset.unresolved.length };
  });

  ipcMain.handle(IPC.APP_INFO, () => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      isPackaged: app.isPackaged,
      updatesEnabled: isUpdateConfigured(),
    };
  });

  ipcMain.handle(IPC.UPDATE_GET_STATE, () => {
    return getUpdateState();
  });

  ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    await checkForUpdates();
    return getUpdateState();
  });

  ipcMain.handle(IPC.UPDATE_DOWNLOAD, async () => {
    await downloadUpdate();
    return getUpdateState();
  });

  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    quitAndInstallUpdate();
  });

  ipcMain.handle(IPC.BROWSER_OPEN_EXTERNAL, (_event, url: string) => {
    if (!url) return;
    return shell.openExternal(url);
  });

  logger.info('IPC handlers registered');
}

// ─── Scraping Orchestration ─────────────────────────────────

function assertActiveScan(generation: number): void {
  if (generation !== scanGeneration) throw new Error('Scan cancelled');
}

async function runScraping(generation: number): Promise<void> {
  const page = getPage();
  if (!page) throw new Error('Browser page not available');

  emitProgress('scraping', 'Extracting events from page...', 25);

  // Scrape events with retry (3 attempts)
  const events = await retryWithBackoff(
    () => { assertActiveScan(generation); return scrapeEvents(page); },
    {
      maxRetries: 3,
      baseDelay: 2000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      onRetry: (attempt, error) => {
        assertActiveScan(generation);
        logger.warn(`Scraping retry ${attempt}: ${error.message}`);
        emitError('scraping', error.message, attempt, false);
      },
    }
  );
  assertActiveScan(generation);

  if (events.length === 0) {
    logger.warn('No events found on page');
  }

  emitProgress('scraping', `Found ${events.length} events. Downloading images...`, 35);

  // Download images
  const downloadedImages = await downloadAllImages(events);
  assertActiveScan(generation);

  const eventsWithImages: ScrapedEvent[] = events.map((event) => {
    const downloaded = downloadedImages.get(event.id) ?? [];
    const primaryImage = downloaded[0]?.path ?? null;
    return {
      ...event,
      localImagePath: primaryImage,
      localImagePaths: downloaded.map((image) => image.path),
      imageEvidence: downloaded.map((image) => ({ url: image.url, source: image.source, sha256: image.sha256 })),
      localImageDataUrl: getLocalImageDataUrl(primaryImage),
    };
  });

  emitProgress('scraping', 'Scraping complete', 40);

  // OCR stage
  currentStage = 'ocr';
  emitProgress('ocr', 'Running OCR on event images...', 40);

  const ocrTexts = await processAllImages(eventsWithImages, (current, total, eventName) => {
    if (generation !== scanGeneration) return;
    const ocrProgress = 40 + Math.round((current / total) * 20);
    emitProgress('ocr', `Reading image ${current}/${total}: ${eventName}`, ocrProgress);
  });
  assertActiveScan(generation);

  const eventsWithOCR: ScrapedEvent[] = eventsWithImages.map((event) => {
    const ocrText = ocrTexts.get(event.id) || '';
    const combined = combineTextForLLM(event, ocrText);
    return {
      ...event,
      ocrText: combined.ocrText,
      combinedText: combined.combinedText,
    };
  });

  emitProgress('ocr', 'OCR complete', 60);

  // LLM food detection stage
  currentStage = 'llm';
  emitProgress('llm', 'Checking food availability with TypeSafe Jev...', 60);

  if (!hasApiKey()) {
    throw new Error('TypeSafe API key not configured. Please set it in Settings.');
  }

  const classifiedEvents = await detectFood(eventsWithOCR, (currentBatch, totalBatches, eventsInBatch) => {
    if (generation !== scanGeneration) return;
    const llmProgress = 60 + Math.round((currentBatch / totalBatches) * 30);
    emitProgress('llm', `Analyzing batch ${currentBatch}/${totalBatches} (${eventsInBatch} events)...`, llmProgress);
  });
  assertActiveScan(generation);

  const sortedEvents = sortEventsByFood(classifiedEvents);
  for (const event of sortedEvents) delete event.localImagePaths;
  const foodEvents = sortedEvents.filter((e) => e.hasFood);

  emitProgress('llm', 'Food detection complete', 90);

  await closeBrowser();
  assertActiveScan(generation);

  const scanDuration = Date.now() - scanStartTime;

  // Cache results
  const cacheable = !sortedEvents.some((event) => event.foodReasoning === 'Food detection failed for this batch');
  if (cacheable) {
    saveCache(sortedEvents, foodEvents, scanDuration);
  }

  currentStage = 'done';
  emitScanComplete(sortedEvents, foodEvents, scanDuration, false, cacheable ? (getCachedScan()?.timestamp ?? 0) : 0);
}

// ─── Emitters ────────────────────────────────────────────────

function emitProgress(stage: string, message: string, progress: number): void {
  mainWindow?.webContents.send(IPC.SCAN_PROGRESS, { stage, message, progress });
}

function emitError(stage: string, message: string, retryAttempt: number, isFinal: boolean): void {
  mainWindow?.webContents.send(IPC.SCAN_ERROR, { stage, message, retryAttempt, isFinal });
}

function emitScanComplete(
  events: ScrapedEvent[],
  foodEvents: ScrapedEvent[],
  scanDuration: number,
  fromCache: boolean = false,
  captureTimestamp: number = 0,
): void {
  mainWindow?.webContents.send(IPC.SCAN_COMPLETE, {
    date: getLocalDateKey(),
    captureTimestamp,
    events,
    foodEvents,
    scanDuration,
    fromCache,
  });
}
