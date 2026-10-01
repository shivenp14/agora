export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  onRetry?: (attempt: number, error: Error) => void;
  shouldRetry?: (error: Error) => boolean;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= options.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (options.shouldRetry && !options.shouldRetry(lastError)) throw lastError;

      if (attempt <= options.maxRetries) {
        options.onRetry?.(attempt, lastError);

        const delay = Math.min(
          options.baseDelay * Math.pow(options.backoffMultiplier, attempt - 1),
          options.maxDelay
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError!;
}
