import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { logger } from '../utils/logger';
import { downloadImages, DownloadEvent, DownloadedImage } from './imageDownloadShared';

const IMAGE_DIR = path.join(app.getPath('temp'), 'ducklink-food-finder-images');

export function ensureImageDir(): void {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

export async function downloadAllImages(events: DownloadEvent[]): Promise<Map<string, DownloadedImage[]>> {
  const results = await downloadImages(events, IMAGE_DIR, (message, error) => {
    if (error) logger.warn(message);
    else logger.debug(message);
  });
  logger.info(`Downloaded ${[...results.values()].reduce((count, images) => count + images.length, 0)} images for ${events.length} events`);
  return results;
}

export function cleanupImages(): void {
  if (fs.existsSync(IMAGE_DIR)) {
    fs.rmSync(IMAGE_DIR, { recursive: true, force: true });
    logger.debug('Cleaned up temp images');
  }
}

export function getLocalImageDataUrl(filepath: string | null): string | null {
  if (!filepath || !fs.existsSync(filepath)) return null;
  try {
    const buffer = fs.readFileSync(filepath);
    const extension = path.extname(filepath).toLowerCase();
    const mimeType = extension === '.png' ? 'image/png' : extension === '.gif' ? 'image/gif' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    logger.warn(`Failed to convert image to data URL for ${filepath}: ${(error as Error).message}`);
    return null;
  }
}
