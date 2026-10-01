import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { retryWithBackoff } from '../utils/retry';
import { ImageCandidate } from './imageCandidates';

export interface DownloadedImage extends ImageCandidate {
  path: string;
  sha256: string;
}

export interface DownloadEvent {
  id: string;
  imageUrl: string | null;
  imageCandidates?: ImageCandidate[];
}

const MAX_IMAGES_PER_EVENT = 6;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15000;

export async function downloadImages(
  events: DownloadEvent[],
  imageDir: string,
  onLog: (message: string, error?: boolean) => void,
): Promise<Map<string, DownloadedImage[]>> {
  fs.mkdirSync(imageDir, { recursive: true });
  const queue = events.flatMap((event) => {
    const candidates = event.imageCandidates?.length
      ? event.imageCandidates
      : event.imageUrl ? [{ url: event.imageUrl, source: 'banner' as const }] : [];
    return candidates.slice(0, MAX_IMAGES_PER_EVENT).map((candidate, index) => ({ event, candidate, index }));
  });
  const output = new Map<string, Array<{ image: DownloadedImage; candidateIndex: number }>>();
  let nextIndex = 0;
  const workerCount = Math.min(3, queue.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < queue.length) {
      const job = queue[nextIndex++];
      if (!job) continue;
      const downloaded = await downloadOne(job.event.id, job.candidate, job.index, imageDir, onLog);
      if (!downloaded) continue;
      const list = output.get(job.event.id) || [];
      list.push({ image: downloaded, candidateIndex: job.index });
      output.set(job.event.id, list);
    }
  }));

  const orderedOutput = new Map<string, DownloadedImage[]>();
  for (const [eventId, list] of output) {
    list.sort((a, b) => a.candidateIndex - b.candidateIndex);
    orderedOutput.set(eventId, list.map(({ image }) => image));
  }
  return orderedOutput;
}

async function downloadOne(
  eventId: string,
  candidate: ImageCandidate,
  index: number,
  imageDir: string,
  onLog: (message: string, error?: boolean) => void,
): Promise<DownloadedImage | null> {
  try {
    const response = await retryWithBackoff(async () => axios.get(candidate.url, {
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxContentLength: MAX_IMAGE_BYTES,
      maxBodyLength: MAX_IMAGE_BYTES,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/png,image/jpeg,image/*;q=0.8',
        Referer: 'https://ducklink.stevens.edu/',
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 500,
    }), { maxRetries: 2, baseDelay: 500, maxDelay: 2000, backoffMultiplier: 2 });

    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    const bytes = Buffer.from(response.data);
    if (!contentType.startsWith('image/') || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
      onLog(`Image candidate skipped for ${eventId}: invalid type or size (${contentType}, ${bytes.length} bytes)`, true);
      return null;
    }

    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const extension = extensionFor(candidate.url, contentType);
    const safeId = eventId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filepath = path.join(imageDir, `${safeId}-${index}-${sha256.slice(0, 12)}${extension}`);
    fs.writeFileSync(filepath, bytes);
    return { ...candidate, path: filepath, sha256 };
  } catch (error) {
    onLog(`Failed to download image candidate for ${eventId}: ${(error as Error).message}`, true);
    return null;
  }
}

function extensionFor(url: string, contentType: string): string {
  const match = url.match(/\.(jpg|jpeg|png|gif|webp)(?:[?#]|$)/i);
  if (match) return `.${match[1].toLowerCase()}`;
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('webp')) return '.webp';
  return '.jpg';
}
