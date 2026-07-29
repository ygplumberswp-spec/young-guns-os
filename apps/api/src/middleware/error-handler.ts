import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';

export function notFoundHandler(): RequestHandler {
  return (_req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    });
  };
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, _next) => {
    logger.error({ err: error }, 'Unhandled request error');

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  };
}
