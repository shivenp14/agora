import fs from 'fs';
import path from 'path';
import os from 'os';
import { downloadImages, DownloadEvent, DownloadedImage } from './imageDownloadShared';

const IMAGE_DIR = path.join(process.env.TEMP || os.tmpdir(), 'ducklink-food-finder-images');

export async function downloadAllImagesCli(events: DownloadEvent[]): Promise<Map<string, DownloadedImage[]>> {
  const results = await downloadImages(events, IMAGE_DIR, (message) => console.log(`  ${message}`));
  const total = [...results.values()].reduce((count, images) => count + images.length, 0);
  console.log(`Downloaded ${total} images for ${events.length} events`);
  return results;
}

export function cleanupImagesCli(): void {
  if (fs.existsSync(IMAGE_DIR)) {
    fs.rmSync(IMAGE_DIR, { recursive: true, force: true });
    console.log('Cleaned up temp images');
  }
}
