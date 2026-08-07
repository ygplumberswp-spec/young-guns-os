/**
 * Department 21 — Plug-and-play onboarding orchestration.
 * Reuses company, team, SaaS plans, data-migration jobs, and integration connections.
 * No demo data. No parallel systems.
 */
import { and, desc, eq } from 'drizzle-orm';
import type {
  SaasOnboardingAdvanceInput,
  SaasOnboardingChecklist,
  SaasOnboardingCompanyDetailsInput,
  SaasOnboardingInviteInput,
  SaasOnboardingOperationsInput,
  SaasOnboardingSelectPlanInput,
  SaasOnboardingSkipIntegrationInput,
  SaasOnboardingState,
  SaasOnboardingStatus,
  SaasOnboardingStepId,
  SaasTradeType,
} from '@titan/shared';
import {
  computeOnboardingCompletionPercent,
  defaultOnboardingChecklist,
  SAAS_ONBOARDING_IMPORT_ENTITIES,
  SAAS_ONBOARDING_INTEGRATION_CATALOG,
  SAAS_ONBOARDING_STEPS,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  companies,
  dmImportJobs,
  integrationConnections,
  roles,
  saasBrandingProfiles,
  saasPlatformAudits,
  saasSubscriptions,
  saasTenantProfiles,
  users,
} from '@titan/db';
import type { CompanyService } from './company.service.js';
import type { TeamService } from './team.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import { EnterpriseSaasPlatformError } from './enterprise-saas-platform.service.js';
import { TeamError } from './team.service.js';

export class SaasOnboardingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SaasOnboardingError';
  }
}

type Scope = { companyId: string; userId: string };

type Deps = {
  db: DatabaseClient;
  companyService: CompanyService;
  teamService: TeamService;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
};

const TRIAL_DAYS = 14;

export class SaasOnboardingService {
  constructor(private readonly deps: Deps) {}

  /**
   * Ensure a customer SaaS profile exists for onboarding (idempotent).
   * Only for explicit new-customer enrollment (signup). Never creates demo data.
   * Trial entitlement only — not fake payment. Does NOT convert platform_owner / Young Guns.
   */
  async ensureCustomerEnrollment(scope: Scope): Promise<void> {
    if (await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(scope.companyId)) {
      return;
    }

    const existing = await this.deps.db.query.saasTenantProfiles.findFirst({
      where: eq(saasTenantProfiles.companyId, scope.companyId),
    });

    if (!existing) {
      const checklist = defaultOnboardingChecklist();
      await this.deps.db.insert(saasTenantProfiles).values({
        companyId: scope.companyId,
        tenantKind: 'customer',
        lifecycleStatus: 'active',
        provisionedAt: new Date(),
        onboardingStatus: 'in_progress',
        onboardingCurrentStep: 'company',
        onboardingChecklist: checklist,
        lastOnboardingActivityAt: new Date(),
      });
    } else if (existing.tenantKind === 'platform_owner') {
      return;
    } else if (
      !existing.onboardingChecklist ||
      Object.keys(existing.onboardingChecklist).length === 0
    ) {
      await this.deps.db
        .update(saasTenantProfiles)
        .set({
          onboardingChecklist: defaultOnboardingChecklist(),
          onboardingStatus:
            existing.onboardingStatus === 'not_started' ? 'in_progress' : existing.onboardingStatus,
          lastOnboardingActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(saasTenantProfiles.companyId, scope.companyId));
    }

    const branding = await this.deps.db.query.saasBrandingProfiles.findFirst({
      where: eq(saasBrandingProfiles.companyId, scope.companyId),
    });
    if (!branding) {
      const company = await this.deps.db.query.companies.findFirst({
        where: eq(companies.id, scope.companyId),
      });
      await this.deps.db.insert(saasBrandingProfiles).values({
        companyId: scope.companyId,
        companyDisplayName: company?.name ?? null,
      });
    }

    const subscription = await this.deps.db.query.saasSubscriptions.findFirst({
      where: eq(saasSubscriptions.companyId, scope.companyId),
    });
    if (!subscription) {
      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      await this.deps.db.insert(saasSubscriptions).values({
        companyId: scope.companyId,
        status: 'trial',
        trialEndsAt,
        currentPeriodStart: new Date(),
        currentPeriodEnd: trialEndsAt,
      });
    }
  }

  async getState(scope: Scope): Promise<SaasOnboardingState> {
    // Young Guns safety: do not auto-enroll tenants that lack a SaaS profile.
    // Enrollment happens only via signup (ensureCustomerEnrollment) or existing customer rows.
    if (await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(scope.companyId)) {
      throw new SaasOnboardingError(
        'FORBIDDEN',
        'Platform owner tenants do not use the SaaS customer onboarding wizard',
      );
    }
    const existingProfile = await this.deps.db.query.saasTenantProfiles.findFirst({
      where: eq(saasTenantProfiles.companyId, scope.companyId),
    });
    if (!existingProfile) {
      throw new SaasOnboardingError(
        'FORBIDDEN',
        'Onboarding wizard applies to new SaaS customer tenants only',
      );
    }
    if (
      !existingProfile.onboardingChecklist ||
      Object.keys(existingProfile.onboardingChecklist).length === 0
    ) {
      await this.deps.db
        .update(saasTenantProfiles)
        .set({
          onboardingChecklist: defaultOnboardingChecklist(),
          onboardingStatus:
            existingProfile.onboardingStatus === 'not_started'
              ? 'in_progress'
              : existingProfile.onboardingStatus,
          lastOnboardingActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(saasTenantProfiles.companyId, scope.companyId));
    }

    const profile = await this.deps.db.query.saasTenantProfiles.findFirst({
      where: eq(saasTenantProfiles.companyId, scope.companyId),
    });
    const company = await this.deps.db.query.companies.findFirst({
      where: eq(companies.id, scope.companyId),
    });
    const subscriptionView =
      await this.deps.enterpriseSaasPlatformService.getTenantSubscriptionView(scope.companyId);
    const seatStatus = await this.deps.enterpriseSaasPlatformService.getSeatStatus(scope.companyId);
    const members = await this.deps.db
      .select({ roleName: roles.name })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(eq(users.companyId, scope.companyId), eq(users.isActive, true)));

    let ownerCount = 0;
    let adminOfficeCount = 0;
    let technicianCount = 0;
    let clientCount = 0;
    for (const member of members) {
      if (member.roleName === 'Company Owner' || member.roleName === 'Owner') ownerCount += 1;
      else if (member.roleName === 'Technician') technicianCount += 1;
      else if (member.roleName === 'Client') clientCount += 1;
      else if (
        member.roleName === 'Manager' ||
        member.roleName === 'Dispatcher' ||
        member.roleName === 'Accountant' ||
        member.roleName === 'Admin' ||
        member.roleName === 'Office'
      ) {
        adminOfficeCount += 1;
      }
    }

    const checklist = normalizeChecklist(profile?.onboardingChecklist);
    const skipped = new Set(profile?.onboardingSkippedIntegrations ?? []);
    const connections = await this.deps.db.query.integrationConnections.findMany({
      where: eq(integrationConnections.companyId, scope.companyId),
    });
    const connectionByProvider = new Map(connections.map((row) => [row.provider, row]));

    const integrations = SAAS_ONBOARDING_INTEGRATION_CATALOG.map((item) => {
      if (skipped.has(item.providerKey)) {
        return {
          ...item,
          status: 'skipped' as const,
          unavailableReason: 'Skipped for now — can connect later from Integrations.',
        };
      }
      const conn = connectionByProvider.get(item.providerKey as never);
      if (!conn) {
        return { ...item, status: 'not_connected' as const, unavailableReason: null };
      }
      const status = mapIntegrationStatus(conn.status, Boolean(conn.lastError));
      return {
        ...item,
        status,
        unavailableReason: conn.lastError ?? null,
      };
    });

    const importJobs = await this.deps.db.query.dmImportJobs.findMany({
      where: eq(dmImportJobs.companyId, scope.companyId),
      orderBy: [desc(dmImportJobs.createdAt)],
      limit: 50,
    });

    const imports = SAAS_ONBOARDING_IMPORT_ENTITIES.map((entity) => {
      const latest = importJobs.find((job) => job.entityType === entity.entityType);
      return {
        ...entity,
        latestJobId: latest?.id ?? null,
        latestStatus: latest?.status ?? null,
        importedCount: latest?.importedCount ?? 0,
        failedCount: latest?.failedCount ?? 0,
        attentionCount: (latest?.failedCount ?? 0) + (latest?.skippedCount ?? 0),
      };
    });

    const prefs = (company?.preferences ?? {}) as Record<string, unknown>;
    const brandingConfigured = Boolean(
      prefs.logoFileId || prefs.brandPrimaryColor || prefs.tradingName || prefs.vatNumber,
    );
    const operationsConfigured = Boolean(
      prefs.timezone || prefs.operatingHours || prefs.currency,
    );

    const availablePlans = [
      ...(subscriptionView.plan ? [subscriptionView.plan] : []),
      ...subscriptionView.upgradePlans,
    ].filter(
      (plan, index, all) => plan.isActive && all.findIndex((entry) => entry.id === plan.id) === index,
    );

    const planBillingState =
      !subscriptionView.plan
        ? ('not_selected' as const)
        : subscriptionView.subscription?.status === 'trial' ||
            subscriptionView.subscription?.lastSuccessfulPaymentAt == null
          ? ('plan_selected_billing_setup_required' as const)
          : ('entitled' as const);

    const attentionRequired: string[] = [];
    if (checklist.company !== 'complete') attentionRequired.push('Complete company details');
    if (checklist.plan !== 'complete' && checklist.plan !== 'skipped') {
      attentionRequired.push('Select a TITAN plan');
    }
    if (planBillingState === 'plan_selected_billing_setup_required') {
      attentionRequired.push('Billing setup required — payment checkout is not complete');
    }
    if (seatStatus.overLimitState === 'action_required') {
      attentionRequired.push('Seat over-limit — adjust seats or upgrade');
    }
    for (const item of imports) {
      if ((item.attentionCount ?? 0) > 0) {
        attentionRequired.push(`${item.label}: ${item.attentionCount} record(s) need review`);
      }
    }

    const auraTips = buildAuraTips({
      imports,
      integrations,
      planBillingState,
      tradeType: (profile?.onboardingTradeType as SaasTradeType | null) ?? null,
    });

    const currentStep = (profile?.onboardingCurrentStep as SaasOnboardingStepId) || 'company';
    const status = (profile?.onboardingStatus as SaasOnboardingStatus) || 'in_progress';
    const completionPercent = computeOnboardingCompletionPercent(checklist);
    const reviewReady =
      (checklist.company === 'complete' || checklist.company === 'skipped') &&
      (checklist.plan === 'complete' || checklist.plan === 'skipped') &&
      (checklist.team === 'complete' || checklist.team === 'skipped');

    return {
      companyId: scope.companyId,
      companyName: company?.name ?? 'Your company',
      status,
      currentStep,
      checklist,
      completionPercent,
      lastActivityAt: profile?.lastOnboardingActivityAt?.toISOString() ?? null,
      tradeType: (profile?.onboardingTradeType as SaasTradeType | null) ?? null,
      plan: subscriptionView.plan,
      availablePlans,
      planBillingState,
      team: {
        ownerCount,
        adminOfficeCount,
        technicianCount,
        clientCount,
        seats: {
          adminOfficeUsed: seatStatus.usage.adminOfficeUsed,
          technicianUsed: seatStatus.usage.technicianUsed,
          totalUsed: seatStatus.usage.totalUsed,
          adminOfficeIncluded: seatStatus.adminOfficeIncluded,
          technicianIncluded: seatStatus.technicianIncluded,
        },
      },
      imports,
      integrations,
      operationsConfigured,
      brandingConfigured,
      reviewReady,
      attentionRequired,
      auraTips,
      platformMetadata: {
        createdAt: company?.createdAt.toISOString() ?? new Date().toISOString(),
        integrationsConnectedCount: integrations.filter((item) => item.status === 'connected')
          .length,
        importAttentionCount: imports.reduce((sum, item) => sum + (item.attentionCount ?? 0), 0),
      },
    };
  }

  async saveCompanyDetails(
    scope: Scope,
    input: SaasOnboardingCompanyDetailsInput,
  ): Promise<SaasOnboardingState> {
    await this.ensureCustomerEnrollment(scope);
    await this.deps.companyService.updateProfile(
      scope.companyId,
      {
        name: input.companyName,
        industry: input.tradeType ?? null,
        businessType: input.tradeType ?? null,
        preferences: {
          tradingName: input.tradingName ?? undefined,
          companyRegistrationNumber: input.registrationNumber ?? undefined,
          vatNumber: input.vatNumber ?? undefined,
          companyTelephone: input.mainPhone ?? undefined,
          companyEmail: input.mainEmail ?? undefined,
          website: input.website ?? undefined,
          timezone: input.timezone ?? undefined,
          currency: input.currency ?? undefined,
          physicalAddress: [
            input.addressLine1,
            input.addressLine2,
            input.city,
            input.region,
            input.postalCode,
            input.country,
          ]
            .filter(Boolean)
            .join(', '),
        },
      },
      { updatedByUserId: scope.userId },
    );

    if (input.logoUrl) {
      await this.deps.db
        .update(saasBrandingProfiles)
        .set({
          logoUrl: input.logoUrl,
          companyDisplayName: input.tradingName || input.companyName,
          updatedAt: new Date(),
        })
        .where(eq(saasBrandingProfiles.companyId, scope.companyId));
    }

    await this.patchOnboarding(scope, {
      tradeType: input.tradeType ?? null,
      checklistPatch: { company: 'complete' },
      currentStep: 'plan',
      status: 'in_progress',
    });
    await this.audit(scope, 'onboarding_company_saved', input.companyName);
    return this.getState(scope);
  }

  async selectPlan(
    scope: Scope,
    input: SaasOnboardingSelectPlanInput,
  ): Promise<SaasOnboardingState> {
    await this.ensureCustomerEnrollment(scope);
    try {
      // Assign plan via canonical service — does not invent paid-through / fake payment.
      await this.deps.enterpriseSaasPlatformService.upgradePlan(scope, { planId: input.planId });
    } catch (error) {
      if (error instanceof EnterpriseSaasPlatformError) {
        throw new SaasOnboardingError(error.code, error.message);
      }
      throw error;
    }

    await this.patchOnboarding(scope, {
      checklistPatch: { plan: 'complete' },
      currentStep: 'team',
      status: 'in_progress',
    });
    await this.audit(scope, 'onboarding_plan_selected', input.planId, {
      billingState: 'plan_selected_billing_setup_required',
      note: 'Checkout/payment-provider not completed — truthful billing setup required state.',
    });
    return this.getState(scope);
  }

  async inviteTeamMember(
    scope: Scope,
    input: SaasOnboardingInviteInput,
  ): Promise<SaasOnboardingState> {
    await this.ensureCustomerEnrollment(scope);
    try {
      await this.deps.teamService.createInvite(
        scope,
        input.email,
        input.roleId,
        input.payrollSetup ?? undefined,
      );
    } catch (error) {
      if (error instanceof TeamError) {
        throw new SaasOnboardingError(error.code, error.message);
      }
      throw error;
    }

    // Keep the user on Team so they can invite more seats; resume persists server-side.
    await this.patchOnboarding(scope, {
      checklistPatch: { team: 'in_progress' },
      currentStep: 'team',
      status: 'in_progress',
    });
    await this.audit(scope, 'onboarding_team_invite', input.email, {
      roleId: input.roleId,
      // Never log payroll amounts / salary figures.
      payrollSetupPresent: Boolean(input.payrollSetup),
    });
    return this.getState(scope);
  }

  async markImportStep(
    scope: Scope,
    mode: 'start_clean' | 'importing' | 'complete',
  ): Promise<SaasOnboardingState> {
    await this.ensureCustomerEnrollment(scope);
    if (mode === 'start_clean') {
      await this.patchOnboarding(scope, {
        checklistPatch: { import: 'skipped' },
        currentStep: 'integrations',
        status: 'in_progress',
      });
      await this.audit(scope, 'onboarding_import_start_clean', 'start_clean', {
        demoData: false,
      });
    } else if (mode === 'complete') {
      await this.patchOnboarding(scope, {
        checklistPatch: { import: 'complete' },
        currentStep: 'integrations',
        status: 'in_progress',
      });
      await this.audit(scope, 'onboarding_import_complete', 'import');
    } else {
      await this.patchOnboarding(scope, {
        checklistPatch: { import: 'in_progress' },
        currentStep: 'import',
        status: 'in_progress',
      });
    }
    return this.getState(scope);
  }

  async skipIntegration(
    scope: Scope,
    input: SaasOnboardingSkipIntegrationInput,
  ): Promise<SaasOnboardingState> {
    await this.ensureCustomerEnrollment(scope);
    const profile = await this.deps.db.query.saasTenantProfiles.findFirst({
      where: eq(saasTenantProfiles.companyId, scope.companyId),
    });
    const skipped = new Set(profile?.onboardingSkippedIntegrations ?? []);
    skipped.add(input.providerKey);
    await this.deps.db
      .update(saasTenantProfiles)
      .set({
        onboardingSkippedIntegrations: [...skipped],
        lastOnboardingActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(saasTenantProfiles.companyId, scope.companyId));
    await this.audit(scope, 'onboarding_integration_skipped', input.providerKey, {
      reason: input.reason ?? null,
    });
    return this.getState(scope);
  }

  async completeIntegrationsStep(scope: Scope): Promise<SaasOnboardingState> {
    await this.patchOnboarding(scope, {
      checklistPatch: { integrations: 'complete' },
      currentStep: 'operations',
      status: 'in_progress',
    });
    return this.getState(scope);
  }

  async saveOperations(
    scope: Scope,
    input: SaasOnboardingOperationsInput,
  ): Promise<SaasOnboardingState> {
    await this.ensureCustomerEnrollment(scope);
    const operatingHours =
      input.operatingHoursStart && input.operatingHoursEnd
        ? `${input.operatingHoursStart}–${input.operatingHoursEnd}`
        : undefined;
    const workingDaysNote =
      input.workingDays && input.workingDays.length > 0
        ? `Working days: ${input.workingDays.join(', ')}`
        : null;
    const startNote = input.technicianStandardStartTime
      ? `Technician standard start: ${input.technicianStandardStartTime}`
      : null;
    const vatNote =
      input.defaultVatEnabled == null
        ? null
        : `Default VAT: ${input.defaultVatEnabled ? 'enabled' : 'disabled'}`;
    const notes = [workingDaysNote, startNote, vatNote].filter(Boolean).join(' · ') || undefined;

    await this.deps.companyService.updateProfile(
      scope.companyId,
      {
        preferences: {
          timezone: input.timezone ?? undefined,
          currency: input.currency ?? undefined,
          operatingHours,
          notes,
        },
      },
      { updatedByUserId: scope.userId },
    );
    await this.patchOnboarding(scope, {
      checklistPatch: { operations: 'complete' },
      currentStep: 'review',
      status: 'in_progress',
    });
    await this.audit(scope, 'onboarding_operations_saved', 'operations');
    return this.getState(scope);
  }

  async advance(scope: Scope, input: SaasOnboardingAdvanceInput): Promise<SaasOnboardingState> {
    const patch: Partial<SaasOnboardingChecklist> = {};
    if (input.markComplete) patch[input.step] = 'complete';
    if (input.markSkipped) patch[input.step] = 'skipped';
    const order = SAAS_ONBOARDING_STEPS.find((step) => step.id === input.step)?.order ?? 1;
    const next = SAAS_ONBOARDING_STEPS.find((step) => step.order === order + 1)?.id ?? input.step;
    await this.patchOnboarding(scope, {
      checklistPatch: patch,
      currentStep: next,
      status: 'in_progress',
    });
    return this.getState(scope);
  }

  async activate(scope: Scope): Promise<SaasOnboardingState> {
    const state = await this.getState(scope);
    if (!state.reviewReady) {
      throw new SaasOnboardingError(
        'VALIDATION_ERROR',
        'Complete company, plan, and team steps before starting TITAN',
      );
    }
    await this.patchOnboarding(scope, {
      checklistPatch: { review: 'complete' },
      currentStep: 'review',
      status: state.attentionRequired.length > 0 ? 'needs_attention' : 'active',
      completed: true,
    });
    await this.audit(scope, 'onboarding_activated', 'start_using_titan', {
      attentionRequired: state.attentionRequired,
      demoData: false,
    });
    return this.getState(scope);
  }

  private async patchOnboarding(
    scope: Scope,
    input: {
      checklistPatch?: Partial<SaasOnboardingChecklist>;
      currentStep?: SaasOnboardingStepId;
      status?: SaasOnboardingStatus;
      tradeType?: SaasTradeType | null;
      completed?: boolean;
    },
  ) {
    const profile = await this.deps.db.query.saasTenantProfiles.findFirst({
      where: eq(saasTenantProfiles.companyId, scope.companyId),
    });
    const checklist = {
      ...normalizeChecklist(profile?.onboardingChecklist),
      ...(input.checklistPatch ?? {}),
    };
    await this.deps.db
      .update(saasTenantProfiles)
      .set({
        onboardingChecklist: checklist,
        onboardingCurrentStep: input.currentStep ?? profile?.onboardingCurrentStep ?? 'company',
        onboardingStatus: input.status ?? profile?.onboardingStatus ?? 'in_progress',
        onboardingTradeType:
          input.tradeType !== undefined ? input.tradeType : profile?.onboardingTradeType,
        lastOnboardingActivityAt: new Date(),
        onboardingCompletedAt: input.completed
          ? new Date()
          : profile?.onboardingCompletedAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(saasTenantProfiles.companyId, scope.companyId));
  }

  private async audit(
    scope: Scope,
    actionType: string,
    subject: string,
    details?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(saasPlatformAudits).values({
      companyId: scope.companyId,
      actionType,
      subject,
      details: details ? JSON.stringify(details) : null,
      performedByUserId: scope.userId,
    });
  }
}

function normalizeChecklist(raw: Record<string, string> | null | undefined): SaasOnboardingChecklist {
  const defaults = defaultOnboardingChecklist();
  if (!raw) return defaults;
  return {
    company: (raw.company as SaasOnboardingChecklist['company']) || defaults.company,
    plan: (raw.plan as SaasOnboardingChecklist['plan']) || defaults.plan,
    team: (raw.team as SaasOnboardingChecklist['team']) || defaults.team,
    import: (raw.import as SaasOnboardingChecklist['import']) || defaults.import,
    integrations:
      (raw.integrations as SaasOnboardingChecklist['integrations']) || defaults.integrations,
    operations: (raw.operations as SaasOnboardingChecklist['operations']) || defaults.operations,
    review: (raw.review as SaasOnboardingChecklist['review']) || defaults.review,
  };
}

function mapIntegrationStatus(
  status: string,
  hasError: boolean,
): SaasOnboardingState['integrations'][number]['status'] {
  if (hasError) return 'error';
  if (status === 'connected' || status === 'active') return 'connected';
  if (status === 'syncing') return 'syncing';
  if (status === 'error' || status === 'failed') return 'error';
  if (status === 'expired' || status === 'reauth_required') return 'authorisation_expired';
  if (status === 'action_required' || status === 'pending') return 'action_required';
  return 'not_connected';
}

function buildAuraTips(input: {
  imports: SaasOnboardingState['imports'];
  integrations: SaasOnboardingState['integrations'];
  planBillingState: SaasOnboardingState['planBillingState'];
  tradeType: SaasTradeType | null;
}): SaasOnboardingState['auraTips'] {
  const tips: SaasOnboardingState['auraTips'] = [];
  const customerImport = input.imports.find((item) => item.entityType === 'customer');
  if (customerImport?.latestStatus === 'validated' || customerImport?.latestStatus === 'preview_ready') {
    tips.push({
      id: 'customer_import_review',
      severity: 'info',
      message: `Your customer file has ${customerImport.importedCount ?? 0} imported so far with ${customerImport.attentionCount ?? 0} needing review. Confirm the preview before committing — TITAN will not invent missing fields.`,
    });
  }
  const inventory = input.imports.find((item) => item.entityType === 'inventory');
  if (inventory?.supported) {
    tips.push({
      id: 'inventory_physical_stock',
      severity: 'warning',
      message:
        'Inventory means real physical stock on hand. If your spreadsheet has costs but no quantity, TITAN can help with catalogue mapping later — it will not claim items are in stock without quantity.',
    });
  }
  const xero = input.integrations.find((item) => item.providerKey === 'xero');
  if (xero?.status === 'connected') {
    tips.push({
      id: 'xero_import_option',
      severity: 'info',
      message:
        'Xero is connected. You can sync customers and invoices from Xero instead of re-uploading the same spreadsheet — avoid duplicate records.',
    });
  }
  if (input.planBillingState === 'plan_selected_billing_setup_required') {
    tips.push({
      id: 'billing_setup_required',
      severity: 'warning',
      message:
        'Plan selected — billing setup required. TITAN will not fake payment success. Checkout arrives in a later SaaS Scaling item.',
    });
  }
  if (input.tradeType) {
    tips.push({
      id: 'trade_type',
      severity: 'info',
      message: `Trade type set to ${input.tradeType}. Core operations stay available — higher plans unlock more seats, automation, and analytics.`,
    });
  }
  return tips;
}
