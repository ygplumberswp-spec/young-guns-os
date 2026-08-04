import { Router } from 'express';
import type { ApiHealthResponse } from '@titan/shared';
import { probeDbConnection } from '@titan/db';
import { API_VERSION, type RuntimeControls } from '../config.js';
import { pingRedisTcp } from '../lib/redis-ping.js';
import {
  buildStorageDiagnosticReport,
  type DeploymentStorageValidationInput,
  validateDeploymentStorageConfiguration,
} from '../lib/deployment-storage-validation.js';
import { probeFinancePdfRendererAvailability } from '../services/finance-document-pdf.service.js';

export type HealthRouterDeps = {
  databaseUrl?: string;
  redisUrl?: string;
  runtime?: RuntimeControls;
  storage?: DeploymentStorageValidationInput & {
    financeDirectUsesJobEvidenceRoot?: boolean;
  };
  /** Optional structured logger; falls back to console for readiness failures. */
  log?: {
    info: (obj: Record<string, unknown>, msg: string) => void;
    warn: (obj: Record<string, unknown>, msg: string) => void;
  };
};

function readinessLog(
  deps: HealthRouterDeps,
  level: 'info' | 'warn',
  obj: Record<string, unknown>,
  msg: string,
): void {
  if (deps.log) {
    deps.log[level](obj, msg);
    return;
  }
  const line = `[titan-api] ${msg} ${JSON.stringify(obj)}`;
  if (level === 'warn') console.warn(line);
  else console.log(line);
}

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
      readinessLog(
        deps,
        'warn',
        { code: 'NOT_CONFIGURED' },
        'Readiness failed: DATABASE_URL is not configured',
      );
      res.status(503).json({
        error: {
          code: 'NOT_CONFIGURED',
          message: 'DATABASE_URL is not configured',
        },
      });
      return;
    }

    const dbProbe = await probeDbConnection(deps.databaseUrl);
    if (!dbProbe.ok) {
      readinessLog(
        deps,
        'warn',
        {
          code: 'DB_UNAVAILABLE',
          dbErrorCode: dbProbe.code,
          dbErrorMessage: dbProbe.message,
          dbHost: dbProbe.endpoint.host,
          dbPort: dbProbe.endpoint.port,
          dbName: dbProbe.endpoint.database,
          dbSslmode: dbProbe.endpoint.sslmode,
          isSupabaseDirect: dbProbe.endpoint.isSupabaseDirect,
          isSupabasePooler: dbProbe.endpoint.isSupabasePooler,
          hint: dbProbe.endpoint.isSupabaseDirect
            ? 'Use the Supabase pooler DATABASE_URL (IPv4). Direct db.*.supabase.co hosts are IPv6-only and unreachable from Railway.'
            : undefined,
        },
        'Readiness failed: database is not reachable',
      );
      res.status(503).json({
        error: {
          code: 'DB_UNAVAILABLE',
          message: 'Database is not reachable',
          detail: {
            reason: dbProbe.code,
            host: dbProbe.endpoint.host,
            port: dbProbe.endpoint.port,
            sslmode: dbProbe.endpoint.sslmode,
            isSupabaseDirect: dbProbe.endpoint.isSupabaseDirect,
            isSupabasePooler: dbProbe.endpoint.isSupabasePooler,
          },
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
        readinessLog(
          deps,
          'warn',
          { code: 'REDIS_UNAVAILABLE', reason: ping.reason ?? 'unknown' },
          'Readiness failed: Redis is required but not reachable',
        );
        res.status(503).json({
          error: {
            code: 'REDIS_UNAVAILABLE',
            message: 'Redis is required for readiness but is not reachable',
          },
        });
        return;
      }
    } else if (deps.runtime?.readyRequireRedis) {
      readinessLog(
        deps,
        'warn',
        { code: 'REDIS_NOT_CONFIGURED' },
        'Readiness failed: REDIS_URL is required in this environment',
      );
      res.status(503).json({
        error: {
          code: 'REDIS_NOT_CONFIGURED',
          message: 'REDIS_URL is required for readiness in this environment',
        },
      });
      return;
    }

    readinessLog(
      deps,
      'info',
      {
        database: 'connected',
        redis: redisStatus,
        dbHost: dbProbe.endpoint.host,
        dbPort: dbProbe.endpoint.port,
        isSupabasePooler: dbProbe.endpoint.isSupabasePooler,
      },
      'Readiness ok',
    );

    res.json({
      data: {
        status: 'ready',
        database: 'connected',
        redis: redisStatus,
        providersEnabled: deps.runtime?.providersEnabled ?? false,
        schedulersEnabled: deps.runtime?.schedulersEnabled ?? false,
        workersEnabled: deps.runtime?.workersEnabled ?? false,
        webhooksEnabled: deps.runtime?.webhooksEnabled ?? false,
        timestamp: new Date().toISOString(),
      },
    });
  });

  router.get('/health/pdf-renderer', async (_req, res) => {
    const probe = await probeFinancePdfRendererAvailability();
    if (!probe.available) {
      res.status(503).json({
        error: {
          code: 'CHROMIUM_UNAVAILABLE',
          message: 'Headless Chromium is not available for finance PDF rendering',
        },
      });
      return;
    }
    res.json({
      data: {
        status: 'available',
        source: probe.source,
        timestamp: new Date().toISOString(),
      },
    });
  });

  router.get('/health/storage', async (_req, res) => {
    if (!deps.storage) {
      res.status(503).json({
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Storage diagnostics are not configured',
        },
      });
      return;
    }

    const validation = validateDeploymentStorageConfiguration(deps.storage);
    const report = buildStorageDiagnosticReport({
      jobEvidenceStoragePath: deps.storage.jobEvidenceStoragePath,
      companyMediaStoragePath: deps.storage.companyMediaStoragePath,
      financeDirectUsesJobEvidenceRoot: deps.storage.financeDirectUsesJobEvidenceRoot ?? true,
    });

    if (!validation.ok) {
      res.status(503).json({
        error: {
          code: 'STORAGE_MISCONFIGURED',
          message: validation.errors.join(' '),
        },
        data: report,
      });
      return;
    }

    res.json({
      data: {
        ...report,
        warnings: validation.warnings,
        timestamp: new Date().toISOString(),
      },
    });
  });

  return router;
}
