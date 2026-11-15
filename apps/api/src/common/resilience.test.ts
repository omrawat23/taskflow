import { describe, expect, it } from 'vitest'
import { hmacSha256, verifyWebhookSignature } from './crypto.js'
import { backoffDelay, NonRetryableError, retry } from './resilience.js'

// Unit tests are reserved for pure logic: backoff math, retry policy, signature checks.

describe('backoffDelay', () => {
  const opts = { baseDelayMs: 100, maxDelayMs: 1_000 }

  it('grows exponentially and never exceeds the cap', () => {
    const max = () => 0.999_999
    expect(backoffDelay(1, opts, max)).toBe(99)
    expect(backoffDelay(3, opts, max)).toBe(399)
    expect(backoffDelay(10, opts, max)).toBe(999)
  })

  it('applies full jitter down to zero', () => {
    expect(backoffDelay(5, opts, () => 0)).toBe(0)
  })
})

describe('retry', () => {
  const fast = { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 }

  it('succeeds after transient failures', async () => {
    let calls = 0
    const result = await retry(async () => {
      calls++
      if (calls < 3) throw new Error('transient')
      return 'ok'
    }, fast)
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it('never retries a non-retryable (4xx) failure', async () => {
    let calls = 0
    await expect(
      retry(async () => {
        calls++
        throw new NonRetryableError('400')
      }, fast),
    ).rejects.toThrow('400')
    expect(calls).toBe(1)
  })

  it('gives up after the bounded number of attempts', async () => {
    let calls = 0
    await expect(
      retry(async () => {
        calls++
        throw new Error('down')
      }, fast),
    ).rejects.toThrow('down')
    expect(calls).toBe(3)
  })
})

describe('verifyWebhookSignature', () => {
  const secret = 'a'.repeat(32)
  const payload = '{"id":"1"}'

  it('accepts the signature the publisher produces', () => {
    expect(verifyWebhookSignature(secret, payload, `sha256=${hmacSha256(secret, payload)}`)).toBe(
      true,
    )
  })

  it('rejects a tampered payload or a truncated signature', () => {
    const header = `sha256=${hmacSha256(secret, payload)}`
    expect(verifyWebhookSignature(secret, '{"id":"2"}', header)).toBe(false)
    expect(verifyWebhookSignature(secret, payload, header.slice(0, -1))).toBe(false)
  })
})
