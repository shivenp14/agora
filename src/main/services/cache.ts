import { CLASSIFIER_VERSION } from './llm';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { logger } from '../utils/logger';
import { getLocalDateKey } from '../../shared/date';

interface CacheData {
  classifierVersion: string;
  date: string;
  timestamp: number;
  events: unknown[];
  foodEvents: unknown[];
  scanDurationMs: number;
}

interface CachedEventWithImage {
  localImagePath?: string | null;
  localImageDataUrl?: string | null;
}

const getCachePath = (): string => {
  return path.join(app.getPath('userData'), 'ducklink-cache.json');
};

function loadCache(): CacheData | null {
  try {
    const filePath = getCachePath();
    if (!fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(data) as CacheData;
    if (parsed.classifierVersion !== CLASSIFIER_VERSION) return null;
    return {
      ...parsed,
      events: sanitizeCachedEvents(parsed.events),
      foodEvents: sanitizeCachedEvents(parsed.foodEvents),
    };
  } catch {
    return null;
  }
}

function sanitizeCachedEvents(events: unknown[]): unknown[] {
  return events.map((event) => sanitizeCachedEvent(event));
}

function sanitizeCachedEvent(event: unknown): unknown {
  if (!event || typeof event !== 'object') {
    return event;
  }

  const cachedEvent = event as CachedEventWithImage;
  if (!cachedEvent.localImagePath) {
    return event;
  }

  if (fs.existsSync(cachedEvent.localImagePath)) {
    return event;
  }

  if (cachedEvent.localImageDataUrl) {
    return {
      ...event,
      localImagePath: null,
    };
  }

  return {
    ...event,
    localImagePath: null,
    localImageDataUrl: null,
  };
}

function saveCacheToFile(data: CacheData): void {
  try {
    const filePath = getCachePath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    logger.error('Failed to save cache:', error);
  }
}

export function getCachedScan(): CacheData | null {
  const cached = loadCache();
  if (!cached) return null;
  if (cached.events.some((event) => event && typeof event === 'object' &&
    'foodReasoning' in event && event.foodReasoning === 'Food detection failed for this batch')) {
    return null;
  }

  const today = getLocalDateKey();
  if (cached.date !== today) {
    logger.info(`Cache expired: cached=${cached.date}, today=${today}`);
    clearCache();
    return null;
  }

  logger.info(`Cache hit: ${cached.events.length} events from ${cached.date}`);
  return cached;
}

export function saveCache(
  events: unknown[],
  foodEvents: unknown[],
  scanDurationMs: number
): void {
  const today = getLocalDateKey();

  const data: CacheData = {
    classifierVersion: CLASSIFIER_VERSION,
    date: today,
    timestamp: Date.now(),
    events,
    foodEvents,
    scanDurationMs,
  };

  saveCacheToFile(data);
  logger.info(`Cached ${events.length} events for ${today}`);
}

export function clearCache(): void {
  try {
    const filePath = getCachePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    logger.info('Cache cleared');
  } catch (error) {
    logger.error('Failed to clear cache:', error);
  }
}

export function getCacheInfo(): { date: string; eventCount: number; timestamp: number } | null {
  const cached = loadCache();
  if (!cached) return null;

  return {
    date: cached.date,
    eventCount: cached.events.length,
    timestamp: cached.timestamp,
  };
}
