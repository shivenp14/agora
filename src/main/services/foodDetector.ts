import { logger } from '../utils/logger';
import { classifyBatchWithRetry, LLMBatchInput } from './llm';

export type FoodDetectorProgressCallback = (
  currentBatch: number,
  totalBatches: number,
  eventsInBatch: number
) => void;

const BATCH_SIZE = 5;
const CONCURRENT_BATCHES = 3;

interface FoodFields {
  hasFood: boolean;
  foodReasoning: string;
  foodStatus?: 'provided' | 'not_provided' | 'uncertain' | 'unavailable';
  foodConfidence: number;
}

export async function detectFood<T extends { id: string; name: string; description: string; ocrText: string }>(
  events: T[],
  onProgress?: FoodDetectorProgressCallback
): Promise<(T & FoodFields)[]> {
  if (events.length === 0) {
    logger.info('No events to classify');
    return events.map((e) => ({ ...e, hasFood: false, foodReasoning: '', foodConfidence: 0 }));
  }

  const batches = chunkEvents(events, BATCH_SIZE);
  const results: (T & FoodFields)[] = new Array(events.length);
  const originalIndexById = new Map<string, number>();
  events.forEach((event, index) => {
    if (!originalIndexById.has(event.id)) originalIndexById.set(event.id, index);
  });

  logger.info(`Classifying ${events.length} events in ${batches.length} batches with ${CONCURRENT_BATCHES} concurrent`);

  const processBatch = async (batch: T[], batchIndex: number): Promise<(T & FoodFields)[]> => {
    const inputs: LLMBatchInput[] = batch.map((event, localIndex) => ({
      index: localIndex,
      title: event.name,
      description: event.description,
      imageText: event.ocrText,
    }));

    try {
      const batchResults = await classifyBatchWithRetry(inputs);
      return batchResults.map((r) => ({
        ...batch[r.index],
        hasFood: r.hasFood,
        foodReasoning: r.reasoning,
        foodStatus: r.foodStatus,
        foodConfidence: r.confidence,
      }));
    } catch (error) {
      failedBatches++;
      lastFailure = error instanceof Error ? error.message : String(error);
      logger.error(`LLM batch ${batchIndex + 1} failed after retries: ${(error as Error).message}`);
      return batch.map((event) => ({
        ...event,
        hasFood: false,
        foodReasoning: 'Food detection failed for this batch',
        foodStatus: 'unavailable' as const,
        foodConfidence: 0,
      }));
    }
  };

  const running: Promise<void>[] = [];
  let currentBatchIndex = 0;
  let failedBatches = 0;
  let lastFailure = 'AI service unavailable';

  const runNextBatch = async (): Promise<void> => {
    while (currentBatchIndex < batches.length) {
      const batchIdx = currentBatchIndex++;
      const batch = batches[batchIdx];
      onProgress?.(batchIdx + 1, batches.length, batch.length);

      const batchResults = await processBatch(batch, batchIdx);
      for (const result of batchResults) {
        const originalIndex = originalIndexById.get(result.id);
        if (originalIndex !== undefined) {
          results[originalIndex] = result;
        }
      }
    }
  };

  const workers = Math.min(CONCURRENT_BATCHES, batches.length);
  for (let i = 0; i < workers; i++) {
    running.push(runNextBatch());
  }

  await Promise.all(running);

  if (failedBatches === batches.length) {
    throw new Error(`Food detection failed for all events: ${lastFailure}`);
  }

  const foodCount = results.filter((e) => e.hasFood).length;
  logger.info(`Classification complete: ${foodCount}/${results.length} events have food`);

  return results;
}

export function sortEventsByFood<T extends { hasFood: boolean; startTime: string }>(
  events: T[]
): T[] {
  return [...events].sort((a, b) => {
    if (a.hasFood && !b.hasFood) return -1;
    if (!a.hasFood && b.hasFood) return 1;
    return compareTime(a.startTime, b.startTime);
  });
}

function chunkEvents<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function compareTime(a: string, b: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const toMinutes = (t: string): number => {
    const match = t.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (!match) return 9999;
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const period = match[3].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };

  return toMinutes(a) - toMinutes(b);
}
