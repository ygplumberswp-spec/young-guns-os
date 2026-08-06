import { eq } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import { securityAuditLogs, xeroRateBudgetState } from '@titan/db';
import { resolveRateLimitDelayMs } from '../lib/xero.client.js';

export type XeroRateBudgetHeaders = {
  minLimitRemaining?: number | null;
  dayLimitRemaining?: number | null;
  appMinLimitRemaining?: number | null;
  rateLimitProblem?: string | null;
  retryAfterSeconds?: number | null;
  correlationId?: string | null;
  responseDate?: string | null;
};

/** Lower rank = higher priority. Owner proof reads beat background sync. */
export type XeroRequestPriority =
  | 'webhook_targeted_refresh'
  | 'owner_proof_read'
  | 'incremental_refresh'
  | 'background_sync'
  | 'historical_import';

const PRIORITY_RANK: Record<XeroRequestPriority, number> = {
  webhook_targeted_refresh: 1,
  owner_proof_read: 2,
  incremental_refresh: 3,
  background_sync: 4,
  historical_import: 5,
};

/** During proof/sync pause, only webhook + owner reads may proceed. */
const SYNC_PAUSE_MAX_RANK = PRIORITY_RANK.owner_proof_read;

export class XeroRateBudgetError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'XeroRateBudgetError';
  }
}

export type XeroRateBudgetStateSnapshot = {
  companyId: string;
  minLimitRemaining: number | null;
  dayLimitRemaining: number | null;
  appMinLimitRemaining: number | null;
  rateLimitProblem: string | null;
  retryAfterUntil: string | null;
  syncPausedUntil: string | null;
  syncPauseReason: string | null;
  lastRequestAt: string | null;
  lastResponseDate: string | null;
  updatedAt: string | null;
};

const MAX_CONCURRENT_PER_TENANT = 5;
const tenantInflight = new Map<string, number>();

export class XeroRateBudgetService {
  constructor(private readonly db: DatabaseClient) {}

  static create(db: DatabaseClient): XeroRateBudgetService {
    return new XeroRateBudgetService(db);
  }

  priorityRank(priority: XeroRequestPriority): number {
    return PRIORITY_RANK[priority];
  }

  async getState(companyId: string): Promise<XeroRateBudgetStateSnapshot | null> {
    const row = await this.db.query.xeroRateBudgetState.findFirst({
      where: eq(xeroRateBudgetState.companyId, companyId),
    });
    if (!row) return null;

    return {
      companyId: row.companyId,
      minLimitRemaining: row.minLimitRemaining,
      dayLimitRemaining: row.dayLimitRemaining,
      appMinLimitRemaining: row.appMinLimitRemaining,
      rateLimitProblem: row.rateLimitProblem,
      retryAfterUntil: row.retryAfterUntil?.toISOString() ?? null,
      syncPausedUntil: row.syncPausedUntil?.toISOString() ?? null,
      syncPauseReason: row.syncPauseReason,
      lastRequestAt: row.lastRequestAt?.toISOString() ?? null,
      lastResponseDate: row.lastResponseDate,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  }

  async recordHeaders(companyId: string, headers: XeroRateBudgetHeaders): Promise<void> {
    const retryAfterUntil = this.resolveRetryAfterUntil(headers);

    await this.db
      .insert(xeroRateBudgetState)
      .values({
        companyId,
        minLimitRemaining: headers.minLimitRemaining ?? null,
        dayLimitRemaining: headers.dayLimitRemaining ?? null,
        appMinLimitRemaining: headers.appMinLimitRemaining ?? null,
        rateLimitProblem: headers.rateLimitProblem ?? null,
        retryAfterUntil,
        lastCorrelationId: headers.correlationId ?? null,
        lastResponseDate: headers.responseDate ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: xeroRateBudgetState.companyId,
        set: {
          minLimitRemaining: headers.minLimitRemaining ?? null,
          dayLimitRemaining: headers.dayLimitRemaining ?? null,
          appMinLimitRemaining: headers.appMinLimitRemaining ?? null,
          rateLimitProblem: headers.rateLimitProblem ?? null,
          retryAfterUntil,
          lastCorrelationId: headers.correlationId ?? null,
          lastResponseDate: headers.responseDate ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async recordResponse(companyId: string, response: Response): Promise<void> {
    const parsed = parseXeroRateBudgetHeaders(response.headers);
    parsed.responseDate = response.headers.get('Date');

    if (response.status === 429) {
      parsed.rateLimitProblem = parsed.rateLimitProblem ?? 'rate_limit_exceeded';
      const retryAfterHeader = response.headers.get('Retry-After');
      const delayMs = resolveRateLimitDelayMs(retryAfterHeader, 1);
      parsed.retryAfterSeconds = Math.ceil(delayMs / 1000);
    }

    await this.recordHeaders(companyId, parsed);
    await this.touchLastRequest(companyId);
  }

  async touchLastRequest(companyId: string): Promise<void> {
    const now = new Date();
    await this.db
      .insert(xeroRateBudgetState)
      .values({ companyId, lastRequestAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: xeroRateBudgetState.companyId,
        set: { lastRequestAt: now, updatedAt: now },
      });
  }

  async isSyncPaused(companyId: string): Promise<boolean> {
    const row = await this.db.query.xeroRateBudgetState.findFirst({
      where: eq(xeroRateBudgetState.companyId, companyId),
    });
    if (!row?.syncPauseReason) return false;
    if (!row.syncPausedUntil) return true;
    return row.syncPausedUntil.getTime() > Date.now();
  }

  async isPaused(companyId: string): Promise<boolean> {
    const row = await this.db.query.xeroRateBudgetState.findFirst({
      where: eq(xeroRateBudgetState.companyId, companyId),
    });
    if (!row) return false;
    if (row.retryAfterUntil && row.retryAfterUntil.getTime() > Date.now()) return true;
    if (row.minLimitRemaining !== null && row.minLimitRemaining <= 1) return true;
    if (row.dayLimitRemaining !== null && row.dayLimitRemaining <= 5) return true;
    return false;
  }

  async canStartWork(companyId: string, priority: XeroRequestPriority): Promise<boolean> {
    const rank = PRIORITY_RANK[priority];
    if (rank > SYNC_PAUSE_MAX_RANK && (await this.isSyncPaused(companyId))) {
      return false;
    }
    if (rank > SYNC_PAUSE_MAX_RANK && (await this.isPaused(companyId))) {
      return false;
    }
    return true;
  }

  async pauseTenantSync(
    companyId: string,
    reason: string,
    options?: { until?: Date; userId?: string; auditLabel?: string },
  ): Promise<void> {
    const until = options?.until ?? new Date(Date.now() + 60 * 60_000);
    await this.db
      .insert(xeroRateBudgetState)
      .values({
        companyId,
        syncPauseReason: reason,
        syncPausedUntil: until,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: xeroRateBudgetState.companyId,
        set: {
          syncPauseReason: reason,
          syncPausedUntil: until,
          updatedAt: new Date(),
        },
      });

    await this.recordAudit(companyId, options?.userId, options?.auditLabel ?? 'xero_sync_paused', {
      reason,
      until: until.toISOString(),
    });
  }

  async resumeTenantSync(
    companyId: string,
    options?: { userId?: string; auditLabel?: string },
  ): Promise<void> {
    await this.db
      .update(xeroRateBudgetState)
      .set({
        syncPauseReason: null,
        syncPausedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(xeroRateBudgetState.companyId, companyId));

    await this.recordAudit(companyId, options?.userId, options?.auditLabel ?? 'xero_sync_resumed', {});
  }

  async waitForCooldown(
    companyId: string,
    options?: { minQuietMs?: number; maxWaitMs?: number },
  ): Promise<{ ready: boolean; waitedMs: number; lastRequestAt: string | null }> {
    const minQuietMs = options?.minQuietMs ?? 120_000;
    const maxWaitMs = options?.maxWaitMs ?? 180_000;
    const started = Date.now();
    let baselineRequestAt: string | null = null;

    while (Date.now() - started < maxWaitMs) {
      const state = await this.getState(companyId);
      const retryUntilMs = state?.retryAfterUntil ? Date.parse(state.retryAfterUntil) : 0;
      const retryClear = !Number.isFinite(retryUntilMs) || retryUntilMs <= Date.now();

      if (baselineRequestAt === null) {
        baselineRequestAt = state?.lastRequestAt ?? null;
      } else if (state?.lastRequestAt && state.lastRequestAt !== baselineRequestAt) {
        baselineRequestAt = state.lastRequestAt;
      }

      const quietSinceMs = state?.lastRequestAt
        ? Date.now() - Date.parse(state.lastRequestAt)
        : minQuietMs;
      const syncPaused = await this.isSyncPaused(companyId);

      if (retryClear && quietSinceMs >= minQuietMs && syncPaused) {
        return { ready: true, waitedMs: Date.now() - started, lastRequestAt: state?.lastRequestAt ?? null };
      }

      await sleep(Math.min(5_000, maxWaitMs - (Date.now() - started)));
    }

    const state = await this.getState(companyId);
    return { ready: false, waitedMs: Date.now() - started, lastRequestAt: state?.lastRequestAt ?? null };
  }

  acquireConcurrentSlot(companyId: string): boolean {
    const current = tenantInflight.get(companyId) ?? 0;
    if (current >= MAX_CONCURRENT_PER_TENANT) return false;
    tenantInflight.set(companyId, current + 1);
    return true;
  }

  releaseConcurrentSlot(companyId: string): void {
    const current = tenantInflight.get(companyId) ?? 0;
    if (current <= 1) tenantInflight.delete(companyId);
    else tenantInflight.set(companyId, current - 1);
  }

  async executeWithBudget<T>(
    companyId: string,
    priority: XeroRequestPriority,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!(await this.canStartWork(companyId, priority))) {
      const state = await this.getState(companyId);
      const retryAfterMs = state?.retryAfterUntil
        ? Math.max(Date.parse(state.retryAfterUntil) - Date.now(), 0)
        : undefined;
      throw new XeroRateBudgetError(
        'BUDGET_EXHAUSTED',
        'Xero tenant rate budget or sync pause prevents this request',
        retryAfterMs,
      );
    }

    if (!this.acquireConcurrentSlot(companyId)) {
      throw new XeroRateBudgetError(
        'CONCURRENT_LIMIT',
        'Xero tenant concurrent request limit reached',
      );
    }

    try {
      await this.touchLastRequest(companyId);
      return await fn();
    } finally {
      this.releaseConcurrentSlot(companyId);
    }
  }

  resetForTests(): void {
    tenantInflight.clear();
  }

  private resolveRetryAfterUntil(headers: XeroRateBudgetHeaders): Date | null {
    if (headers.retryAfterSeconds && headers.retryAfterSeconds > 0) {
      return new Date(Date.now() + headers.retryAfterSeconds * 1000);
    }
    return null;
  }

  private async recordAudit(
    companyId: string,
    userId: string | undefined,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId,
      userId: userId ?? null,
      category: 'integrations',
      action,
      entityType: 'xero_rate_budget',
      entityId: companyId,
      metadata,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseXeroRateBudgetHeaders(
  headers: Headers | Record<string, string | null | undefined>,
): XeroRateBudgetHeaders {
  const read = (name: string): string | null => {
    if (headers instanceof Headers) return headers.get(name);
    const direct = headers[name] ?? headers[name.toLowerCase()];
    return direct ?? null;
  };

  const parseIntHeader = (name: string): number | null => {
    const raw = read(name);
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  };

  const retryRaw = read('Retry-After');
  let retryAfterSeconds: number | null = null;
  if (retryRaw) {
    const delayMs = resolveRateLimitDelayMs(retryRaw, 1);
    retryAfterSeconds = Math.ceil(delayMs / 1000);
  }

  return {
    minLimitRemaining: parseIntHeader('X-MinLimit-Remaining'),
    dayLimitRemaining: parseIntHeader('X-DayLimit-Remaining'),
    appMinLimitRemaining: parseIntHeader('X-AppMinLimit-Remaining'),
    rateLimitProblem: read('X-Rate-Limit-Problem'),
    retryAfterSeconds,
    correlationId: read('Xero-Correlation-Id'),
    responseDate: read('Date'),
  };
}
