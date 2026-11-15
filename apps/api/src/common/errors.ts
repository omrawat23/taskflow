// Typed error taxonomy. The error handler reads `status` and `code`; clients see the safe
// message, logs see the full `ctx`.
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly ctx?: Record<string, unknown>,
  ) {
    super(message)
    this.name = new.target.name
  }
}

/** 4xx: a user or business problem. Operational: handle it, respond, move on. */
export class DomainError extends AppError {}

/** 5xx: our problem. Operational but page-worthy (upstream down, timeout). */
export class SystemError extends AppError {}

export class ValidationFailed extends DomainError {
  constructor(details: unknown) {
    super('VALIDATION_FAILED', 400, 'Request validation failed', { details })
  }
}

export class Unauthorized extends DomainError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', 401, message)
  }
}

export class Forbidden extends DomainError {
  constructor(message = 'You are not allowed to do this') {
    super('FORBIDDEN', 403, message)
  }
}

export class NotFound extends DomainError {
  constructor(what: string) {
    super('NOT_FOUND', 404, `${what} not found`)
  }
}

export class Conflict extends DomainError {
  constructor(code: string, message: string) {
    super(code, 409, message)
  }
}

export class UnprocessableEntity extends DomainError {
  constructor(code: string, message: string) {
    super(code, 422, message)
  }
}

export class UpstreamFail extends SystemError {
  constructor(service: string, ctx?: Record<string, unknown>) {
    super('UPSTREAM', 502, `Upstream ${service} failed`, ctx)
  }
}

export class ServiceUnavailable extends SystemError {
  constructor(message = 'Service unavailable') {
    super('UNAVAILABLE', 503, message)
  }
}

/** Anything that is not an AppError is a programmer error (a bug). */
export const isOperational = (err: unknown): err is AppError => err instanceof AppError
