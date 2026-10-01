import { ipcMain, BrowserWindow, shell, app } from 'electron';
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
      events: cached.events,
      foodEvents: cached.foodEvents,
      scanDuration: cached.scanDurationMs,
      fromCache: true,
    };
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
  const imagePaths = await downloadAllImages(events);
  assertActiveScan(generation);

  const eventsWithImages: ScrapedEvent[] = events.map((e) => ({
    ...e,
    localImagePath: imagePaths.get(e.id) || null,
    localImageDataUrl: getLocalImageDataUrl(imagePaths.get(e.id) || null),
  }));

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
  const foodEvents = sortedEvents.filter((e) => e.hasFood);

  emitProgress('llm', 'Food detection complete', 90);

  await closeBrowser();
  assertActiveScan(generation);

  const scanDuration = Date.now() - scanStartTime;

  // Cache results
  if (!sortedEvents.some((event) => event.foodReasoning === 'Food detection failed for this batch')) {
    saveCache(sortedEvents, foodEvents, scanDuration);
  }

  currentStage = 'done';
  emitScanComplete(sortedEvents, foodEvents, scanDuration, false);
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
  fromCache: boolean = false
): void {
  mainWindow?.webContents.send(IPC.SCAN_COMPLETE, {
    date: getLocalDateKey(),
    events,
    foodEvents,
    scanDuration,
    fromCache,
  });
}
