import { Router } from 'express';
import type { ApiHealthResponse } from '@titan/shared';
import { checkDbConnection } from '@titan/db';
import { API_VERSION, type RuntimeControls } from '../config.js';
import { pingRedisTcp } from '../lib/redis-ping.js';

export type HealthRouterDeps = {
  databaseUrl?: string;
  redisUrl?: string;
  runtime?: RuntimeControls;
};

export function createHealthRouter(
  databaseUrlOrDeps?: string | HealthRouterDeps,
): Router {
  const deps: HealthRouterDeps =
    typeof databaseUrlOrDeps === 'string' || databaseUrlOrDeps === undefined
      ? { databaseUrl: databaseUrlOrDeps }
      : databaseUrlOrDeps;

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

  router.get('/health/live', async (_req, res) => {
    res.json({
      data: {
        status: 'live',
        service: 'titan-api',
        version: API_VERSION,
        timestamp: new Date().toISOString(),
      },
    });
  });

  router.get('/health/ready', async (_req, res) => {
    if (!deps.databaseUrl) {
      res.status(503).json({
        error: {
          code: 'NOT_CONFIGURED',
          message: 'DATABASE_URL is not configured',
        },
      });
      return;
    }

    const dbReady = await checkDbConnection(deps.databaseUrl);
    if (!dbReady) {
      res.status(503).json({
        error: {
          code: 'DB_UNAVAILABLE',
          message: 'Database is not reachable',
        },
      });
      return;
    }

    // Redis is optional unless READY_REQUIRE_REDIS=true. Staging deploys without Redis
    // must still return HTTP 200 from /health/ready when the database is reachable.
    let redisStatus: 'not_configured' | 'connected' | 'unavailable' = 'not_configured';
    if (deps.redisUrl) {
      const ping = await pingRedisTcp(deps.redisUrl);
      redisStatus = ping.ok ? 'connected' : 'unavailable';
      if (!ping.ok && deps.runtime?.readyRequireRedis) {
        res.status(503).json({
          error: {
            code: 'REDIS_UNAVAILABLE',
            message: 'Redis is required for readiness but is not reachable',
          },
        });
        return;
      }
    } else if (deps.runtime?.readyRequireRedis) {
      res.status(503).json({
        error: {
          code: 'REDIS_NOT_CONFIGURED',
          message: 'REDIS_URL is required for readiness in this environment',
        },
      });
      return;
    }

    res.json({
      data: {
        status: 'ready',
        database: 'connected',
        redis: redisStatus,
        providersEnabled: deps.runtime?.providersEnabled ?? false,
        workersEnabled: deps.runtime?.workersEnabled ?? false,
        webhooksEnabled: deps.runtime?.webhooksEnabled ?? false,
        timestamp: new Date().toISOString(),
      },
    });
  });

  return router;
}
