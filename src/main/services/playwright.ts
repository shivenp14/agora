import { chromium, Browser, BrowserContext, Page } from 'playwright-core';
import path from 'path';
import { existsSync } from 'fs';
import { app } from 'electron';
import { logger } from '../utils/logger';

const DUCKLINK_EVENTS = 'https://ducklink.stevens.edu/events';
const PREVIEW_INTERVAL_MS = 1500;
const PREVIEW_JPEG_QUALITY = 60;

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let urlChangeCallback: ((url: string) => void) | null = null;
let screenshotCallback: ((dataUrl: string) => void) | null = null;
let previewInterval: NodeJS.Timeout | null = null;
let previewInFlight = false;

export interface BrowserState {
  isAtDucklink: boolean;
  currentUrl: string;
}

export async function launchBrowser(): Promise<void> {
  if (browser) {
    await closeBrowser();
  }

  const chromiumPath = getChromiumPath();
  logger.info(`Launching Chromium from: ${chromiumPath}`);

  browser = await chromium.launch({
    headless: true,
    ...(chromiumPath ? { executablePath: chromiumPath } : { channel: 'chrome' }),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  page = await context.newPage();
  attachPageListeners();
  void capturePreview();
  logger.info('Browser launched successfully');
}

export async function navigateToDucklink(): Promise<BrowserState> {
  if (!page) throw new Error('Browser not initialized');

  logger.info(`Navigating directly to events page: ${DUCKLINK_EVENTS}`);
  await page.goto(DUCKLINK_EVENTS, { waitUntil: 'domcontentloaded', timeout: 30000 });

  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    logger.debug('networkidle timeout, continuing anyway');
  }

  return detectCurrentState();
}

export function detectCurrentState(): BrowserState {
  if (!page) throw new Error('Browser not initialized');

  const url = page.url();
  logger.info(`Current URL: ${url}`);

  return {
    isAtDucklink: url.includes('ducklink.stevens.edu'),
    currentUrl: url,
  };
}

export async function navigateToEventsTab(): Promise<void> {
  if (!page) throw new Error('Browser not initialized');

  // Already on events page from navigateToDucklink
  logger.info('Ensuring events page is loaded...');

  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    logger.debug('networkidle timeout, continuing');
  }

  logger.info('Events page ready');
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    stopPreviewInterval();
    await browser.close();
    browser = null;
    context = null;
    page = null;
    logger.info('Browser closed');
  }
}

export function getPage(): Page | null {
  return page;
}

export function isBrowserActive(): boolean {
  return browser !== null;
}

export function setUrlChangeCallback(callback: (url: string) => void): void {
  urlChangeCallback = callback;
  attachPageListeners();
}

export function setScreenshotCallback(callback: (dataUrl: string) => void): void {
  screenshotCallback = callback;
  if (page) {
    startPreviewInterval();
    void capturePreview();
  }
}

function getChromiumPath(): string | undefined {
  const bundledPath = path.join(process.resourcesPath, 'chromium', 'chromium');

  if (app.isPackaged) {
    if (existsSync(bundledPath)) {
      return bundledPath;
    }

    logger.warn(`Bundled Chromium not found at ${bundledPath}, falling back to Playwright browser cache`);
  }

  const cachedPath = chromium.executablePath();
  if (existsSync(cachedPath)) return cachedPath;

  // Use a fresh, isolated Chrome context; never reuse the user's profile.
  logger.info('Playwright Chromium is missing; using installed Google Chrome');
  return undefined;
}

function attachPageListeners(): void {
  if (!page) return;

  page.removeAllListeners('framenavigated');
  page.on('framenavigated', (frame) => {
    if (frame === page?.mainFrame()) {
      urlChangeCallback?.(frame.url());
      void capturePreview();
    }
  });

  if (screenshotCallback) {
    startPreviewInterval();
  }
}

function startPreviewInterval(): void {
  if (!page || previewInterval) return;
  previewInterval = setInterval(() => {
    void capturePreview();
  }, PREVIEW_INTERVAL_MS);
}

function stopPreviewInterval(): void {
  if (!previewInterval) return;
  clearInterval(previewInterval);
  previewInterval = null;
}

async function capturePreview(): Promise<void> {
  if (!page || page.isClosed() || !screenshotCallback || previewInFlight) return;

  previewInFlight = true;
  try {
    const buffer = await page.screenshot({
      type: 'jpeg',
      quality: PREVIEW_JPEG_QUALITY,
      fullPage: false,
    });
    screenshotCallback(`data:image/jpeg;base64,${buffer.toString('base64')}`);
  } catch (error) {
    logger.debug(`Preview screenshot failed: ${(error as Error).message}`);
  } finally {
    previewInFlight = false;
  }
}
