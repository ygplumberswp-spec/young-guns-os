import type { XeroOAuthService } from './xero-oauth.service.js';
import { XeroError } from '../lib/xero.client.js';
import {
  XeroRateBudgetError,
  type XeroRateBudgetService,
  type XeroRateBudgetStateSnapshot,
} from './xero-rate-budget.service.js';

export class XeroRateBudgetProviderProbeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'XeroRateBudgetProviderProbeError';
  }
}

export type XeroRateBudgetProviderProbeOutcome =
  | 'ELIGIBLE'
  | 'BLOCKED'
  | 'QUOTA_EXHAUSTED'
  | 'UNEXPECTED_ERROR';

export type XeroRateBudgetProviderProbeResult = {
  requestedAt: string;
  providerCallCount: 1;
  requestEndpoint: 'GET /Organisation';
  httpStatus: number;
  headers: {
    dayLimitRemaining: number | null;
    minLimitRemaining: number | null;
    appMinLimitRemaining: number | null;
    rateLimitProblem: string | null;
    retryAfter: string | null;
    correlationId: string | null;
    responseDate: string | null;
  };
  organisationName: string | null;
  outcome: XeroRateBudgetProviderProbeOutcome;
  outcomeLabel: string;
  state: XeroRateBudgetStateSnapshot | null;
};

const PAUSE_REASON = 'gate5b_waiting_for_daily_quota';

/**
 * XERO-002 — single-call Xero Organisation probe to refresh stale rate-budget evidence.
 * Read-only at Xero; only rate-budget headers are persisted via the normal onResponse path.
 */
export class XeroRateBudgetProviderProbeService {
  constructor(
    private readonly xeroOAuthService: XeroOAuthService,
    private readonly rateBudget: XeroRateBudgetService,
  ) {}

  async probeProvider(companyId: string): Promise<XeroRateBudgetProviderProbeResult> {
    const connection = await this.xeroOAuthService.getXeroConnection(companyId);
    const orgName = connection.organisationName ?? '';

    if (orgName !== 'Young Guns Plumbing') {
      throw new XeroRateBudgetProviderProbeError(
        'ORG_MISMATCH',
        'Connected organisation is not Young Guns Plumbing.',
      );
    }

    const requestedAt = new Date().toISOString();

    const runProbe = async (): Promise<XeroRateBudgetProviderProbeResult> => {
      const client = await this.xeroOAuthService.createClient(companyId);
      const probe = await client.probeOrganisationOnce();

      if (probe.providerCallCount !== 1) {
        throw new XeroRateBudgetProviderProbeError(
          'PROBE_SAFETY_VIOLATION',
          `Provider probe issued ${probe.providerCallCount} calls; maximum is 1.`,
        );
      }

      const state = await this.rateBudget.getState(companyId);
      const { outcome, outcomeLabel } = this.classifyOutcome(probe.httpStatus, probe.headers.dayLimitRemaining);

      if (outcome === 'BLOCKED' || outcome === 'QUOTA_EXHAUSTED') {
        await this.ensureQuotaPause(companyId);
      }

      return {
        requestedAt,
        providerCallCount: 1,
        requestEndpoint: probe.requestEndpoint,
        httpStatus: probe.httpStatus,
        headers: probe.headers,
        organisationName: probe.organisation?.name ?? orgName,
        outcome,
        outcomeLabel,
        state,
      };
    };

    try {
      return await this.rateBudget.executeWithBudget(companyId, 'owner_proof_read', runProbe);
    } catch (error) {
      if (error instanceof XeroRateBudgetError) {
        throw new XeroRateBudgetProviderProbeError(
          'BUDGET_EXHAUSTED',
          error.message,
        );
      }

      if (error instanceof XeroError) {
        await this.ensureQuotaPause(companyId);
        throw new XeroRateBudgetProviderProbeError(
          error.code === 'RATE_LIMIT'
            ? 'PROVIDER_RATE_LIMIT'
            : error.code === 'AUTH_FAILED'
              ? 'PROVIDER_AUTH_FAILED'
              : error.code === 'TIMEOUT' || error.code === 'NETWORK_ERROR'
                ? 'PROVIDER_UNAVAILABLE'
                : 'PROVIDER_ERROR',
          error.message,
        );
      }

      throw error;
    }
  }

  private classifyOutcome(
    httpStatus: number,
    dayLimitRemaining: number | null,
  ): { outcome: XeroRateBudgetProviderProbeOutcome; outcomeLabel: string } {
    if (httpStatus === 429) {
      return {
        outcome: 'BLOCKED',
        outcomeLabel: 'XERO-002 Gate 5B BLOCKED — provider quota still unavailable',
      };
    }

    if (httpStatus === 200 && dayLimitRemaining !== null && dayLimitRemaining > 0) {
      return {
        outcome: 'ELIGIBLE',
        outcomeLabel: 'XERO-002 Gate 5B ELIGIBLE — fresh provider quota confirmed',
      };
    }

    if (httpStatus === 200 && dayLimitRemaining === 0) {
      return {
        outcome: 'QUOTA_EXHAUSTED',
        outcomeLabel: 'XERO-002 Gate 5B BLOCKED — provider daily quota genuinely exhausted',
      };
    }

    return {
      outcome: 'UNEXPECTED_ERROR',
      outcomeLabel: `Unexpected provider response HTTP ${httpStatus}`,
    };
  }

  private async ensureQuotaPause(companyId: string): Promise<void> {
    const paused = await this.rateBudget.isSyncPaused(companyId);
    if (paused) return;

    await this.rateBudget.pauseTenantSync(companyId, PAUSE_REASON, {
      auditLabel: 'xero_sync_paused_after_quota_probe',
    });
  }
}
