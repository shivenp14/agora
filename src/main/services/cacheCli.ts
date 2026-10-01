import { CLASSIFIER_VERSION } from './llm';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getLocalDateKey } from '../../shared/date';

interface CacheData {
  classifierVersion: string;
  imagePipelineVersion: string;
  date: string;
  timestamp: number;
  events: unknown[];
  foodEvents: unknown[];
  scanDurationMs: number;
}

const IMAGE_PIPELINE_VERSION = '2';

interface CachedEventWithImage {
  localImagePath?: string | null;
  localImageDataUrl?: string | null;
}

const CACHE_DIR = path.join(os.homedir(), '.ducklink-food-finder');
const CACHE_PATH = path.join(CACHE_DIR, 'cache.json');

function loadCache(): CacheData | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const data = fs.readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(data) as CacheData;
    if (parsed.classifierVersion !== CLASSIFIER_VERSION || parsed.imagePipelineVersion !== IMAGE_PIPELINE_VERSION) return null;
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

  return {
    ...event,
    localImagePath: null,
    localImageDataUrl: null,
  };
}

function saveCacheToFile(data: CacheData): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2));
}

export function getCachedScan(): CacheData | null {
  const cached = loadCache();
  if (!cached) return null;

  const today = getLocalDateKey();
  if (cached.date !== today) {
    console.log(`Cache expired: cached=${cached.date}, today=${today}`);
    clearCache();
    return null;
  }

  console.log(`Cache hit: ${cached.events.length} events from ${cached.date}`);
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
    imagePipelineVersion: IMAGE_PIPELINE_VERSION,
    date: today,
    timestamp: Date.now(),
    events,
    foodEvents,
    scanDurationMs,
  };

  saveCacheToFile(data);
  console.log(`Cached ${events.length} events for ${today}`);
}

export function clearCache(): void {
  if (fs.existsSync(CACHE_PATH)) {
    fs.unlinkSync(CACHE_PATH);
  }
  console.log('Cache cleared');
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
