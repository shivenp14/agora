import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { nativeImage } from 'electron';
import { createWorker, PSM, Worker } from 'tesseract.js';
import { logger } from '../utils/logger';

const OCR_WORKER_COUNT = 2;
const OCR_CACHE_DIR = path.join(process.env.TEMP || '/tmp', 'ducklink-food-finder-images', 'ocr-cache');
const OCR_VARIANTS_DIR = path.join(OCR_CACHE_DIR, 'variants');
const UPSCALE_TARGET_WIDTH = 2400;
const OCR_CACHE_VERSION = 'v3';

let workers: Worker[] = [];
let workerInitPromise: Promise<Worker[]> | null = null;

function ensureOcrCacheDir(): void {
  if (!fs.existsSync(OCR_CACHE_DIR)) {
    fs.mkdirSync(OCR_CACHE_DIR, { recursive: true });
  }

  if (!fs.existsSync(OCR_VARIANTS_DIR)) {
    fs.mkdirSync(OCR_VARIANTS_DIR, { recursive: true });
  }
}

async function createOcrWorker(workerIndex: number): Promise<Worker> {
  return createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        logger.debug(`OCR worker ${workerIndex + 1} progress: ${Math.round(m.progress * 100)}%`);
      }
    },
  });
}

export async function initWorkers(): Promise<Worker[]> {
  if (workers.length > 0) return workers;
  if (workerInitPromise) return workerInitPromise;

  workerInitPromise = Promise.all(
    Array.from({ length: OCR_WORKER_COUNT }, (_, index) => createOcrWorker(index))
  );

  try {
    workers = await workerInitPromise;
  } finally {
    workerInitPromise = null;
  }

  logger.info(`Initialized ${workers.length} Tesseract workers`);
  return workers;
}

function getImageHash(imagePath: string): string | null {
  try {
    const buffer = fs.readFileSync(imagePath);
    return crypto.createHash('sha1').update(buffer).digest('hex');
  } catch (error) {
    logger.warn(`Failed to hash image for OCR cache ${imagePath}: ${(error as Error).message}`);
    return null;
  }
}

function getOcrCachePath(imageHash: string): string {
  return path.join(OCR_CACHE_DIR, `${OCR_CACHE_VERSION}-${imageHash}.txt`);
}

function readCachedText(imagePath: string, imageHash: string | null): string | null {
  ensureOcrCacheDir();
  if (!imageHash) return null;

  const cachePath = getOcrCachePath(imageHash);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const cached = fs.readFileSync(cachePath, 'utf-8');
    logger.debug(`OCR cache hit for ${imagePath}`);
    return cached;
  } catch (error) {
    logger.warn(`Failed to read OCR cache for ${imagePath}: ${(error as Error).message}`);
    return null;
  }
}

function writeCachedText(imagePath: string, text: string, imageHash: string | null): void {
  if (!text) return;

  ensureOcrCacheDir();
  if (!imageHash) return;

  try {
    fs.writeFileSync(getOcrCachePath(imageHash), text, 'utf-8');
  } catch (error) {
    logger.warn(`Failed to write OCR cache for ${imagePath}: ${(error as Error).message}`);
  }
}

export async function recognizeText(imagePath: string, worker: Worker, imageHash = getImageHash(imagePath)): Promise<string> {
  const cached = readCachedText(imagePath, imageHash);
  if (cached !== null) return cached;

  try {
    const variants = createRecognitionVariants(imagePath, imageHash);
    const passes: string[] = [];

    for (const variant of variants) {
      await worker.setParameters({
        tessedit_pageseg_mode: variant.psm,
        preserve_interword_spaces: '1',
      });

      const { data } = await worker.recognize(variant.path);
      const cleaned = postProcess(data.text);
      if (cleaned) {
        passes.push(cleaned);
      }
    }

    const cleaned = mergeRecognizedText(passes);
    writeCachedText(imagePath, cleaned, imageHash);
    logger.debug(`OCR result for ${imagePath}: ${cleaned.length} chars across ${variants.length} pass(es)`);
    return cleaned;
  } catch (error) {
    logger.warn(`OCR failed for ${imagePath}: ${(error as Error).message}`);
    return '';
  }
}

export async function terminateWorker(): Promise<void> {
  if (workerInitPromise) {
    await workerInitPromise;
  }

  if (workers.length > 0) {
    await Promise.all(workers.map((worker) => worker.terminate()));
    workers = [];
    logger.info('Tesseract workers terminated');
  }
}

function postProcess(rawText: string): string {
  return rawText
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').replace(/[^\x20-\x7E]/g, '').trim())
    .filter((line) => line.length > 1)
    .join('\n');
}

export interface EventWithOCR {
  id: string;
  name: string;
  description: string;
  ocrText: string;
  combinedText: string;
}

export type OCRProgressCallback = (current: number, total: number, eventName: string) => void;

export async function processAllImages(
  events: Array<{ id: string; name: string; localImagePath?: string | null; localImagePaths?: string[] }>,
  onProgress?: OCRProgressCallback
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const eventsWithImages = events.map((event) => ({
    ...event,
    paths: uniquePaths(event.localImagePaths?.length ? event.localImagePaths : [event.localImagePath || '']),
  })).filter((event) => event.paths.length > 0);

  if (eventsWithImages.length === 0) {
    logger.info('No images to OCR');
    return results;
  }

  logger.info(`Running OCR on ${eventsWithImages.reduce((count, event) => count + event.paths.length, 0)} images across ${eventsWithImages.length} events`);

  let workerPool: Worker[];
  try {
    workerPool = await initWorkers();
  } catch (error) {
    logger.warn(`OCR worker initialization failed: ${(error as Error).message}`);
    return results;
  }
  const hashByPath = new Map<string, string>();
  for (const event of eventsWithImages) {
    for (const imagePath of event.paths) {
      const imageHash = getImageHash(imagePath);
      if (imageHash) hashByPath.set(imagePath, imageHash);
    }
  }
  const recognitionByHash = new Map<string, Promise<string>>();
  let nextIndex = 0;
  let completed = 0;

  await Promise.all(
    workerPool.map(async (worker) => {
      while (nextIndex < eventsWithImages.length) {
        const event = eventsWithImages[nextIndex];
        nextIndex += 1;

        const imageTexts: string[] = [];
        const eventHashes = new Set<string>();
        for (const imagePath of event.paths) {
          const imageHash = hashByPath.get(imagePath);
          if (!imageHash || eventHashes.has(imageHash)) continue;
          eventHashes.add(imageHash);
          let recognition = recognitionByHash.get(imageHash);
          if (!recognition) {
            recognition = recognizeText(imagePath, worker, imageHash);
            recognitionByHash.set(imageHash, recognition);
          }
          const text = await recognition;
          if (text) imageTexts.push(text);
        }
        const combinedText = mergeRecognizedText(imageTexts);
        if (combinedText) results.set(event.id, combinedText);

        completed += 1;
        onProgress?.(completed, eventsWithImages.length, event.name);
      }
    })
  );

  if (results.size !== 0) {
    logger.info(`OCR cache/results populated for ${results.size} images`);
  }

  logger.info(`OCR complete: ${results.size}/${eventsWithImages.length} images produced text`);
  return results;
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((imagePath) => {
    if (!imagePath || seen.has(imagePath)) return false;
    seen.add(imagePath);
    return true;
  });
}

export function clearOcrCache(): void {
  if (!fs.existsSync(OCR_CACHE_DIR)) {
    return;
  }

  for (const entry of fs.readdirSync(OCR_CACHE_DIR)) {
    const entryPath = path.join(OCR_CACHE_DIR, entry);
    const stats = fs.statSync(entryPath);
    if (stats.isDirectory()) {
      fs.rmSync(entryPath, { recursive: true, force: true });
      continue;
    }

    if (stats.isFile()) {
      fs.unlinkSync(entryPath);
    }
  }
}

interface RecognitionVariant {
  path: string;
  label: string;
  psm: PSM;
}

function createRecognitionVariants(imagePath: string, imageHash: string | null): RecognitionVariant[] {
  ensureOcrCacheDir();

  const variants: RecognitionVariant[] = [
    {
      path: imagePath,
      label: 'base-single-block',
      psm: PSM.SINGLE_BLOCK,
    },
    {
      path: imagePath,
      label: 'base-sparse-text',
      psm: PSM.SPARSE_TEXT,
    },
  ];

  const upscaledPath = createUpscaledVariant(imagePath, imageHash);
  if (upscaledPath) {
    variants.push({
      path: upscaledPath,
      label: 'upscaled-sparse-text',
      psm: PSM.SPARSE_TEXT,
    });
  }

  return variants;
}

function createUpscaledVariant(imagePath: string, imageHash: string | null): string | null {
  if (!imageHash) return null;

  const variantPath = path.join(OCR_VARIANTS_DIR, `${imageHash}-upscaled.png`);
  if (fs.existsSync(variantPath)) {
    return variantPath;
  }

  try {
    const image = nativeImage.createFromPath(imagePath);
    if (image.isEmpty()) {
      return null;
    }

    const { width, height } = image.getSize();
    if (!width || !height) {
      return null;
    }

    if (width >= UPSCALE_TARGET_WIDTH) {
      return imagePath;
    }

    const resized = image.resize({
      width: UPSCALE_TARGET_WIDTH,
      height: Math.round((height / width) * UPSCALE_TARGET_WIDTH),
      quality: 'best',
    });

    fs.writeFileSync(variantPath, resized.toPNG());
    return variantPath;
  } catch (error) {
    logger.warn(`Failed to create OCR upscale variant for ${imagePath}: ${(error as Error).message}`);
    return null;
  }
}

function mergeRecognizedText(texts: string[]): string {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const text of texts) {
    for (const line of text.split('\n')) {
      const cleaned = line.trim();
      if (!cleaned) continue;

      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      merged.push(cleaned);
    }
  }

  return merged.join('\n');
}

export function combineTextForLLM(
  event: { id: string; name: string; description: string },
  ocrText: string
): EventWithOCR {
  const parts: string[] = [];

  if (event.description) {
    parts.push(`Description: ${event.description}`);
  }

  if (ocrText) {
    parts.push(`Image Text (OCR): ${ocrText}`);
  }

  return {
    ...event,
    ocrText,
    combinedText: parts.join('\n'),
  };
}
