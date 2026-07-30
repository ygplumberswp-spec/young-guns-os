import type { NextFunction, Request, Response } from 'express';
import { setDbQueryLogHandler, type DbQueryLogEvent } from '@titan/db';

type RequestDbDiagnostics = {
  requestStartedAt: number;
  firstQueryAt: number | null;
  queryCount: number;
  signatures: Map<string, number>;
  slowestQueryMs: number;
  slowestQuerySignature: string | null;
  pendingQuery: { signature: string; startedAt: number } | null;
};

const diagnosticsByRequest = new WeakMap<Request, RequestDbDiagnostics>();

function normalizeQuerySignature(query: string): string {
  return query.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function getOrCreateDiagnostics(req: Request): RequestDbDiagnostics {
  let diagnostics = diagnosticsByRequest.get(req);
  if (!diagnostics) {
    diagnostics = {
      requestStartedAt: performance.now(),
      firstQueryAt: null,
      queryCount: 0,
      signatures: new Map(),
      slowestQueryMs: 0,
      slowestQuerySignature: null,
      pendingQuery: null,
    };
    diagnosticsByRequest.set(req, diagnostics);
  }
  return diagnostics;
}

function recordQueryStart(req: Request, event: DbQueryLogEvent) {
  const diagnostics = getOrCreateDiagnostics(req);
  const signature = normalizeQuerySignature(event.query);
  diagnostics.queryCount += 1;
  diagnostics.signatures.set(signature, (diagnostics.signatures.get(signature) ?? 0) + 1);
  if (diagnostics.firstQueryAt === null) {
    diagnostics.firstQueryAt = performance.now();
  }
  diagnostics.pendingQuery = { signature, startedAt: performance.now() };
}

function recordQueryEnd(req: Request) {
  const diagnostics = diagnosticsByRequest.get(req);
  if (!diagnostics?.pendingQuery) {
    return;
  }
  const durationMs = performance.now() - diagnostics.pendingQuery.startedAt;
  if (durationMs > diagnostics.slowestQueryMs) {
    diagnostics.slowestQueryMs = durationMs;
    diagnostics.slowestQuerySignature = diagnostics.pendingQuery.signature;
  }
  diagnostics.pendingQuery = null;
}

function buildServerTimingHeader(req: Request, serviceDurationMs: number): string | null {
  const diagnostics = diagnosticsByRequest.get(req);
  if (!diagnostics) {
    return null;
  }

  const poolWaitMs =
    diagnostics.firstQueryAt !== null
      ? Math.max(0, Math.round(diagnostics.firstQueryAt - diagnostics.requestStartedAt))
      : 0;
  const duplicateSignatures = [...diagnostics.signatures.entries()]
    .filter(([, count]) => count > 1)
    .map(([signature]) => signature);

  const parts = [
    `svc;dur=${Math.round(serviceDurationMs)}`,
    `db-queries;desc="${diagnostics.queryCount}"`,
    `db-pool-wait;dur=${poolWaitMs}`,
  ];

  if (diagnostics.slowestQueryMs > 0) {
    parts.push(`db-slowest;dur=${Math.round(diagnostics.slowestQueryMs)}`);
  }
  if (duplicateSignatures.length > 0) {
    parts.push(`db-dupes;desc="${duplicateSignatures.length}"`);
  }

  return parts.join(', ');
}

let handlerAttached = false;

export function attachDbQueryDiagnostics() {
  if (handlerAttached) {
    return;
  }
  handlerAttached = true;

  setDbQueryLogHandler((event) => {
    const req = currentRequest;
    if (!req) {
      return;
    }
    recordQueryStart(req, event);
    queueMicrotask(() => recordQueryEnd(req));
  });
}

let currentRequest: Request | null = null;

export function createDbDiagnosticsMiddleware(isEnabled: boolean) {
  if (!isEnabled) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  attachDbQueryDiagnostics();

  return (req: Request, res: Response, next: NextFunction) => {
    getOrCreateDiagnostics(req);
    const previous = currentRequest;
    currentRequest = req;

    const startedAt = performance.now();
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    const attachTiming = () => {
      const header = buildServerTimingHeader(req, performance.now() - startedAt);
      if (header && !res.getHeader('Server-Timing')) {
        res.setHeader('Server-Timing', header);
      }
    };

    res.json = ((body: unknown) => {
      attachTiming();
      return originalJson(body);
    }) as Response['json'];

    res.send = ((body?: unknown) => {
      attachTiming();
      return originalSend(body);
    }) as Response['send'];

    res.on('finish', () => {
      currentRequest = previous;
    });

    next();
  };
}

export function getRequestDbDiagnostics(req: Request) {
  const diagnostics = diagnosticsByRequest.get(req);
  if (!diagnostics) {
    return null;
  }

  const poolWaitMs =
    diagnostics.firstQueryAt !== null
      ? Math.max(0, Math.round(diagnostics.firstQueryAt - diagnostics.requestStartedAt))
      : 0;

  return {
    poolWaitMs,
    queryCount: diagnostics.queryCount,
    slowestQueryMs: Math.round(diagnostics.slowestQueryMs),
    slowestQuerySignature: diagnostics.slowestQuerySignature,
    duplicateSignatures: [...diagnostics.signatures.entries()]
      .filter(([, count]) => count > 1)
      .map(([signature, count]) => ({ signature, count })),
  };
}
