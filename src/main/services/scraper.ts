import { Page } from 'playwright-core';
import { logger } from '../utils/logger';
import { getLocalDateKey } from '../../shared/date';
import { chooseLargestSrcset, DiscoveredImageCandidate, ImageCandidate, selectImageCandidates } from './imageCandidates';

const EVENT_LIST_SELECTOR = '#divAllItems li.list-group-item';
const DETAIL_FETCH_CONCURRENCY = 3;

export interface ScrapedEvent {
  id: string;
  name: string;
  date: string;
  rawDateText: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  imageUrl: string | null;
  imageCandidates?: ImageCandidate[];
  imageEvidence?: Array<ImageCandidate & { sha256: string }>;
  localImagePaths?: string[];
  sourceUrl: string;
  localImagePath: string | null;
  localImageDataUrl: string | null;
  ocrText: string;
  combinedText: string;
  hasFood: boolean;
  foodReasoning: string;
  foodStatus?: 'provided' | 'not_provided' | 'uncertain' | 'unavailable';
  foodConfidence: number;
}

interface EventSchedule {
  date: string;
  startTime: string;
  endTime: string;
}

interface RawEvent {
  id: string;
  rsvpId: string;
  rsvpUrl: string;
  imgUrl: string;
  text: string;
}

const TIME_VALUE_PATTERN = String.raw`(?<![:\d])\d{1,2}(?::\d{2})?\s*[AP]M`;
const TIME_SUFFIX_PATTERN = String.raw`(?:\s+[A-Z]{2,5}(?:\s*\(GMT[+-]\d{1,2}\))?)?`;
const TIME_RANGE_REGEX = new RegExp(
  String.raw`\b(${TIME_VALUE_PATTERN})\s*[–-]\s*(${TIME_VALUE_PATTERN}${TIME_SUFFIX_PATTERN})\b`,
  'i'
);
const SINGLE_TIME_REGEX = new RegExp(
  String.raw`\b(${TIME_VALUE_PATTERN}${TIME_SUFFIX_PATTERN})\b`,
  'gi'
);

function getDayOfWeek(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function getDayOfWeekFull(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

export async function scrapeEvents(page: Page): Promise<ScrapedEvent[]> {
  logger.info('Starting event scraping...');

  const today = new Date();
  const todayISO = formatDateISO(today);
  const todayShort = getDayOfWeek(today);
  const todayFull = getDayOfWeekFull(today);
  logger.info(`Filtering events for date: ${todayISO} (${todayShort})`);

  const currentUrl = page.url();
  if (!currentUrl.includes('/events')) {
    await page.goto('https://ducklink.stevens.edu/events');
    await page.waitForLoadState('networkidle');
  }

  // Wait for content to fully render
  await page.locator('#divAllItems').waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(5000);
  await scrollUntilTomorrowOrStable(page);

  // Get all event data from the page, but stop before the "Tomorrow" section.
  const rawEvents = (await page.evaluate(() => {
    const container = document.querySelector('#divAllItems');
    const items = Array.from(container?.querySelectorAll('li.list-group-item') ?? []);
    const events: Array<{
      id: string;
      rsvpId: string;
      rsvpUrl: string;
      imgUrl: string;
      text: string;
    }> = [];
    const tomorrowMarker = Array.from(container?.querySelectorAll('*') ?? []).find((element) => {
      const text = (element.textContent || '').trim().toLowerCase();
      return text === 'tomorrow';
    });

    items.forEach((li, index) => {
      if (
        tomorrowMarker &&
        tomorrowMarker !== li &&
        (tomorrowMarker.compareDocumentPosition(li) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      ) {
        return;
      }

      const text = li.textContent || '';
      const rsvpLink = li.querySelector('a[href*="/rsvp_boot?id="]');
      const rsvpUrl = rsvpLink ? (rsvpLink as HTMLAnchorElement).href : '';
      const rsvpId = rsvpUrl.match(/id=(\d+)/)?.[1] || '';
      const img = li.querySelector('img');
      const imgUrl = img ? (img as HTMLImageElement).src : '';

      events.push({
        id: `event-${index}`,
        rsvpId,
        rsvpUrl,
        imgUrl,
        text,
      });
    });

    return events;
  })) as RawEvent[];

  logger.info(`Found ${rawEvents.length} raw event items`);

  // Process events and filter for today
  const todayEvents: ScrapedEvent[] = [];

  for (const rawEvent of rawEvents) {
    const text = rawEvent.text;
    
    // Check if this event is for today
    const isToday = text.toLowerCase().includes('today') || 
                   text.includes(todayShort) || 
                   text.includes(todayFull);

    if (!isToday) continue;

    // Extract details from the text
    const name = extractName(text);
    const location = extractLocation(text);
    const schedule = extractSchedule(text, today);

    // Only include if we have meaningful content
    if (!name || name.length < 3) continue;

    todayEvents.push({
      id: rawEvent.id,
      name,
      date: schedule.date,
      rawDateText: text,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      location,
      description: text,
      imageUrl: rawEvent.imgUrl || null,
      sourceUrl: rawEvent.rsvpUrl || '',
      localImagePath: null,
      localImageDataUrl: null,
      ocrText: '',
      combinedText: '',
      hasFood: false,
      foodReasoning: '',
      foodConfidence: 0,
    });

    // Don't limit - get all events for today
  }

  logger.info(`Filtered to ${todayEvents.length} events for today`);

  return enrichEventsWithDetails(page, todayEvents);
}

function extractName(text: string): string {
  // Look for text that might be the event name
  const lines = text.split('\n').filter(l => l.trim());
  // Skip empty lines and "FREE" lines
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && trimmed !== 'FREE' && trimmed.length > 3 && !trimmed.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/)) {
      return trimmed.slice(0, 100);
    }
  }
  return text.slice(0, 50);
}

function extractLocation(text: string): string {
  const locMatch = text.match(/(?:Location|Where)[:\s]+([^,\n]+)/i);
  if (locMatch) return locMatch[1].trim();

  const buildingMatch = text.match(/\b[A-Z][a-z]+(?:Building|Hall|Center|Room)[A-Za-z0-9\s]*/);
  if (buildingMatch) return buildingMatch[0];

  return '';
}

function extractSchedule(text: string, fallbackDate: Date): EventSchedule {
  const normalized = normalizeScheduleText(text);
  const dateMatches = Array.from(
    normalized.matchAll(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/g)
  ).map((match) => match[0]);

  const rangeMatch = normalized.match(TIME_RANGE_REGEX);

  if (rangeMatch) {
    return {
      date: parseDateLabelToISO(dateMatches[0], fallbackDate),
      startTime: normalizeTime(rangeMatch[1]),
      endTime: normalizeTime(rangeMatch[2]),
    };
  }

  const timeMatches = Array.from(
    normalized.matchAll(SINGLE_TIME_REGEX)
  ).map((match) => normalizeTime(match[1]));

  return {
    date: parseDateLabelToISO(dateMatches[0], fallbackDate),
    startTime: timeMatches[0] ?? '',
    endTime: timeMatches[1] ?? '',
  };
}

function parseDateLabelToISO(label: string | undefined, fallbackDate: Date): string {
  if (!label) return formatDateISO(fallbackDate);

  const parsed = new Date(label);
  if (Number.isNaN(parsed.getTime())) {
    return formatDateISO(fallbackDate);
  }

  return formatDateISO(parsed);
}

function normalizeScheduleText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/(\b\d{4})(?=\d{1,2}(?::\d{2})?\s*[AP]M\b)/g, '$1 ');
}

function normalizeTime(value: string): string {
  const trimmed = value.trim().toUpperCase().replace(/\s+/g, ' ');
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)(.*)$/);
  if (!match) return trimmed;

  const [, hour, minutes, period, suffix] = match;
  const normalizedTime = minutes ? `${hour}:${minutes} ${period}` : `${hour} ${period}`;
  return `${normalizedTime}${suffix}`.trim();
}

function formatDateISO(date: Date): string {
  return getLocalDateKey(date);
}

async function scrollUntilTomorrowOrStable(page: Page): Promise<void> {
  const MAX_SCROLL_ATTEMPTS = 20;
  let previousHeight = 0;
  let stableCount = 0;
  const STABLE_THRESHOLD = 3;

  for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
    const { currentHeight, itemCount, foundTomorrow } = await page.evaluate((eventListSelector) => {
      const container = document.querySelector('#divAllItems');
      const itemCount = document.querySelectorAll(eventListSelector).length;
      const foundTomorrow = Array.from(container?.querySelectorAll('*') ?? []).some((element) => {
        const text = (element.textContent || '').trim().toLowerCase();
        return text === 'tomorrow';
      });

      return {
        currentHeight: document.body.scrollHeight,
        itemCount,
        foundTomorrow,
      };
    }, EVENT_LIST_SELECTOR);

    logger.info(`Scroll ${i}: height=${currentHeight}, items=${itemCount}, tomorrow=${foundTomorrow}`);

    if (foundTomorrow) {
      logger.info('Stopping scroll after locating Tomorrow section');
      break;
    }

    if (currentHeight === previousHeight) {
      stableCount++;
      if (stableCount >= STABLE_THRESHOLD) break;
    } else {
      stableCount = 0;
    }
    previousHeight = currentHeight;

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
  }

  const finalCount = await page.evaluate(
    (eventListSelector) => document.querySelectorAll(eventListSelector).length,
    EVENT_LIST_SELECTOR
  );
  logger.info(`Final event count after scrolling: ${finalCount}`);
}

async function enrichEventsWithDetails(page: Page, events: ScrapedEvent[]): Promise<ScrapedEvent[]> {
  const eventsWithDetails = [...events];
  const pendingIndices = eventsWithDetails
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => Boolean(event.sourceUrl));

  if (pendingIndices.length === 0) {
    return eventsWithDetails;
  }

  const workerCount = Math.min(DETAIL_FETCH_CONCURRENCY, pendingIndices.length);
  logger.info(`Fetching event details with ${workerCount} parallel page(s)`);

  let nextIndex = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    const workerPage = await page.context().newPage();

    try {
      while (nextIndex < pendingIndices.length) {
        const current = pendingIndices[nextIndex++];
        if (!current) break;

        const updatedEvent = await fetchEventDetails(workerPage, current.event);
        eventsWithDetails[current.index] = updatedEvent;
      }
    } finally {
      await workerPage.close().catch(() => {});
    }
  });

  await Promise.all(workers);
  return eventsWithDetails;
}

async function fetchEventDetails(page: Page, event: ScrapedEvent): Promise<ScrapedEvent> {
  try {
    await page.goto(event.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    const details = await page.evaluate(() => {
      const clean = (value: string | null | undefined): string =>
        (value || '')
          .replace(/\s+/g, ' ')
          .replace(/\u00a0/g, ' ')
          .trim();

      const unique = (values: Array<string | null | undefined>): string[] => {
        const seen = new Set<string>();
        const result: string[] = [];

        for (const value of values) {
          const cleaned = clean(value);
          if (!cleaned) continue;
          const key = cleaned.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          result.push(cleaned);
        }

        return result;
      };

      const metaDesc = document.querySelector('meta[name="description"]');
      const description = clean(metaDesc ? metaDesc.getAttribute('content') || '' : '');
      const ogImage = document.querySelector('meta[property="og:image"]');
      const ogImageValue = ogImage ? ogImage.getAttribute('content') || '' : '';
      const imageUrl = ogImageValue ? new URL(ogImageValue, document.baseURI).href : '';
      const titleHeading = clean(document.querySelector('.rsvp__event-name')?.textContent);
      const title = titleHeading || clean(document.title.replace(/ - .*$/, ''));
      const discoveredImages: Array<{
        url: string;
        source: 'detail' | 'original' | 'srcset' | 'link';
        alt?: string;
        context?: string;
        width?: number;
        height?: number;
      }> = [];
      const imageSrcsets: Array<{ srcset: string; alt: string; context: string; width?: number; height?: number }> = [];
      const addImage = (url: string | null | undefined, source: 'detail' | 'original' | 'srcset' | 'link', image?: HTMLImageElement) => {
        if (!url) return;
        discoveredImages.push({
          url: new URL(url, document.baseURI).href,
          source,
          alt: image?.getAttribute('alt') || '',
          context: image?.parentElement?.parentElement?.textContent?.slice(0, 500) || '',
          width: image?.naturalWidth || image?.width,
          height: image?.naturalHeight || image?.height,
        });
      };

      for (const image of Array.from(document.querySelectorAll('img'))) {
        if (image.closest('header, nav, footer')) continue;
        const originalUrl = image.getAttribute('data-original') || image.getAttribute('data-original-src') ||
          image.getAttribute('data-full');
        addImage(originalUrl, 'original', image);
        addImage(image.currentSrc || image.getAttribute('data-src') || image.getAttribute('src'), 'detail', image);
        const srcset = image.getAttribute('srcset') || image.getAttribute('data-srcset');
        if (srcset) {
          imageSrcsets.push({
            srcset,
            alt: image.getAttribute('alt') || '',
            context: image.parentElement?.parentElement?.textContent?.slice(0, 500) || '',
            width: image.naturalWidth || image.width,
            height: image.naturalHeight || image.height,
          });
        }
        const linked = image.closest('a[href]') as HTMLAnchorElement | null;
        if (linked && (/\.(?:jpe?g|png|gif|webp)(?:[?#]|$)/i.test(linked.href) || /(?:image|flyer|upload|download|original)/i.test(linked.href))) {
          addImage(linked.href, 'link', image);
        }
      }

      const cardBlocks = Array.from(document.querySelectorAll('.card-block'));
      const detailsBlock = cardBlocks.find((block) => block.querySelector('.mdi-note-text'));
      const foodBlock = detailsBlock
        ? Array.from(detailsBlock.querySelectorAll('div'))
            .find((node) => /food provided/i.test(node.textContent || ''))
        : null;

      const detailsText = clean(detailsBlock?.textContent);
      const foodText = clean(foodBlock?.textContent);
      const flyerAltTexts = unique(
        Array.from(document.querySelectorAll('img'))
          .map((img) => img.getAttribute('alt'))
          .filter((alt) => alt && /flyer/i.test(alt))
      );

      const mergedDescription = unique([
        description,
        detailsText,
        foodText,
        ...flyerAltTexts,
      ]).join('\n');

      return { description: mergedDescription, imageUrl, title, discoveredImages, imageSrcsets };
    });

    const srcsetCandidates: DiscoveredImageCandidate[] = details.imageSrcsets.flatMap((image) => {
      const url = chooseLargestSrcset(image.srcset);
      return url ? [{ url: new URL(url, event.sourceUrl).href, source: 'srcset', alt: image.alt, context: image.context, width: image.width, height: image.height }] : [];
    });
    const imageCandidates = selectImageCandidates(
      [...details.discoveredImages, ...srcsetCandidates],
      details.imageUrl || event.imageUrl || ''
    );

    return {
      ...event,
      description: details.description || event.description,
      imageUrl: imageCandidates[0]?.url || null,
      imageCandidates,
      name: details.title || event.name,
    };
  } catch (err) {
    logger.warn(`Failed to get details for "${event.name}": ${(err as Error).message}`);
    return event;
  }
}
