import { chromium, Browser, BrowserContext, Page } from 'playwright-core';
import { scrapeEvents, ScrapedEvent } from './services/scraper';
import { downloadAllImagesCli } from './services/imageDownloaderCli';
import { processAllImages, combineTextForLLM } from './services/ocr';
import { detectFood, sortEventsByFood } from './services/foodDetector';
import { hasApiKey, loadApiKeyFromKeychain } from './services/keytarStore';
import { saveCache } from './services/cacheCli';

const DUCKLINK_EVENTS = 'https://ducklink.stevens.edu/events';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

interface CliOptions {
  headless: boolean;
  forceRefresh: boolean;
  dryRun: boolean;
}

const options: CliOptions = {
  headless: true,
  forceRefresh: false,
  dryRun: false,
};

function parseArgs() {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg === '--headless') options.headless = true;
    if (arg === '--no-headless') options.headless = false;
    if (arg === '--force-refresh') options.forceRefresh = true;
    if (arg === '--dry-run') options.dryRun = true;
  }
  console.log('Options:', options);
}

async function launchBrowser(): Promise<void> {
  if (browser) {
    await closeBrowser();
  }

  const chromiumPath = getChromiumPath();
  console.log(`Launching Chromium (headless: ${options.headless})`);

  browser = await chromium.launch({
    headless: options.headless,
    executablePath: chromiumPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
  });

  page = await context.newPage();
  console.log('Browser launched\n');
}

async function navigateToEvents(): Promise<void> {
  if (!page) throw new Error('Browser not initialized');

  console.log(`Navigating to: ${DUCKLINK_EVENTS}`);
  await page.goto(DUCKLINK_EVENTS, { waitUntil: 'domcontentloaded', timeout: 30000 });

  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    console.log('  (networkidle timeout, continuing)');
  }

  console.log(`  URL: ${page.url()}\n`);
}

async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    context = null;
    page = null;
    console.log('Browser closed');
  }
}

function getChromiumPath(): string {
  try {
    return chromium.executablePath();
  } catch {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
}

async function runScan(): Promise<ScrapedEvent[]> {
  const startTime = Date.now();

  await launchBrowser();
  await navigateToEvents();

  console.log('--- Scraping events ---');
  let events = await scrapeEvents(page!);
  console.log(`Found ${events.length} events for today\n`);

  if (events.length === 0) {
    console.log('No events found, exiting');
    await closeBrowser();
    return [];
  }

  console.log('--- Downloading images ---');
  const imagePaths = await downloadAllImagesCli(events);

  events = events.map((e) => ({
    ...e,
    localImagePath: imagePaths.get(e.id) || null,
    localImageDataUrl: null,
  }));
  console.log('');

  console.log('--- Running OCR ---');
  const ocrTexts = await processAllImages(events);

  events = events.map((event) => {
    const ocrText = ocrTexts.get(event.id) || '';
    const combined = combineTextForLLM(event, ocrText);
    return {
      ...event,
      ocrText: combined.ocrText,
      combinedText: combined.combinedText,
    };
  });
  console.log('OCR complete\n');

  if (options.dryRun) {
    console.log('--- Dry run, skipping LLM ---\n');
    await closeBrowser();
    return events;
  }

  console.log('--- LLM food detection ---');
  if (!hasApiKey()) {
    console.log('No API key found. Set it via: npx electron-vite dev');
    console.log('  Then go to Settings and save your TypeSafe API key');
    console.log('  Or run: npm run cli -- --dry-run\n');
    await closeBrowser();
    return events;
  }

  const classifiedEvents = await detectFood(events);
  const sortedEvents = sortEventsByFood(classifiedEvents);
  const foodEvents = sortedEvents.filter((e) => e.hasFood);

  console.log(`Found ${foodEvents.length} food events\n`);

  const scanDuration = Date.now() - startTime;
  saveCache(sortedEvents, foodEvents, scanDuration);

  await closeBrowser();
  return sortedEvents;
}

async function main() {
  parseArgs();

  // Load API key from Keychain
  await loadApiKeyFromKeychain();
  console.log(`API key loaded: ${hasApiKey() ? 'yes' : 'no'}`);

  try {
    const events = await runScan();

    console.log('=== Results ===');
    console.log(`Total events: ${events.length}`);

    const foodEvents = events.filter((e) => e.hasFood);
    console.log(`Food events: ${foodEvents.length}`);

    if (foodEvents.length > 0) {
      console.log('\n--- Food Events ---');
      for (const event of foodEvents) {
        console.log(`\n📅 ${event.name}`);
        console.log(`   🕒 ${event.startTime}${event.endTime ? ' - ' + event.endTime : ''}`);
        console.log(`   📍 ${event.location}`);
        console.log(`   💡 ${event.foodReasoning}`);
      }
    }

    if (events.length > 0 && foodEvents.length === 0) {
      console.log('\nNo food events found :(');
    }

    console.log('\nDone!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await closeBrowser();
    process.exit(1);
  }
}

main();
