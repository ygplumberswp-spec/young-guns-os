import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedRequest } from './auth.js';
import type { IntegrationPlatformService } from '../services/integration-platform.service.js';
import type { ConnectorEngineService } from '../services/connector-engine.service.js';

type ApiGatewayDeps = {
  integrationPlatformService: IntegrationPlatformService;
  connectorEngine: ConnectorEngineService;
};

export function createApiGatewayMiddleware({
  integrationPlatformService,
  connectorEngine,
}: ApiGatewayDeps) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      next();
      return;
    }

    const traceId = connectorEngine.createTraceId();
    const apiVersion =
      typeof req.headers['x-titan-api-version'] === 'string'
        ? req.headers['x-titan-api-version']
        : 'v1';
    const startedAt = Date.now();

    res.setHeader('X-Titan-Trace-Id', traceId);
    res.setHeader('X-Titan-Api-Version', apiVersion);

    res.on('finish', () => {
      void integrationPlatformService.recordGatewayTrace({
        companyId: auth.companyId,
        traceId,
        routeKey: 'integration-platform',
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        apiVersion,
        userId: auth.userId,
      });
    });

    next();
  };
}

export function createTraceIdHeader(): string {
  return randomUUID();
}
