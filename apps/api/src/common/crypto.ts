import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url')

export const hmacSha256 = (secret: string, payload: string): string =>
  createHmac('sha256', secret).update(payload).digest('hex')

/** Constant-time comparison for HMACs and API keys: never compare secrets with `===`. */
export const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Verifies an outbox webhook signature (`sha256=<hex>`). Exported for event consumers. */
export const verifyWebhookSignature = (secret: string, payload: string, header: string): boolean =>
  safeEqual(header, `sha256=${hmacSha256(secret, payload)}`)
