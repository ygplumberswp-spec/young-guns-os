import { Router } from 'express';
import type { ApiHealthResponse } from '@titan/shared';
import { API_VERSION } from '../config.js';
import { checkDbConnection } from '@titan/db';

export function createHealthRouter(databaseUrl?: string): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const response: ApiHealthResponse = {
      status: 'ok',
      service: 'titan-api',
      version: API_VERSION,
      timestamp: new Date().toISOString(),
    };

    res.json({ data: response });
  });

  router.get('/health/ready', async (_req, res) => {
    if (!databaseUrl) {
      res.status(503).json({
        error: {
          code: 'NOT_CONFIGURED',
          message: 'DATABASE_URL is not configured',
        },
      });
      return;
    }

    const dbReady = await checkDbConnection(databaseUrl);

    if (!dbReady) {
      res.status(503).json({
        error: {
          code: 'DB_UNAVAILABLE',
          message: 'Database is not reachable',
        },
      });
      return;
    }

    res.json({
      data: {
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      },
    });
  });

  return router;
}
