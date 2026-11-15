import type { RequestHandler } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import type { Redis } from 'ioredis'
import { type RedisReply, RedisStore } from 'rate-limit-redis'
import { sendError } from './http.js'

// Rate-limit counters live in Redis so every replica shares them. The in-memory fallback only
// exists for development and tests (config refuses to start in production without REDIS_URL).

export interface LimiterOptions {
  redis: Redis | null
  prefix: string
  windowMs: number
  limit: number
  /** 'ip' throttles anonymous traffic; 'user' throttles each authenticated user. */
  by: 'ip' | 'user'
  skip?: (path: string) => boolean
}

export const createLimiter = ({
  redis,
  prefix,
  windowMs,
  limit,
  by,
  skip,
}: LimiterOptions): RequestHandler =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(redis
      ? {
          store: new RedisStore({
            prefix: `rl:${prefix}:`,
            sendCommand: (command: string, ...args: string[]) =>
              redis.call(command, ...args) as Promise<RedisReply>,
          }),
        }
      : {}),
    keyGenerator: (req) =>
      by === 'user' && req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip ?? 'unknown'),
    ...(skip ? { skip: (req) => skip(req.path) } : {}),
    handler: (req, res) =>
      sendError(req, res, 429, { code: 'RATE_LIMITED', message: 'Too many requests, slow down' }),
  })
