import CircuitBreaker from 'opossum'

// Retry with exponential backoff + full jitter, wrapped in a circuit breaker.
// Wrapping opossum here keeps the rest of the code base library-agnostic.

export class NonRetryableError extends Error {}

export interface RetryOptions {
  attempts: number
  baseDelayMs: number
  maxDelayMs: number
}

/** Pure: delay before retry number `attempt` (1-based). Full jitter keeps retries de-synchronised. */
export const backoffDelay = (
  attempt: number,
  { baseDelayMs, maxDelayMs }: Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs'>,
  random: () => number = Math.random,
): number => Math.floor(random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)))

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Bounded attempts, bounded delay. `NonRetryableError` (e.g. a 4xx) stops immediately. */
export const retry = async <T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> => {
  let lastError: unknown
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (err instanceof NonRetryableError || attempt === opts.attempts) break
      await sleep(backoffDelay(attempt, opts))
    }
  }
  throw lastError
}

export interface Breaker<A extends unknown[], R> {
  fire(...args: A): Promise<R>
  readonly opened: boolean
  shutdown(): void
}

export const circuitBreaker = <A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  opts: { name: string; resetTimeoutMs: number; errorThresholdPercentage: number },
): Breaker<A, R> => {
  const breaker = new CircuitBreaker(fn, {
    name: opts.name,
    resetTimeout: opts.resetTimeoutMs,
    errorThresholdPercentage: opts.errorThresholdPercentage,
    timeout: false, // the wrapped call bounds itself with AbortSignal.timeout
    // 4xx are the caller's fault, not a sign the dependency is down.
    errorFilter: (err: unknown) => err instanceof NonRetryableError,
  })
  return {
    fire: (...args) => breaker.fire(...args) as Promise<R>,
    get opened() {
      return breaker.opened
    },
    shutdown: () => breaker.shutdown(),
  }
}
