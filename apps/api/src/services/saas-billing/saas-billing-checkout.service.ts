/**
 * SaaS checkout + verified billing lifecycle.
 * Amounts from canonical plan config. Browser redirect never activates access.
 * Young Guns invoice Yoco is intentionally not used here.
 */
import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateSaasCheckoutRequest,
  ManualSaasBillingActivationRequest,
  SaasBillingHistoryItem,
  SaasCheckoutSessionView,
  SaasCheckoutSummary,
  SaasOnboardingPlanBillingState,
  SaasSubscriptionPlanSummary,
} from '@titan/shared';
import {
  YOCO_SAAS_PROVIDER_CAPABILITY,
  assertClientCheckoutAmountMatches,
  buildSaasCheckoutSummary,
  mapCheckoutStatusToOnboardingBillingState,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  saasBillingProviderEvents,
  saasBillingRecords,
  saasCheckoutSessions,
  saasPlatformAudits,
  saasSubscriptionPlans,
  saasSubscriptions,
  saasTenantProfiles,
} from '@titan/db';
import type { EnterpriseSaasPlatformService } from '../enterprise-saas-platform.service.js';
import { EnterpriseSaasPlatformError } from '../enterprise-saas-platform.service.js';
import { YocoSaasBillingAdapter } from './yoco-saas-billing.adapter.js';
import { ManualSaasBillingAdapter } from './manual-saas-billing.adapter.js';
import type { SaasBillingNormalizedEvent, SaasBillingProvider } from './saas-billing-provider.js';

export class SaasBillingCheckoutError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SaasBillingCheckoutError';
  }
}

type Scope = { companyId: string; userId: string };

type Deps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  appUrl: string;
  /** Optional SaaS webhook secret — separate from Young Guns invoice Yoco. */
  saasBillingWebhookSecret?: string | null;
};

const CHECKOUT_TTL_MS = 60 * 60 * 1000;

export class SaasBillingCheckoutService {
  private readonly yocoAdapter = new YocoSaasBillingAdapter();
  private readonly manualAdapter = new ManualSaasBillingAdapter();

  constructor(private readonly deps: Deps) {}

  getProviderCapability() {
    return this.yocoAdapter.capability;
  }

  async previewCheckout(scope: Scope, input: CreateSaasCheckoutRequest): Promise<SaasCheckoutSummary> {
    await this.assertCustomerTenant(scope.companyId);
    const plan = await this.getActivePlan(input.planId);
    return buildSaasCheckoutSummary({
      plan,
      extraAdminOfficeSeats: input.extraAdminOfficeSeats,
      extraTechnicianSeats: input.extraTechnicianSeats,
      tax: { taxConfigured: false, taxEnabled: false, taxRateBps: null, taxLabel: null },
      providerCapability: this.yocoAdapter.capability,
    });
  }

  async createCheckoutSession(
    scope: Scope,
    input: CreateSaasCheckoutRequest,
  ): Promise<SaasCheckoutSessionView> {
    await this.assertCustomerTenant(scope.companyId);
    const plan = await this.getActivePlan(input.planId);

    let summary: SaasCheckoutSummary;
    try {
      summary = buildSaasCheckoutSummary({
        plan,
        extraAdminOfficeSeats: input.extraAdminOfficeSeats,
        extraTechnicianSeats: input.extraTechnicianSeats,
        tax: { taxConfigured: false, taxEnabled: false, taxRateBps: null, taxLabel: null },
        providerCapability: this.yocoAdapter.capability,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Checkout calculation failed';
      if (message.startsWith('CONTACT_OR_UPGRADE_REQUIRED')) {
        throw new SaasBillingCheckoutError('CONTACT_OR_UPGRADE_REQUIRED', message);
      }
      throw error;
    }

    const tamper = assertClientCheckoutAmountMatches(
      input.clientQuotedTotalCents,
      summary.amounts.totalCents,
    );
    if (!tamper.ok) {
      throw new SaasBillingCheckoutError(
        'AMOUNT_TAMPER_REJECTED',
        'Checkout amount must come from server plan configuration — client amount rejected',
      );
    }

    if (summary.contactSalesRequired) {
      const [row] = await this.deps.db
        .insert(saasCheckoutSessions)
        .values({
          companyId: scope.companyId,
          planId: plan.id,
          status: 'provider_unavailable',
          provider: 'manual',
          currency: summary.amounts.currency,
          subtotalCents: summary.amounts.subtotalCents,
          taxCents: summary.amounts.taxCents,
          totalCents: summary.amounts.totalCents,
          extraSeats: summary.extraSeats,
          summary: summary as unknown as Record<string, unknown>,
          clientQuotedTotalCents: input.clientQuotedTotalCents ?? null,
          attentionMessage:
            'CONTACT SALES / MANUAL COMMERCIAL AGREEMENT — Enterprise or zero-priced plans are not self-serve card checkout.',
          createdByUserId: scope.userId,
          expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
        })
        .returning();
      await this.audit(scope, 'checkout_initiated', row!.id, {
        planId: plan.id,
        totalCents: summary.amounts.totalCents,
        currency: summary.amounts.currency,
        contactSalesRequired: true,
      });
      return this.toSessionView(row!);
    }

    // Assign plan selection (entitlements) without inventing paid-through / fake payment.
    try {
      await this.deps.enterpriseSaasPlatformService.upgradePlan(scope, { planId: plan.id });
    } catch (error) {
      if (error instanceof EnterpriseSaasPlatformError) {
        throw new SaasBillingCheckoutError(error.code, error.message);
      }
      throw error;
    }

    const [session] = await this.deps.db
      .insert(saasCheckoutSessions)
      .values({
        companyId: scope.companyId,
        planId: plan.id,
        status: 'created',
        provider: 'yoco_saas',
        currency: summary.amounts.currency,
        subtotalCents: summary.amounts.subtotalCents,
        taxCents: summary.amounts.taxCents,
        totalCents: summary.amounts.totalCents,
        extraSeats: summary.extraSeats,
        summary: summary as unknown as Record<string, unknown>,
        clientQuotedTotalCents: input.clientQuotedTotalCents ?? null,
        createdByUserId: scope.userId,
        expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
      })
      .returning();

    const providerResult = await this.yocoAdapter.createCheckoutSession({
      companyId: scope.companyId,
      checkoutSessionId: session!.id,
      summary,
      successUrl: `${this.deps.appUrl}/settings/billing?checkout=${session!.id}&result=return`,
      cancelUrl: `${this.deps.appUrl}/settings/billing?checkout=${session!.id}&result=cancelled`,
    });

    if (!providerResult.ok) {
      const [updated] = await this.deps.db
        .update(saasCheckoutSessions)
        .set({
          status: 'provider_unavailable',
          attentionMessage: providerResult.message,
          updatedAt: new Date(),
        })
        .where(eq(saasCheckoutSessions.id, session!.id))
        .returning();
      await this.audit(scope, 'checkout_initiated', session!.id, {
        planId: plan.id,
        totalCents: summary.amounts.totalCents,
        currency: summary.amounts.currency,
        providerCapabilityRequired: true,
        missingCapabilities: providerResult.missingCapabilities,
      });
      return this.toSessionView(updated!);
    }

    const [updated] = await this.deps.db
      .update(saasCheckoutSessions)
      .set({
        status: 'awaiting_provider',
        providerSessionRef: providerResult.providerSessionRef,
        providerCheckoutUrl: providerResult.checkoutUrl,
        updatedAt: new Date(),
      })
      .where(eq(saasCheckoutSessions.id, session!.id))
      .returning();

    await this.audit(scope, 'checkout_initiated', session!.id, {
      planId: plan.id,
      totalCents: summary.amounts.totalCents,
      currency: summary.amounts.currency,
      providerSessionRef: providerResult.providerSessionRef,
    });
    return this.toSessionView(updated!);
  }

  async getCheckoutSession(scope: Scope, sessionId: string): Promise<SaasCheckoutSessionView> {
    const row = await this.deps.db.query.saasCheckoutSessions.findFirst({
      where: and(
        eq(saasCheckoutSessions.id, sessionId),
        eq(saasCheckoutSessions.companyId, scope.companyId),
      ),
    });
    if (!row) {
      throw new SaasBillingCheckoutError('NOT_FOUND', 'Checkout session not found');
    }
    // Browser return → verifying until provider truth confirms. Never activate here.
    if (row.status === 'awaiting_provider') {
      const [updated] = await this.deps.db
        .update(saasCheckoutSessions)
        .set({
          status: 'verifying',
          attentionMessage: 'PAYMENT VERIFICATION IN PROGRESS — waiting for provider confirmation',
          updatedAt: new Date(),
        })
        .where(eq(saasCheckoutSessions.id, row.id))
        .returning();
      return this.toSessionView(updated!);
    }
    return this.toSessionView(row);
  }

  async markBrowserReturn(scope: Scope, sessionId: string): Promise<SaasCheckoutSessionView> {
    const row = await this.deps.db.query.saasCheckoutSessions.findFirst({
      where: and(
        eq(saasCheckoutSessions.id, sessionId),
        eq(saasCheckoutSessions.companyId, scope.companyId),
      ),
    });
    if (!row) {
      throw new SaasBillingCheckoutError('NOT_FOUND', 'Checkout session not found');
    }
    if (row.status === 'completed' || row.status === 'failed' || row.status === 'cancelled') {
      return this.toSessionView(row);
    }
    if (row.status === 'provider_unavailable') {
      return this.toSessionView(row);
    }
    const [updated] = await this.deps.db
      .update(saasCheckoutSessions)
      .set({
        status: 'verifying',
        attentionMessage:
          'PAYMENT VERIFICATION IN PROGRESS — browser return alone does not activate TITAN',
        updatedAt: new Date(),
      })
      .where(eq(saasCheckoutSessions.id, row.id))
      .returning();
    await this.audit(scope, 'checkout_browser_return', sessionId, {
      note: 'Awaiting provider webhook / verification',
    });
    return this.toSessionView(updated!);
  }

  async cancelCheckout(scope: Scope, sessionId: string): Promise<SaasCheckoutSessionView> {
    const row = await this.deps.db.query.saasCheckoutSessions.findFirst({
      where: and(
        eq(saasCheckoutSessions.id, sessionId),
        eq(saasCheckoutSessions.companyId, scope.companyId),
      ),
    });
    if (!row) throw new SaasBillingCheckoutError('NOT_FOUND', 'Checkout session not found');
    if (row.status === 'completed') {
      throw new SaasBillingCheckoutError('VALIDATION_ERROR', 'Completed checkout cannot be cancelled');
    }
    const [updated] = await this.deps.db
      .update(saasCheckoutSessions)
      .set({
        status: 'cancelled',
        attentionMessage: 'Checkout cancelled — plan selection preserved; billing still required',
        updatedAt: new Date(),
      })
      .where(eq(saasCheckoutSessions.id, row.id))
      .returning();
    await this.audit(scope, 'checkout_cancelled', sessionId, {});
    return this.toSessionView(updated!);
  }

  async listBillingHistory(scope: Scope): Promise<SaasBillingHistoryItem[]> {
    await this.assertCustomerTenant(scope.companyId);
    const rows = await this.deps.db.query.saasBillingRecords.findMany({
      where: eq(saasBillingRecords.companyId, scope.companyId),
      orderBy: [desc(saasBillingRecords.issuedAt)],
      limit: 100,
    });
    return rows.map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const taxCents = typeof meta.taxCents === 'number' ? meta.taxCents : null;
      const totalCents =
        typeof meta.totalCents === 'number' ? meta.totalCents : row.amountCents + (taxCents ?? 0);
      return {
        id: row.id,
        recordType: row.recordType,
        status: row.status,
        amountCents: row.amountCents,
        taxCents,
        totalCents,
        currency: row.currency,
        description: row.description,
        reference:
          typeof meta.paymentProviderRef === 'string'
            ? meta.paymentProviderRef
            : typeof meta.externalReference === 'string'
              ? meta.externalReference
              : null,
        periodStart: typeof meta.periodStart === 'string' ? meta.periodStart : null,
        periodEnd:
          typeof meta.paidThroughAt === 'string'
            ? meta.paidThroughAt
            : typeof meta.periodEnd === 'string'
              ? meta.periodEnd
              : null,
        issuedAt: row.issuedAt.toISOString(),
        receiptUrl: typeof meta.receiptUrl === 'string' ? meta.receiptUrl : null,
      };
    });
  }

  async requestCancelAtPeriodEnd(scope: Scope): Promise<{ cancelAtPeriodEnd: boolean; paidThroughAt: string | null }> {
    await this.assertCustomerTenant(scope.companyId);
    const subscription = await this.deps.db.query.saasSubscriptions.findFirst({
      where: eq(saasSubscriptions.companyId, scope.companyId),
    });
    if (!subscription) {
      throw new SaasBillingCheckoutError('NOT_FOUND', 'Subscription not found');
    }
    await this.deps.db
      .update(saasSubscriptions)
      .set({
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(eq(saasSubscriptions.companyId, scope.companyId));
    await this.audit(scope, 'subscription_cancel_at_period_end', scope.companyId, {
      paidThroughAt: subscription.currentPeriodEnd?.toISOString() ?? null,
    });
    return {
      cancelAtPeriodEnd: true,
      paidThroughAt: subscription.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  /**
   * Platform Owner manual activation with evidence — never tenant self-mark PAID.
   */
  async activateManualBilling(
    scope: Scope,
    input: ManualSaasBillingActivationRequest,
  ): Promise<{ companyId: string; paidThroughAt: string }> {
    if (!(await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(scope.companyId))) {
      throw new SaasBillingCheckoutError('FORBIDDEN', 'Only Platform Owner may activate manual billing');
    }
    if (await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(input.targetCompanyId)) {
      throw new SaasBillingCheckoutError('FORBIDDEN', 'Cannot apply SaaS billing to platform owner tenant');
    }
    if (!input.externalReference.trim()) {
      throw new SaasBillingCheckoutError('VALIDATION_ERROR', 'externalReference evidence is required');
    }
    if (input.amountCents < 0) {
      throw new SaasBillingCheckoutError('VALIDATION_ERROR', 'amountCents must be >= 0');
    }

    const plan = await this.getActivePlan(input.planId);
    await this.deps.enterpriseSaasPlatformService.assignPlanToTenant(
      scope,
      input.targetCompanyId,
      { planId: plan.id, reason: `Manual billing: ${input.method}` },
    );

    const providerRef = `manual:${input.externalReference.trim()}`;
    await this.applyVerifiedPayment({
      companyId: input.targetCompanyId,
      actorCompanyId: scope.companyId,
      actorUserId: scope.userId,
      source: 'manual_platform_owner',
      planId: plan.id,
      amountCents: input.amountCents,
      currency: input.currency.toUpperCase(),
      paidThroughAt: input.paidThroughAt,
      paymentProviderRef: providerRef,
      provider: 'manual',
      providerCustomerRef: null,
      providerSubscriptionRef: null,
      paymentMethodLabel: `Manual ${input.method}`,
      taxCents: 0,
      metadata: {
        method: input.method,
        externalReference: input.externalReference.trim(),
        notes: input.notes ?? null,
        periodStart: input.periodStartAt ?? null,
        authorisedVerifierUserId: scope.userId,
      },
    });

    return { companyId: input.targetCompanyId, paidThroughAt: input.paidThroughAt };
  }

  async processProviderWebhook(input: {
    providerKey: string;
    rawBody: string;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<{ accepted: boolean; duplicate?: boolean; result: string }> {
    const provider = this.resolveProvider(input.providerKey);
    const secret = this.deps.saasBillingWebhookSecret?.trim();
    if (!secret) {
      throw new SaasBillingCheckoutError(
        'PROVIDER_CAPABILITY_REQUIRED',
        'SaaS billing webhook secret is not configured',
      );
    }
    const verified = provider.verifyWebhookSignature({
      rawBody: input.rawBody,
      headers: input.headers,
      webhookSecret: secret,
    });
    if (!verified.ok) {
      throw new SaasBillingCheckoutError('INVALID_SIGNATURE', 'Invalid SaaS billing webhook signature');
    }

    const event = provider.parseWebhookEvent(input.rawBody);
    if (!event) {
      throw new SaasBillingCheckoutError('VALIDATION_ERROR', 'Unrecognised SaaS billing webhook payload');
    }

    const existing = await this.deps.db.query.saasBillingProviderEvents.findFirst({
      where: and(
        eq(saasBillingProviderEvents.provider, provider.capability.providerKey),
        eq(saasBillingProviderEvents.providerEventId, event.providerEventId),
      ),
    });
    if (existing?.processingResult === 'applied' || existing?.processingResult === 'ignored_duplicate') {
      return { accepted: true, duplicate: true, result: 'ignored_duplicate' };
    }

    const fingerprint = createHash('sha256').update(input.rawBody).digest('hex').slice(0, 32);
    let storedId: string | null = null;
    try {
      const [stored] = await this.deps.db
        .insert(saasBillingProviderEvents)
        .values({
          companyId: null,
          provider: provider.capability.providerKey,
          providerEventId: event.providerEventId,
          eventType: event.providerEventType,
          canonicalType: event.canonicalType,
          providerSessionRef: event.providerSessionRef,
          providerPaymentRef: event.providerPaymentRef,
          providerSubscriptionRef: event.providerSubscriptionRef,
          amountCents: event.amountCents,
          currency: event.currency,
          occurredAt: event.occurredAt ? new Date(event.occurredAt) : null,
          payloadFingerprint: fingerprint,
          safeMetadata: event.safeMetadata,
        })
        .returning();
      storedId = stored?.id ?? null;
    } catch {
      return { accepted: true, duplicate: true, result: 'ignored_duplicate' };
    }
    if (!storedId) {
      return { accepted: true, duplicate: true, result: 'ignored_duplicate' };
    }

    const session = event.providerSessionRef
      ? await this.deps.db.query.saasCheckoutSessions.findFirst({
          where: eq(saasCheckoutSessions.providerSessionRef, event.providerSessionRef),
        })
      : null;

    // Never trust unverified companyId hint alone.
    const companyId = session?.companyId ?? null;
    if (!companyId) {
      await this.deps.db
        .update(saasBillingProviderEvents)
        .set({
          processingResult: 'unmatched_session',
          processedAt: new Date(),
        })
        .where(
          and(
            eq(saasBillingProviderEvents.provider, provider.capability.providerKey),
            eq(saasBillingProviderEvents.providerEventId, event.providerEventId),
          ),
        );
      return { accepted: true, result: 'unmatched_session' };
    }

    await this.deps.db
      .update(saasBillingProviderEvents)
      .set({ companyId })
      .where(
        and(
          eq(saasBillingProviderEvents.provider, provider.capability.providerKey),
          eq(saasBillingProviderEvents.providerEventId, event.providerEventId),
        ),
      );

    const result = await this.applyNormalizedEvent({
      companyId,
      event,
      sessionId: session?.id ?? null,
      providerKey: provider.capability.providerKey,
      sessionTotalCents: session?.totalCents ?? null,
      sessionCurrency: session?.currency ?? null,
      planId: session?.planId ?? null,
    });

    await this.deps.db
      .update(saasBillingProviderEvents)
      .set({
        processingResult: result,
        processedAt: new Date(),
      })
      .where(
        and(
          eq(saasBillingProviderEvents.provider, provider.capability.providerKey),
          eq(saasBillingProviderEvents.providerEventId, event.providerEventId),
        ),
      );

    return { accepted: true, result };
  }

  async resolveOnboardingBillingState(companyId: string): Promise<SaasOnboardingPlanBillingState> {
    const subscription = await this.deps.db.query.saasSubscriptions.findFirst({
      where: eq(saasSubscriptions.companyId, companyId),
    });
    const entitled = Boolean(
      subscription?.lastSuccessfulPaymentAt && subscription.status === 'active',
    );
    const latest = await this.deps.db.query.saasCheckoutSessions.findFirst({
      where: eq(saasCheckoutSessions.companyId, companyId),
      orderBy: [desc(saasCheckoutSessions.createdAt)],
    });
    return mapCheckoutStatusToOnboardingBillingState(
      (latest?.status as SaasCheckoutSessionView['status'] | undefined) ?? null,
      entitled,
    );
  }

  private async applyNormalizedEvent(input: {
    companyId: string;
    event: SaasBillingNormalizedEvent;
    sessionId: string | null;
    providerKey: string;
    sessionTotalCents: number | null;
    sessionCurrency: string | null;
    planId: string | null;
  }): Promise<string> {
    if (
      input.event.canonicalType === 'payment_failed' ||
      input.event.canonicalType === 'checkout_cancelled'
    ) {
      if (input.sessionId) {
        await this.deps.db
          .update(saasCheckoutSessions)
          .set({
            status: input.event.canonicalType === 'checkout_cancelled' ? 'cancelled' : 'failed',
            attentionMessage: 'PAYMENT REQUIRES ATTENTION',
            updatedAt: new Date(),
          })
          .where(eq(saasCheckoutSessions.id, input.sessionId));
      }
      // System failure recording without inventing paid-through changes.
      await this.applyVerifiedPaymentFailure({
        companyId: input.companyId,
        paymentProviderRef: input.event.providerPaymentRef ?? input.event.providerEventId,
        reason: input.event.canonicalType,
        provider: input.providerKey,
      });
      return 'applied_failure';
    }

    if (
      input.event.canonicalType === 'payment_succeeded' ||
      input.event.canonicalType === 'checkout_completed' ||
      input.event.canonicalType === 'subscription_active'
    ) {
      if (!input.event.paidThroughAt) {
        // Out-of-order / incomplete provider truth — do not invent +30 days.
        if (input.sessionId) {
          await this.deps.db
            .update(saasCheckoutSessions)
            .set({
              status: 'verifying',
              attentionMessage:
                'Provider event received without paid-through period — awaiting authoritative entitlement dates',
              updatedAt: new Date(),
            })
            .where(eq(saasCheckoutSessions.id, input.sessionId));
        }
        return 'awaiting_period_truth';
      }

      // Prefer session server amount over provider amount when both present and mismatch → flag.
      const amountCents = input.sessionTotalCents ?? input.event.amountCents ?? 0;
      if (
        input.sessionTotalCents != null &&
        input.event.amountCents != null &&
        input.sessionTotalCents !== input.event.amountCents
      ) {
        // Still apply if provider paid-through is present, but audit mismatch.
        await this.auditSystem(input.companyId, 'billing_amount_mismatch', input.event.providerEventId, {
          sessionTotalCents: input.sessionTotalCents,
          providerAmountCents: input.event.amountCents,
        });
      }

      await this.applyVerifiedPayment({
        companyId: input.companyId,
        actorCompanyId: input.companyId,
        actorUserId: null,
        source: 'provider_webhook',
        planId: input.planId,
        amountCents,
        currency: (input.sessionCurrency ?? input.event.currency ?? 'ZAR').toUpperCase(),
        paidThroughAt: input.event.paidThroughAt,
        paymentProviderRef: input.event.providerPaymentRef ?? input.event.providerEventId,
        provider: input.providerKey,
        providerCustomerRef: input.event.providerCustomerRef,
        providerSubscriptionRef: input.event.providerSubscriptionRef,
        paymentMethodLabel: input.event.paymentMethodLabel,
        taxCents: 0,
        metadata: {
          providerEventId: input.event.providerEventId,
          canonicalType: input.event.canonicalType,
        },
      });

      if (input.sessionId) {
        await this.deps.db
          .update(saasCheckoutSessions)
          .set({
            status: 'completed',
            attentionMessage: null,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(saasCheckoutSessions.id, input.sessionId));
      }
      return 'applied';
    }

    if (input.event.canonicalType === 'payment_disputed' || input.event.canonicalType === 'refund') {
      await this.auditSystem(input.companyId, input.event.canonicalType, input.event.providerEventId, {
        flaggedForPlatformOwnerReview: true,
      });
      return 'flagged_for_review';
    }

    // subscription_updated / out-of-order — store only; reconcile when payment truth arrives.
    return 'recorded_pending_reconcile';
  }

  /**
   * Internal verified payment application — webhook/manual only.
   * Does not invent paid-through. Idempotent on paymentProviderRef.
   */
  async applyVerifiedPayment(input: {
    companyId: string;
    actorCompanyId: string;
    actorUserId: string | null;
    source: 'provider_webhook' | 'manual_platform_owner';
    planId: string | null;
    amountCents: number;
    currency: string;
    paidThroughAt: string;
    paymentProviderRef: string;
    provider: string;
    providerCustomerRef: string | null;
    providerSubscriptionRef: string | null;
    paymentMethodLabel: string | null;
    taxCents: number;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const paidThroughAt = new Date(input.paidThroughAt);
    if (!Number.isFinite(paidThroughAt.getTime())) {
      throw new SaasBillingCheckoutError('VALIDATION_ERROR', 'paidThroughAt must be a valid timestamp');
    }
    if (paidThroughAt.getTime() <= Date.now()) {
      throw new SaasBillingCheckoutError(
        'VALIDATION_ERROR',
        'paidThroughAt must be in the future — refuse invented or expired entitlements',
      );
    }

    const subscription = await this.deps.db.query.saasSubscriptions.findFirst({
      where: eq(saasSubscriptions.companyId, input.companyId),
    });
    if (!subscription) {
      throw new SaasBillingCheckoutError('NOT_FOUND', 'Subscription not found');
    }

    if (
      subscription.paymentProviderRef === input.paymentProviderRef &&
      subscription.lastSuccessfulPaymentAt &&
      subscription.status === 'active' &&
      subscription.currentPeriodEnd &&
      Math.abs(subscription.currentPeriodEnd.getTime() - paidThroughAt.getTime()) < 1000
    ) {
      return;
    }

    const paidAt = new Date();
    await this.deps.db
      .update(saasSubscriptions)
      .set({
        status: 'active',
        currentPeriodStart: paidAt,
        currentPeriodEnd: paidThroughAt,
        lastSuccessfulPaymentAt: paidAt,
        lastPaymentFailedAt: null,
        lastPaymentFailureReason: null,
        paymentProviderRef: input.paymentProviderRef,
        paymentProvider: input.provider,
        providerCustomerRef: input.providerCustomerRef,
        providerSubscriptionRef: input.providerSubscriptionRef,
        paymentMethodLabel: input.paymentMethodLabel,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        planId: input.planId ?? subscription.planId,
        updatedAt: paidAt,
      })
      .where(eq(saasSubscriptions.companyId, input.companyId));

    await this.deps.db.insert(saasBillingRecords).values({
      companyId: input.companyId,
      subscriptionId: subscription.id,
      recordType: 'payment',
      status: 'paid',
      amountCents: input.amountCents,
      currency: input.currency,
      description: `SaaS subscription payment (${input.source})`,
      metadata: {
        ...input.metadata,
        paymentProviderRef: input.paymentProviderRef,
        paidThroughAt: paidThroughAt.toISOString(),
        taxCents: input.taxCents,
        totalCents: input.amountCents + input.taxCents,
        source: input.source,
      },
    });

    await this.deps.db
      .update(saasTenantProfiles)
      .set({
        lifecycleStatus: 'active',
        suspendedAt: null,
        cancelledAt: null,
        suspensionReason: null,
        lastAccessAction: 'payment_succeeded',
        lastAccessActionAt: paidAt,
        updatedAt: paidAt,
      })
      .where(eq(saasTenantProfiles.companyId, input.companyId));

    await this.deps.db.insert(saasPlatformAudits).values({
      companyId: input.actorCompanyId,
      actionType: 'payment_confirmed',
      subject: input.companyId,
      details: JSON.stringify({
        source: input.source,
        provider: input.provider,
        paymentProviderRef: input.paymentProviderRef,
        paidThroughAt: paidThroughAt.toISOString(),
        amountCents: input.amountCents,
        currency: input.currency,
        // No secrets.
      }),
      performedByUserId: input.actorUserId,
    });

    await this.deps.enterpriseSaasPlatformService.syncAccessFromEntitlement(input.companyId);
  }

  private async applyVerifiedPaymentFailure(input: {
    companyId: string;
    paymentProviderRef: string;
    reason: string;
    provider: string;
  }) {
    const subscription = await this.deps.db.query.saasSubscriptions.findFirst({
      where: eq(saasSubscriptions.companyId, input.companyId),
    });
    if (!subscription) return;
    if (
      subscription.paymentProviderRef === input.paymentProviderRef &&
      subscription.lastPaymentFailedAt
    ) {
      return;
    }
    const failedAt = new Date();
    await this.deps.db
      .update(saasSubscriptions)
      .set({
        status: 'grace_period',
        lastPaymentFailedAt: failedAt,
        lastPaymentFailureReason: input.reason,
        paymentProviderRef: input.paymentProviderRef,
        paymentProvider: input.provider,
        // CRITICAL: do not change currentPeriodEnd
        updatedAt: failedAt,
      })
      .where(eq(saasSubscriptions.companyId, input.companyId));

    await this.deps.db.insert(saasBillingRecords).values({
      companyId: input.companyId,
      subscriptionId: subscription.id,
      recordType: 'renewal',
      status: 'failed',
      amountCents: 0,
      description: 'SaaS subscription payment failed',
      metadata: {
        paymentProviderRef: input.paymentProviderRef,
        paidThroughPreserved: subscription.currentPeriodEnd?.toISOString() ?? null,
      },
    });

    await this.deps.enterpriseSaasPlatformService.syncAccessFromEntitlement(input.companyId);
  }

  private resolveProvider(providerKey: string): SaasBillingProvider {
    if (providerKey === 'yoco_saas' || providerKey === 'yoco') return this.yocoAdapter;
    if (providerKey === 'manual') return this.manualAdapter;
    throw new SaasBillingCheckoutError('NOT_FOUND', `Unknown SaaS billing provider: ${providerKey}`);
  }

  private async getActivePlan(planId: string) {
    const plan = await this.deps.db.query.saasSubscriptionPlans.findFirst({
      where: eq(saasSubscriptionPlans.id, planId),
    });
    if (!plan || !plan.isActive) {
      throw new SaasBillingCheckoutError('NOT_FOUND', 'Subscription plan not found');
    }
    return {
      id: plan.id,
      planKey: plan.planKey,
      name: plan.name,
      description: plan.description,
      tier: plan.tier,
      priceCents: plan.priceCents,
      billingInterval: plan.billingInterval,
      features: plan.features ?? [],
      limits: plan.limits,
      isActive: plan.isActive,
      currency: plan.currency ?? 'ZAR',
      pricingConfigurable: plan.pricingConfigurable ?? true,
      commercialConfig: (plan.commercialConfig as SaasSubscriptionPlanSummary['commercialConfig']) ?? null,
    };
  }

  private async assertCustomerTenant(companyId: string) {
    if (await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId)) {
      throw new SaasBillingCheckoutError(
        'FORBIDDEN',
        'Platform owner tenants do not use customer SaaS checkout',
      );
    }
    const profile = await this.deps.db.query.saasTenantProfiles.findFirst({
      where: eq(saasTenantProfiles.companyId, companyId),
    });
    if (!profile) {
      throw new SaasBillingCheckoutError(
        'FORBIDDEN',
        'SaaS checkout applies to enrolled customer tenants only',
      );
    }
  }

  private toSessionView(row: typeof saasCheckoutSessions.$inferSelect): SaasCheckoutSessionView {
    const summary = row.summary as unknown as SaasCheckoutSummary;
    const status = row.status as SaasCheckoutSessionView['status'];
    let browserReturnState: SaasCheckoutSessionView['browserReturnState'] = null;
    if (status === 'verifying' || status === 'awaiting_provider') {
      browserReturnState = 'payment_verification_in_progress';
    } else if (status === 'provider_unavailable') {
      browserReturnState = 'provider_unavailable';
    } else if (status === 'cancelled') {
      browserReturnState = 'cancelled';
    }
    return {
      id: row.id,
      companyId: row.companyId,
      status,
      summary: summary?.planId
        ? summary
        : buildSaasCheckoutSummary({
            plan: {
              id: row.planId ?? '',
              planKey: 'unknown',
              name: 'Plan',
              description: '',
              tier: 'starter',
              priceCents: row.totalCents,
              billingInterval: 'monthly',
              features: [],
              limits: {},
              isActive: true,
              currency: row.currency,
            },
            providerCapability: YOCO_SAAS_PROVIDER_CAPABILITY,
          }),
      browserReturnState,
      providerCheckoutUrl: row.providerCheckoutUrl,
      providerSessionRef: row.providerSessionRef,
      attentionMessage: row.attentionMessage,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
    };
  }

  private async audit(
    scope: Scope,
    actionType: string,
    subject: string,
    details: Record<string, unknown>,
  ) {
    await this.deps.db.insert(saasPlatformAudits).values({
      companyId: scope.companyId,
      actionType,
      subject,
      details: JSON.stringify(details),
      performedByUserId: scope.userId,
    });
  }

  private async auditSystem(
    companyId: string,
    actionType: string,
    subject: string,
    details: Record<string, unknown>,
  ) {
    await this.deps.db.insert(saasPlatformAudits).values({
      companyId,
      actionType,
      subject,
      details: JSON.stringify(details),
      performedByUserId: null,
    });
  }
}
