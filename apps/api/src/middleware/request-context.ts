import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

/** Attach a correlation ID for structured logs (never logs secrets). */
export function requestContextMiddleware(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header('x-correlation-id')?.trim();
    const correlationId =
      incoming && incoming.length <= 128 ? incoming : randomUUID();
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);
    next();
  };
}
