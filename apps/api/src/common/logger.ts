import pino, { type Logger } from 'pino'

// pino: JSON to stdout, redaction baked in. Secrets never reach the log aggregator.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
]

export const createLogger = (level: string, pretty = false): Logger =>
  pino({
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: { service: 'taskflow-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(pretty ? { transport: { target: 'pino-pretty' } } : {}),
  })

export type { Logger }
