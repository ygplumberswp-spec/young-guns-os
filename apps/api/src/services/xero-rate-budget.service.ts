import { eq } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import { xeroRateBudgetState } from '@titan/db';

export type XeroRateBudgetHeaders = {
  minLimitRemaining?: number | null;
  dayLimitRemaining?: number | null;
  appMinLimitRemaining?: number | null;
  rateLimitProblem?: string | null;
  retryAfterSeconds?: number | null;
  correlationId?: string | null;
};

const MAX_CONCURRENT_PER_TENANT = 5;
const tenantInflight = new Map<string, number>();

export class XeroRateBudgetService {
  constructor(private readonly db: DatabaseClient) {}

  static create(db: DatabaseClient): XeroRateBudgetService {
    return new XeroRateBudgetService(db);
  }

  async recordHeaders(companyId: string, headers: XeroRateBudgetHeaders): Promise<void> {
    const retryAfterUntil =
      headers.retryAfterSeconds && headers.retryAfterSeconds > 0
        ? new Date(Date.now() + headers.retryAfterSeconds * 1000)
        : null;

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
          updatedAt: new Date(),
        },
      });
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

  resetForTests(): void {
    tenantInflight.clear();
  }
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
    const parsed = Number.parseInt(retryRaw, 10);
    retryAfterSeconds = Number.isFinite(parsed) ? parsed : null;
  }

  return {
    minLimitRemaining: parseIntHeader('X-MinLimit-Remaining'),
    dayLimitRemaining: parseIntHeader('X-DayLimit-Remaining'),
    appMinLimitRemaining: parseIntHeader('X-AppMinLimit-Remaining'),
    rateLimitProblem: read('X-Rate-Limit-Problem'),
    retryAfterSeconds,
    correlationId: read('Xero-Correlation-Id'),
  };
}
