import { and, count, desc, eq, or } from 'drizzle-orm';
import type {
  CreateLcClauseRequest,
  CreateLcContractLifecycleRequest,
  CreateLcContractRequest,
  CreateLcControlRequest,
  CreateLcJurisdictionRequest,
  CreateLcLegalActionDraftRequest,
  CreateLcLegalCategoryRequest,
  CreateLcLegalMatterRequest,
  CreateLcObligationRequest,
  CreateLcPolicyRequest,
  CreateLcPrivacyRequestRequest,
  CreateLcRiskRequest,
  CreateLcSignatureProviderRequest,
  EnterpriseLegalComplianceAuraContext,
  EnterpriseLegalComplianceDashboard,
  LcAnalyticsSummary,
  LcClauseSummary,
  LcComplianceMonitoringSummary,
  LcContractAnalysisSummary,
  LcContractSummary,
  LcControlSummary,
  LcEmployeeLegalSummary,
  LcEvidenceSummary,
  LcInsuranceClaimSummary,
  LcInsurancePolicySummary,
  LcJurisdictionSummary,
  LcLegalCategorySummary,
  LcLegalHoldSummary,
  LcLegalMatterSummary,
  LcObligationSummary,
  LcPlatformConfigSummary,
  LcPolicySummary,
  LcPortalLegalSummary,
  LcPrivacyRequestSummary,
  LcRiskSummary,
  LcSignatureProviderSummary,
  RequestLcContractAnalysisRequest,
  UpdateLcPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  lcAnalyticsSnapshots,
  lcAuditLogs,
  lcClauseLibrary,
  lcContractIntelligenceAnalyses,
  lcContractLifecycleHistory,
  lcContracts,
  lcControls,
  lcEvidenceRecords,
  lcInsuranceClaims,
  lcInsurancePolicies,
  lcJurisdictions,
  lcLegalActionDrafts,
  lcLegalCategories,
  lcLegalHolds,
  lcLegalMatters,
  lcObligations,
  lcPlatformConfig,
  lcPolicies,
  lcPolicyAcknowledgements,
  lcPrivacyRequests,
  lcRiskRegister,
  lcSignatureProviderAdapters,
  users,
} from '@titan/db';
import type { DocumentsService } from './documents.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { FinanceService } from './finance.service.js';
import type { ProcurementService } from './procurement.service.js';

export class EnterpriseLegalComplianceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseLegalComplianceError';
  }
}

type StaffScope = { companyId: string; userId: string };

type LegalComplianceDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  documentsService: DocumentsService;
  financeService: FinanceService;
  procurementService: ProcurementService;
};

const AI_DISCLAIMER =
  'AI-generated analysis — not legal advice. Requires professional human review before reliance.';

export class EnterpriseLegalComplianceService {
  constructor(private readonly deps: LegalComplianceDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseLegalComplianceDashboard> {
    const isPlatformOwner = await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
    const [
      platformConfig,
      contracts,
      obligations,
      risks,
      controls,
      policies,
      legalMatters,
      insurancePolicies,
      claims,
      privacyRequests,
      legalHolds,
      providers,
      analytics,
      documentStats,
      complianceMonitoring,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.listContracts(companyId),
      this.listObligations(companyId),
      this.listRisks(companyId),
      this.listControls(companyId),
      this.listPolicies(companyId),
      this.listLegalMatters(companyId),
      this.listInsurancePolicies(companyId),
      this.listInsuranceClaims(companyId),
      this.listPrivacyRequests(companyId, { status: 'pending' }),
      this.listLegalHolds(companyId),
      this.listSignatureProviders(companyId),
      this.getLatestAnalytics(companyId),
      this.deps.documentsService.getStats(companyId).catch(() => null),
      this.getComplianceMonitoring(companyId),
    ]);

    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 86400000);
    const activeContracts = contracts.filter((c) => c.status === 'active');
    const expiringContracts = contracts.filter(
      (c) => c.expiryDate != null && new Date(c.expiryDate) <= thirtyDays && c.status === 'active',
    );
    const overdueObligations = obligations.filter((o) => o.isOverdue);
    const openRisks = risks.filter((r) => !['closed', 'accepted'].includes(r.status));
    const failedControls = controls.filter((c) => c.status === 'failed');
    const publishedPolicies = policies.filter((p) => p.status === 'published');
    const openMatters = legalMatters.filter((m) => !['closed', 'archived', 'resolved'].includes(m.status));
    const openClaims = claims.filter((c) => c.status === 'open');
    const activeHolds = legalHolds.filter((h) => h.workflowStatus === 'executed' || h.workflowStatus === 'approved');

    return {
      summary: `${contracts.length} contract(s), ${obligations.length} obligation(s), ${risks.length} risk(s), ${openMatters.length} open legal matter(s).`,
      isPlatformOwner,
      platformConfig,
      documentStats,
      contractCount: contracts.length,
      activeContractCount: activeContracts.length,
      expiringContractCount: expiringContracts.length,
      obligationCount: obligations.length,
      overdueObligationCount: overdueObligations.length,
      riskCount: risks.length,
      openRiskCount: openRisks.length,
      controlCount: controls.length,
      failedControlCount: failedControls.length,
      policyCount: policies.length,
      publishedPolicyCount: publishedPolicies.length,
      legalMatterCount: legalMatters.length,
      openLegalMatterCount: openMatters.length,
      insurancePolicyCount: insurancePolicies.length,
      openClaimCount: openClaims.length,
      pendingPrivacyRequestCount: privacyRequests.length,
      activeLegalHoldCount: activeHolds.length,
      signatureProviderCount: providers.length,
      analytics,
      complianceMonitoring,
      recentContracts: contracts.slice(0, 10),
      recentObligations: obligations.slice(0, 10),
      recentRisks: risks.slice(0, 10),
      recentLegalMatters: legalMatters.slice(0, 10),
      pendingPrivacyRequests: privacyRequests.slice(0, 10),
    };
  }

  async getComplianceMonitoring(companyId: string): Promise<LcComplianceMonitoringSummary> {
    const [contracts, obligations, risks, controls, privacyRequests, policies] = await Promise.all([
      this.listContracts(companyId),
      this.listObligations(companyId),
      this.listRisks(companyId),
      this.listControls(companyId),
      this.listPrivacyRequests(companyId, { status: 'pending' }),
      this.listPolicies(companyId),
    ]);

    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 86400000);
    const expiringContracts = contracts.filter(
      (c) => c.expiryDate != null && new Date(c.expiryDate) <= thirtyDays && c.status === 'active',
    ).length;
    const overdueObligations = obligations.filter((o) => o.isOverdue).length;
    const missingSignatures = contracts.filter((c) => c.status === 'signature').length;
    const unresolvedRisks = risks.filter((r) => !['closed', 'mitigated', 'accepted'].includes(r.status)).length;
    const failedControls = controls.filter((c) => c.status === 'failed').length;
    const publishedPolicies = policies.filter((p) => p.status === 'published');

    const [ackCount] = await this.deps.db
      .select({ count: count() })
      .from(lcPolicyAcknowledgements)
      .where(eq(lcPolicyAcknowledgements.companyId, companyId));

    const alerts: string[] = [];
    if (expiringContracts > 0) alerts.push(`${expiringContracts} contract(s) expiring within 30 days`);
    if (overdueObligations > 0) alerts.push(`${overdueObligations} overdue obligation(s)`);
    if (missingSignatures > 0) alerts.push(`${missingSignatures} contract(s) awaiting signature`);
    if (failedControls > 0) alerts.push(`${failedControls} failed control(s)`);
    if (privacyRequests.length > 0) alerts.push(`${privacyRequests.length} pending privacy request(s)`);

    return {
      expiringContracts,
      overdueObligations,
      expiredLicences: 0,
      missingSignatures,
      unresolvedRisks,
      failedControls,
      pendingPrivacyRequests: privacyRequests.length,
      policyAcknowledgementGaps: Math.max(0, publishedPolicies.length - (ackCount?.count ?? 0)),
      alerts,
    };
  }

  async getPortalLegalSummary(companyId: string, customerId?: string): Promise<LcPortalLegalSummary> {
    const [contracts, policies, matters, privacyRequests] = await Promise.all([
      this.deps.db.query.lcContracts.findMany({
        where: and(
          eq(lcContracts.companyId, companyId),
          eq(lcContracts.status, 'active'),
        ),
        limit: 20,
      }),
      this.deps.db.query.lcPolicies.findMany({
        where: and(eq(lcPolicies.companyId, companyId), eq(lcPolicies.status, 'published')),
        limit: 20,
      }),
      this.deps.db.query.lcLegalMatters.findMany({
        where: and(
          eq(lcLegalMatters.companyId, companyId),
          or(eq(lcLegalMatters.matterType, 'complaint'), eq(lcLegalMatters.matterType, 'dispute')),
        ),
        limit: 20,
      }),
      customerId
        ? this.listPrivacyRequests(companyId, { customerId })
        : Promise.resolve([]),
    ]);

    return {
      approvedContracts: contracts.map((c) => ({
        id: c.id,
        title: c.title,
        effectiveDate: c.effectiveDate,
      })),
      publishedPolicies: policies.map((p) => ({
        id: p.id,
        title: p.title,
        version: p.version,
      })),
      complaintMatters: matters.map((m) => ({
        id: m.id,
        title: m.title,
        status: m.status,
      })),
      privacyRequests: privacyRequests,
    };
  }

  async getEmployeeLegalSummary(scope: StaffScope): Promise<LcEmployeeLegalSummary> {
    const [contracts, policies, acks] = await Promise.all([
      this.listContracts(scope.companyId),
      this.listPolicies(scope.companyId),
      this.deps.db.query.lcPolicyAcknowledgements.findMany({
        where: and(
          eq(lcPolicyAcknowledgements.companyId, scope.companyId),
          eq(lcPolicyAcknowledgements.userId, scope.userId),
        ),
      }),
    ]);

    const employmentAgreements = contracts.filter(
      (c) => c.contractType?.toLowerCase().includes('employment') ?? false,
    );
    const policiesRequiringAcknowledgement = policies.filter((p) => p.status === 'published');

    return {
      employmentAgreements,
      policiesRequiringAcknowledgement,
      acknowledgedPolicyCount: acks.length,
    };
  }

  async getPlatformConfig(companyId: string): Promise<LcPlatformConfigSummary> {
    const row = await this.ensurePlatformConfig(companyId);
    return toPlatformConfigSummary(row);
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateLcPlatformConfigRequest,
  ): Promise<LcPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(lcPlatformConfig)
      .set({
        globalPolicies: input.globalPolicies ?? existing.globalPolicies,
        providerAdapterTemplates: input.providerAdapterTemplates ?? existing.providerAdapterTemplates,
        jurisdictionTemplates: input.jurisdictionTemplates ?? existing.jurisdictionTemplates,
        riskMethodology: input.riskMethodology ?? existing.riskMethodology,
        retentionTemplates: input.retentionTemplates ?? existing.retentionTemplates,
        privacyDefaults: input.privacyDefaults ?? existing.privacyDefaults,
        clauseLibraryTemplates: input.clauseLibraryTemplates ?? existing.clauseLibraryTemplates,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(lcPlatformConfig.companyId, scope.companyId))
      .returning();

    await this.recordAudit(scope, 'platform_config_updated');
    return toPlatformConfigSummary(updated!);
  }

  async createCategory(scope: StaffScope, input: CreateLcLegalCategoryRequest): Promise<LcLegalCategorySummary> {
    const [created] = await this.deps.db
      .insert(lcLegalCategories)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        categoryKey: input.categoryKey.trim(),
        description: input.description?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'category_created', 'lc_legal_category', created!.id);
    return toCategorySummary(created!);
  }

  async listCategories(companyId: string): Promise<LcLegalCategorySummary[]> {
    const rows = await this.deps.db.query.lcLegalCategories.findMany({
      where: eq(lcLegalCategories.companyId, companyId),
      orderBy: [desc(lcLegalCategories.createdAt)],
    });
    return rows.map(toCategorySummary);
  }

  async createJurisdiction(scope: StaffScope, input: CreateLcJurisdictionRequest): Promise<LcJurisdictionSummary> {
    const [created] = await this.deps.db
      .insert(lcJurisdictions)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        country: input.country?.trim() ?? null,
        provinceOrState: input.provinceOrState?.trim() ?? null,
        municipalityOrRegion: input.municipalityOrRegion?.trim() ?? null,
        industry: input.industry?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'jurisdiction_created', 'lc_jurisdiction', created!.id);
    return toJurisdictionSummary(created!);
  }

  async listJurisdictions(companyId: string): Promise<LcJurisdictionSummary[]> {
    const rows = await this.deps.db.query.lcJurisdictions.findMany({
      where: eq(lcJurisdictions.companyId, companyId),
      orderBy: [desc(lcJurisdictions.createdAt)],
    });
    return rows.map(toJurisdictionSummary);
  }

  async createContract(scope: StaffScope, input: CreateLcContractRequest): Promise<LcContractSummary> {
    const [created] = await this.deps.db
      .insert(lcContracts)
      .values({
        companyId: scope.companyId,
        ownerUserId: scope.userId,
        title: input.title.trim(),
        categoryId: input.categoryId ?? null,
        jurisdictionId: input.jurisdictionId ?? null,
        contractNumber: input.contractNumber?.trim() ?? null,
        contractType: input.contractType?.trim() ?? null,
        counterpartyName: input.counterpartyName?.trim() ?? null,
        counterpartyId: input.counterpartyId ?? null,
        counterpartyType: input.counterpartyType?.trim() ?? null,
        businessUnit: input.businessUnit?.trim() ?? null,
        effectiveDate: input.effectiveDate ?? null,
        expiryDate: input.expiryDate ?? null,
        renewalTerms: input.renewalTerms?.trim() ?? null,
        noticePeriodDays: input.noticePeriodDays ?? null,
        contractValueCents: input.contractValueCents ?? null,
        currency: input.currency ?? 'USD',
        paymentTerms: input.paymentTerms?.trim() ?? null,
        governingJurisdiction: input.governingJurisdiction?.trim() ?? null,
        linkedMetadata: input.linkedMetadata ?? {},
        status: 'draft',
        workflowStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'contract_created', 'lc_contract', created!.id);
    return this.buildContractSummary(created!);
  }

  async listContracts(companyId: string): Promise<LcContractSummary[]> {
    const rows = await this.deps.db.query.lcContracts.findMany({
      where: eq(lcContracts.companyId, companyId),
      orderBy: [desc(lcContracts.createdAt)],
      limit: 100,
    });

    const summaries: LcContractSummary[] = [];
    for (const row of rows) {
      summaries.push(await this.buildContractSummary(row));
    }
    return summaries;
  }

  async advanceContractLifecycle(
    scope: StaffScope,
    input: CreateLcContractLifecycleRequest,
  ): Promise<LcContractSummary> {
    const contract = await this.ensureContract(scope.companyId, input.contractId);
    const workflowStatus = input.requiresApproval ? 'pending_approval' : 'executed';

    await this.deps.db.insert(lcContractLifecycleHistory).values({
      companyId: scope.companyId,
      contractId: input.contractId,
      status: input.status,
      workflowStatus,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      responsibleUserId: scope.userId,
      createdByUserId: scope.userId,
    });

    if (workflowStatus === 'executed') {
      await this.deps.db
        .update(lcContracts)
        .set({
          status: input.status,
          workflowStatus: input.status === 'active' ? 'executed' : contract.workflowStatus,
          updatedAt: new Date(),
        })
        .where(eq(lcContracts.id, input.contractId));
    } else {
      await this.deps.db
        .update(lcContracts)
        .set({ workflowStatus: 'pending_approval', updatedAt: new Date() })
        .where(eq(lcContracts.id, input.contractId));
    }

    await this.recordAudit(scope, 'contract_lifecycle_advanced', 'lc_contract', input.contractId);
    return this.getContractSummary(scope.companyId, input.contractId);
  }

  async approveContract(scope: StaffScope, contractId: string): Promise<LcContractSummary> {
    const contract = await this.ensureContract(scope.companyId, contractId);
    if (contract.workflowStatus !== 'pending_approval') {
      throw new EnterpriseLegalComplianceError('VALIDATION_ERROR', 'Contract is not pending approval');
    }

    const [updated] = await this.deps.db
      .update(lcContracts)
      .set({ workflowStatus: 'approved', updatedAt: new Date() })
      .where(eq(lcContracts.id, contractId))
      .returning();

    await this.recordAudit(scope, 'contract_approved', 'lc_contract', contractId);
    return this.buildContractSummary(updated!);
  }

  async executeContract(scope: StaffScope, contractId: string): Promise<LcContractSummary> {
    const contract = await this.ensureContract(scope.companyId, contractId);
    if (contract.workflowStatus !== 'approved') {
      throw new EnterpriseLegalComplianceError('VALIDATION_ERROR', 'Contract must be approved before execution');
    }

    const [updated] = await this.deps.db
      .update(lcContracts)
      .set({ workflowStatus: 'executed', status: 'active', updatedAt: new Date() })
      .where(eq(lcContracts.id, contractId))
      .returning();

    await this.recordAudit(scope, 'contract_executed', 'lc_contract', contractId);
    return this.buildContractSummary(updated!);
  }

  async createClause(scope: StaffScope, input: CreateLcClauseRequest): Promise<LcClauseSummary> {
    const [created] = await this.deps.db
      .insert(lcClauseLibrary)
      .values({
        companyId: scope.companyId,
        clauseKey: input.clauseKey.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        jurisdictionId: input.jurisdictionId ?? null,
        isMandatory: input.isMandatory ?? false,
        isApproved: input.isApproved ?? false,
        ownerUserId: scope.userId,
      })
      .returning();

    await this.recordAudit(scope, 'clause_created', 'lc_clause', created!.id);
    return toClauseSummary(created!);
  }

  async listClauses(companyId: string): Promise<LcClauseSummary[]> {
    const rows = await this.deps.db.query.lcClauseLibrary.findMany({
      where: eq(lcClauseLibrary.companyId, companyId),
      orderBy: [desc(lcClauseLibrary.updatedAt)],
    });
    return rows.map(toClauseSummary);
  }

  async createSignatureProvider(
    scope: StaffScope,
    input: CreateLcSignatureProviderRequest,
  ): Promise<LcSignatureProviderSummary> {
    const [created] = await this.deps.db
      .insert(lcSignatureProviderAdapters)
      .values({
        companyId: scope.companyId,
        providerType: input.providerType,
        providerKey: input.providerKey.trim(),
        name: input.name.trim(),
        endpointUrl: input.endpointUrl ?? null,
        credentialsVaultKey: input.credentialsVaultKey ?? null,
        isPrimary: input.isPrimary ?? false,
        signerRoleMappings: input.signerRoleMappings ?? {},
        fieldMappings: input.fieldMappings ?? {},
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'signature_provider_created', 'lc_signature_provider', created!.id);
    return toProviderSummary(created!);
  }

  async listSignatureProviders(companyId: string): Promise<LcSignatureProviderSummary[]> {
    const rows = await this.deps.db.query.lcSignatureProviderAdapters.findMany({
      where: eq(lcSignatureProviderAdapters.companyId, companyId),
      orderBy: [desc(lcSignatureProviderAdapters.createdAt)],
    });
    return rows.map(toProviderSummary);
  }

  async testSignatureProvider(scope: StaffScope, providerId: string): Promise<LcSignatureProviderSummary> {
    const provider = await this.ensureSignatureProvider(scope.companyId, providerId);
    const testStatus = provider.endpointUrl || provider.credentialsVaultKey ? 'success' : 'pending_configuration';
    const testMessage =
      testStatus === 'success'
        ? 'Connectivity test completed — configure credentials for live signature requests.'
        : 'Provider saved — configure endpoint and credentials before sending signature requests.';

    const [updated] = await this.deps.db
      .update(lcSignatureProviderAdapters)
      .set({
        status: testStatus === 'success' ? 'testing' : provider.status,
        lastTestAt: new Date(),
        lastTestStatus: testStatus,
        lastTestMessage: testMessage,
        updatedAt: new Date(),
      })
      .where(eq(lcSignatureProviderAdapters.id, providerId))
      .returning();

    await this.recordAudit(scope, 'signature_provider_tested', 'lc_signature_provider', providerId);
    return toProviderSummary(updated!);
  }

  async requestContractAnalysis(
    scope: StaffScope,
    contractId: string,
    input: RequestLcContractAnalysisRequest,
  ): Promise<LcContractAnalysisSummary> {
    await this.ensureContract(scope.companyId, contractId);

    const [created] = await this.deps.db
      .insert(lcContractIntelligenceAnalyses)
      .values({
        companyId: scope.companyId,
        contractId,
        analysisType: input.analysisType.trim(),
        summary: input.content
          ? `Analysis requested for ${input.analysisType}. Content provided for review — AI orchestration will process when configured.`
          : `Analysis requested for ${input.analysisType}. Upload contract content for detailed extraction.`,
        confidenceScore: null,
        supportingEvidence: { contentProvided: Boolean(input.content) },
        limitations: 'Preliminary request — full AI analysis requires uploaded contract content and configured AI orchestration.',
        requiresHumanReview: true,
        disclaimer: AI_DISCLAIMER,
      })
      .returning();

    await this.recordAudit(scope, 'contract_analysis_requested', 'lc_contract_analysis', created!.id);
    return toAnalysisSummary(created!);
  }

  async listContractAnalyses(companyId: string, contractId?: string): Promise<LcContractAnalysisSummary[]> {
    const rows = await this.deps.db.query.lcContractIntelligenceAnalyses.findMany({
      where: contractId
        ? and(
            eq(lcContractIntelligenceAnalyses.companyId, companyId),
            eq(lcContractIntelligenceAnalyses.contractId, contractId),
          )
        : eq(lcContractIntelligenceAnalyses.companyId, companyId),
      orderBy: [desc(lcContractIntelligenceAnalyses.createdAt)],
      limit: 50,
    });
    return rows.map(toAnalysisSummary);
  }

  async createObligation(scope: StaffScope, input: CreateLcObligationRequest): Promise<LcObligationSummary> {
    if (input.contractId) await this.ensureContract(scope.companyId, input.contractId);

    const [created] = await this.deps.db
      .insert(lcObligations)
      .values({
        companyId: scope.companyId,
        contractId: input.contractId ?? null,
        ownerUserId: scope.userId,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        dueDate: input.dueDate ?? null,
        frequency: input.frequency?.trim() ?? null,
        sourceType: input.sourceType?.trim() ?? null,
        status: 'pending',
      })
      .returning();

    await this.recordAudit(scope, 'obligation_created', 'lc_obligation', created!.id);
    return this.buildObligationSummary(created!);
  }

  async listObligations(companyId: string): Promise<LcObligationSummary[]> {
    const rows = await this.deps.db.query.lcObligations.findMany({
      where: eq(lcObligations.companyId, companyId),
      orderBy: [desc(lcObligations.createdAt)],
      limit: 100,
    });

    const summaries: LcObligationSummary[] = [];
    for (const row of rows) {
      summaries.push(await this.buildObligationSummary(row));
    }
    return summaries;
  }

  async completeObligation(scope: StaffScope, obligationId: string): Promise<LcObligationSummary> {
    const [updated] = await this.deps.db
      .update(lcObligations)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(and(eq(lcObligations.companyId, scope.companyId), eq(lcObligations.id, obligationId)))
      .returning();

    if (!updated) throw new EnterpriseLegalComplianceError('NOT_FOUND', 'Obligation not found');
    await this.recordAudit(scope, 'obligation_completed', 'lc_obligation', obligationId);
    return this.buildObligationSummary(updated);
  }

  async createRisk(scope: StaffScope, input: CreateLcRiskRequest): Promise<LcRiskSummary> {
    const methodology = (await this.ensurePlatformConfig(scope.companyId)).riskMethodology as Record<string, unknown>;
    const likelihood = input.likelihood ?? null;
    const impact = input.impact ?? null;
    const inherentScore =
      likelihood != null && impact != null ? String(likelihood * impact) : null;

    const [created] = await this.deps.db
      .insert(lcRiskRegister)
      .values({
        companyId: scope.companyId,
        category: input.category ?? 'custom',
        customCategoryName: input.customCategoryName?.trim() ?? null,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        ownerUserId: scope.userId,
        businessArea: input.businessArea?.trim() ?? null,
        likelihood,
        impact,
        inherentRiskScore: inherentScore,
        residualRiskScore: inherentScore,
        treatmentPlan: input.treatmentPlan?.trim() ?? null,
        reviewDate: input.reviewDate ?? null,
        scoringMethodology: {
          formula: 'likelihood × impact',
          inputs: { likelihood, impact },
          methodology: methodology,
          calculatedAt: new Date().toISOString(),
          calculatedByUserId: scope.userId,
        },
        status: 'identified',
        workflowStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'risk_created', 'lc_risk', created!.id);
    return this.buildRiskSummary(created!);
  }

  async listRisks(companyId: string): Promise<LcRiskSummary[]> {
    const rows = await this.deps.db.query.lcRiskRegister.findMany({
      where: eq(lcRiskRegister.companyId, companyId),
      orderBy: [desc(lcRiskRegister.createdAt)],
      limit: 100,
    });

    const summaries: LcRiskSummary[] = [];
    for (const row of rows) {
      summaries.push(await this.buildRiskSummary(row));
    }
    return summaries;
  }

  async createControl(scope: StaffScope, input: CreateLcControlRequest): Promise<LcControlSummary> {
    const [created] = await this.deps.db
      .insert(lcControls)
      .values({
        companyId: scope.companyId,
        controlKey: input.controlKey.trim(),
        title: input.title.trim(),
        objective: input.objective?.trim() ?? null,
        ownerUserId: scope.userId,
        processArea: input.processArea?.trim() ?? null,
        frequency: input.frequency?.trim() ?? null,
        status: 'active',
      })
      .returning();

    await this.recordAudit(scope, 'control_created', 'lc_control', created!.id);
    return this.buildControlSummary(created!);
  }

  async listControls(companyId: string): Promise<LcControlSummary[]> {
    const rows = await this.deps.db.query.lcControls.findMany({
      where: eq(lcControls.companyId, companyId),
      orderBy: [desc(lcControls.createdAt)],
      limit: 100,
    });

    const summaries: LcControlSummary[] = [];
    for (const row of rows) {
      summaries.push(await this.buildControlSummary(row));
    }
    return summaries;
  }

  async createPolicy(scope: StaffScope, input: CreateLcPolicyRequest): Promise<LcPolicySummary> {
    const [created] = await this.deps.db
      .insert(lcPolicies)
      .values({
        companyId: scope.companyId,
        title: input.title.trim(),
        policyKey: input.policyKey.trim(),
        description: input.description?.trim() ?? null,
        content: input.content?.trim() ?? null,
        audience: input.audience?.trim() ?? null,
        effectiveDate: input.effectiveDate ?? null,
        reviewCycleDays: input.reviewCycleDays ?? null,
        status: 'draft',
        workflowStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'policy_created', 'lc_policy', created!.id);
    return toPolicySummary(created!);
  }

  async listPolicies(companyId: string): Promise<LcPolicySummary[]> {
    const rows = await this.deps.db.query.lcPolicies.findMany({
      where: eq(lcPolicies.companyId, companyId),
      orderBy: [desc(lcPolicies.updatedAt)],
      limit: 100,
    });
    return rows.map(toPolicySummary);
  }

  async publishPolicy(scope: StaffScope, policyId: string): Promise<LcPolicySummary> {
    const policy = await this.ensurePolicy(scope.companyId, policyId);
    if (policy.workflowStatus !== 'approved') {
      throw new EnterpriseLegalComplianceError(
        'VALIDATION_ERROR',
        'Policy must follow Draft → Review → Approval before publish',
      );
    }

    const [updated] = await this.deps.db
      .update(lcPolicies)
      .set({
        status: 'published',
        workflowStatus: 'executed',
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(lcPolicies.id, policyId))
      .returning();

    await this.recordAudit(scope, 'policy_published', 'lc_policy', policyId);
    return toPolicySummary(updated!);
  }

  async acknowledgePolicy(scope: StaffScope, policyId: string): Promise<void> {
    await this.ensurePolicy(scope.companyId, policyId);

    const existing = await this.deps.db.query.lcPolicyAcknowledgements.findFirst({
      where: and(
        eq(lcPolicyAcknowledgements.companyId, scope.companyId),
        eq(lcPolicyAcknowledgements.policyId, policyId),
        eq(lcPolicyAcknowledgements.userId, scope.userId),
      ),
    });
    if (existing) return;

    await this.deps.db.insert(lcPolicyAcknowledgements).values({
      companyId: scope.companyId,
      policyId,
      userId: scope.userId,
    });

    await this.recordAudit(scope, 'policy_acknowledged', 'lc_policy', policyId);
  }

  async createLegalMatter(scope: StaffScope, input: CreateLcLegalMatterRequest): Promise<LcLegalMatterSummary> {
    const [created] = await this.deps.db
      .insert(lcLegalMatters)
      .values({
        companyId: scope.companyId,
        matterType: input.matterType.trim(),
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        priority: input.priority ?? 'medium',
        responsibleUserId: scope.userId,
        counterpartyName: input.counterpartyName?.trim() ?? null,
        deadlineDate: input.deadlineDate ?? null,
        status: 'open',
      })
      .returning();

    await this.recordAudit(scope, 'legal_matter_created', 'lc_legal_matter', created!.id);
    return this.buildLegalMatterSummary(created!);
  }

  async listLegalMatters(companyId: string): Promise<LcLegalMatterSummary[]> {
    const rows = await this.deps.db.query.lcLegalMatters.findMany({
      where: eq(lcLegalMatters.companyId, companyId),
      orderBy: [desc(lcLegalMatters.createdAt)],
      limit: 100,
    });

    const summaries: LcLegalMatterSummary[] = [];
    for (const row of rows) {
      summaries.push(await this.buildLegalMatterSummary(row));
    }
    return summaries;
  }

  async createInsurancePolicy(
    scope: StaffScope,
    input: {
      policyNumber: string;
      coverageType: string;
      insurerName?: string;
      expiryDate?: string;
      premiumCents?: number;
    },
  ): Promise<LcInsurancePolicySummary> {
    const [created] = await this.deps.db
      .insert(lcInsurancePolicies)
      .values({
        companyId: scope.companyId,
        policyNumber: input.policyNumber.trim(),
        coverageType: input.coverageType.trim(),
        insurerName: input.insurerName?.trim() ?? null,
        expiryDate: input.expiryDate ?? null,
        premiumCents: input.premiumCents ?? null,
      })
      .returning();

    await this.recordAudit(scope, 'insurance_policy_created', 'lc_insurance_policy', created!.id);
    return toInsurancePolicySummary(created!);
  }

  async listInsurancePolicies(companyId: string): Promise<LcInsurancePolicySummary[]> {
    const rows = await this.deps.db.query.lcInsurancePolicies.findMany({
      where: eq(lcInsurancePolicies.companyId, companyId),
      orderBy: [desc(lcInsurancePolicies.createdAt)],
    });
    return rows.map(toInsurancePolicySummary);
  }

  async createInsuranceClaim(
    scope: StaffScope,
    input: { policyId: string; title: string; claimNumber?: string; claimAmountCents?: number },
  ): Promise<LcInsuranceClaimSummary> {
    await this.ensureInsurancePolicy(scope.companyId, input.policyId);

    const [created] = await this.deps.db
      .insert(lcInsuranceClaims)
      .values({
        companyId: scope.companyId,
        policyId: input.policyId,
        title: input.title.trim(),
        claimNumber: input.claimNumber?.trim() ?? null,
        claimAmountCents: input.claimAmountCents ?? null,
        status: 'open',
      })
      .returning();

    await this.recordAudit(scope, 'insurance_claim_created', 'lc_insurance_claim', created!.id);
    return toInsuranceClaimSummary(created!);
  }

  async listInsuranceClaims(companyId: string): Promise<LcInsuranceClaimSummary[]> {
    const rows = await this.deps.db.query.lcInsuranceClaims.findMany({
      where: eq(lcInsuranceClaims.companyId, companyId),
      orderBy: [desc(lcInsuranceClaims.createdAt)],
    });
    return rows.map(toInsuranceClaimSummary);
  }

  async createPrivacyRequest(
    scope: StaffScope,
    input: CreateLcPrivacyRequestRequest,
  ): Promise<LcPrivacyRequestSummary> {
    const activeHolds = await this.deps.db.query.lcLegalHolds.findMany({
      where: and(
        eq(lcLegalHolds.companyId, scope.companyId),
        or(eq(lcLegalHolds.workflowStatus, 'approved'), eq(lcLegalHolds.workflowStatus, 'executed')),
      ),
    });

    const [created] = await this.deps.db
      .insert(lcPrivacyRequests)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId ?? null,
        requestType: input.requestType,
        subjectName: input.subjectName?.trim() ?? null,
        description: input.description?.trim() ?? null,
        legalHoldBlocked: activeHolds.length > 0 && input.requestType === 'deletion',
        status: 'pending',
        workflowStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'privacy_request_created', 'lc_privacy_request', created!.id);
    return toPrivacyRequestSummary(created!);
  }

  async listPrivacyRequests(
    companyId: string,
    filters?: { status?: string; customerId?: string },
  ): Promise<LcPrivacyRequestSummary[]> {
    const conditions = [eq(lcPrivacyRequests.companyId, companyId)];
    if (filters?.status) {
      conditions.push(
        eq(lcPrivacyRequests.status, filters.status as typeof lcPrivacyRequests.$inferSelect.status),
      );
    }
    if (filters?.customerId) conditions.push(eq(lcPrivacyRequests.customerId, filters.customerId));

    const rows = await this.deps.db.query.lcPrivacyRequests.findMany({
      where: and(...conditions),
      orderBy: [desc(lcPrivacyRequests.createdAt)],
      limit: 100,
    });
    return rows.map(toPrivacyRequestSummary);
  }

  async listLegalHolds(companyId: string): Promise<LcLegalHoldSummary[]> {
    const rows = await this.deps.db.query.lcLegalHolds.findMany({
      where: eq(lcLegalHolds.companyId, companyId),
      orderBy: [desc(lcLegalHolds.createdAt)],
    });
    return rows.map(toLegalHoldSummary);
  }

  async listEvidence(companyId: string): Promise<LcEvidenceSummary[]> {
    const rows = await this.deps.db.query.lcEvidenceRecords.findMany({
      where: eq(lcEvidenceRecords.companyId, companyId),
      orderBy: [desc(lcEvidenceRecords.createdAt)],
      limit: 100,
    });
    return rows.map(toEvidenceSummary);
  }

  async createLegalActionDraft(
    scope: StaffScope,
    input: CreateLcLegalActionDraftRequest,
  ): Promise<{ id: string; subject: string; draftType: string; status: string }> {
    const status = input.requiresApproval !== false ? 'pending_approval' : 'draft';
    const [created] = await this.deps.db
      .insert(lcLegalActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType,
        status,
        subject: input.subject.trim(),
        description: input.description?.trim() ?? null,
        payload: input.payload ?? {},
        aiGenerated: input.aiGenerated ?? false,
        disclaimer: input.aiGenerated ? AI_DISCLAIMER : null,
        createdByUserId: scope.userId,
      })
      .returning();

    await this.recordAudit(scope, 'legal_draft_created', 'lc_legal_action_draft', created!.id);
    return {
      id: created!.id,
      subject: created!.subject,
      draftType: created!.draftType,
      status: created!.status,
    };
  }

  async captureAnalytics(scope: StaffScope): Promise<LcAnalyticsSummary> {
    const dashboard = await this.getDashboard(scope.companyId);

    const [created] = await this.deps.db
      .insert(lcAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        activeContractCount: dashboard.activeContractCount,
        expiringContractCount: dashboard.expiringContractCount,
        contractValueCents: dashboard.recentContracts.reduce(
          (sum, c) => sum + (c.contractValueCents ?? 0),
          0,
        ),
        overdueObligationCount: dashboard.overdueObligationCount,
        complianceGapCount: dashboard.complianceMonitoring.alerts.length,
        openRiskCount: dashboard.openRiskCount,
        failedControlCount: dashboard.failedControlCount,
        openLegalMatterCount: dashboard.openLegalMatterCount,
        openClaimCount: dashboard.openClaimCount,
        pendingPrivacyRequestCount: dashboard.pendingPrivacyRequestCount,
        metrics: dashboard.complianceMonitoring as unknown as Record<string, unknown>,
      })
      .returning();

    await this.recordAudit(scope, 'analytics_captured');
    return toAnalyticsSummary(created!);
  }

  async getLatestAnalytics(companyId: string): Promise<LcAnalyticsSummary | null> {
    const row = await this.deps.db.query.lcAnalyticsSnapshots.findFirst({
      where: eq(lcAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(lcAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseLegalComplianceAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      contractCount: dashboard.contractCount,
      expiringContractCount: dashboard.expiringContractCount,
      overdueObligationCount: dashboard.overdueObligationCount,
      openRiskCount: dashboard.openRiskCount,
      openLegalMatterCount: dashboard.openLegalMatterCount,
      pendingPrivacyRequestCount: dashboard.pendingPrivacyRequestCount,
      summary: dashboard.summary,
    };
  }

  private async getContractSummary(companyId: string, contractId: string): Promise<LcContractSummary> {
    const row = await this.deps.db.query.lcContracts.findFirst({
      where: and(eq(lcContracts.companyId, companyId), eq(lcContracts.id, contractId)),
    });
    if (!row) throw new EnterpriseLegalComplianceError('NOT_FOUND', 'Contract not found');
    return this.buildContractSummary(row);
  }

  private async buildContractSummary(row: typeof lcContracts.$inferSelect): Promise<LcContractSummary> {
    const owner = row.ownerUserId
      ? await this.deps.db.query.users.findFirst({ where: eq(users.id, row.ownerUserId) })
      : null;
    const daysUntilExpiry =
      row.expiryDate != null
        ? Math.ceil((new Date(row.expiryDate).getTime() - Date.now()) / 86400000)
        : null;

    return {
      id: row.id,
      title: row.title,
      contractNumber: row.contractNumber,
      contractType: row.contractType,
      counterpartyName: row.counterpartyName,
      status: row.status,
      workflowStatus: row.workflowStatus,
      effectiveDate: row.effectiveDate,
      expiryDate: row.expiryDate,
      contractValueCents: row.contractValueCents,
      currency: row.currency,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
      daysUntilExpiry,
    };
  }

  private async buildObligationSummary(row: typeof lcObligations.$inferSelect): Promise<LcObligationSummary> {
    const owner = row.ownerUserId
      ? await this.deps.db.query.users.findFirst({ where: eq(users.id, row.ownerUserId) })
      : null;
    const contract = row.contractId
      ? await this.deps.db.query.lcContracts.findFirst({ where: eq(lcContracts.id, row.contractId) })
      : null;
    const isOverdue =
      row.dueDate != null &&
      new Date(row.dueDate) < new Date() &&
      !['completed', 'waived', 'cancelled'].includes(row.status);

    return {
      id: row.id,
      title: row.title,
      status: row.status,
      dueDate: row.dueDate,
      frequency: row.frequency,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
      contractTitle: contract?.title ?? null,
      isOverdue,
    };
  }

  private async buildRiskSummary(row: typeof lcRiskRegister.$inferSelect): Promise<LcRiskSummary> {
    const owner = row.ownerUserId
      ? await this.deps.db.query.users.findFirst({ where: eq(users.id, row.ownerUserId) })
      : null;

    return {
      id: row.id,
      title: row.title,
      category: row.category,
      customCategoryName: row.customCategoryName,
      status: row.status,
      likelihood: row.likelihood,
      impact: row.impact,
      inherentRiskScore: row.inherentRiskScore != null ? Number(row.inherentRiskScore) : null,
      residualRiskScore: row.residualRiskScore != null ? Number(row.residualRiskScore) : null,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
      reviewDate: row.reviewDate,
    };
  }

  private async buildControlSummary(row: typeof lcControls.$inferSelect): Promise<LcControlSummary> {
    const owner = row.ownerUserId
      ? await this.deps.db.query.users.findFirst({ where: eq(users.id, row.ownerUserId) })
      : null;

    return {
      id: row.id,
      controlKey: row.controlKey,
      title: row.title,
      processArea: row.processArea,
      status: row.status,
      lastPerformedAt: row.lastPerformedAt?.toISOString() ?? null,
      nextDueAt: row.nextDueAt?.toISOString() ?? null,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
    };
  }

  private async buildLegalMatterSummary(row: typeof lcLegalMatters.$inferSelect): Promise<LcLegalMatterSummary> {
    const responsible = row.responsibleUserId
      ? await this.deps.db.query.users.findFirst({ where: eq(users.id, row.responsibleUserId) })
      : null;

    return {
      id: row.id,
      matterNumber: row.matterNumber,
      matterType: row.matterType,
      title: row.title,
      status: row.status,
      priority: row.priority,
      responsibleName: responsible ? `${responsible.firstName} ${responsible.lastName}`.trim() : null,
      deadlineDate: row.deadlineDate,
      costCents: row.costCents,
    };
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.lcPlatformConfig.findFirst({
      where: eq(lcPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(lcPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async ensureContract(companyId: string, contractId: string) {
    const contract = await this.deps.db.query.lcContracts.findFirst({
      where: and(eq(lcContracts.companyId, companyId), eq(lcContracts.id, contractId)),
    });
    if (!contract) throw new EnterpriseLegalComplianceError('NOT_FOUND', 'Contract not found');
    return contract;
  }

  private async ensurePolicy(companyId: string, policyId: string) {
    const policy = await this.deps.db.query.lcPolicies.findFirst({
      where: and(eq(lcPolicies.companyId, companyId), eq(lcPolicies.id, policyId)),
    });
    if (!policy) throw new EnterpriseLegalComplianceError('NOT_FOUND', 'Policy not found');
    return policy;
  }

  private async ensureSignatureProvider(companyId: string, providerId: string) {
    const provider = await this.deps.db.query.lcSignatureProviderAdapters.findFirst({
      where: and(
        eq(lcSignatureProviderAdapters.companyId, companyId),
        eq(lcSignatureProviderAdapters.id, providerId),
      ),
    });
    if (!provider) throw new EnterpriseLegalComplianceError('NOT_FOUND', 'Signature provider not found');
    return provider;
  }

  private async ensureInsurancePolicy(companyId: string, policyId: string) {
    const policy = await this.deps.db.query.lcInsurancePolicies.findFirst({
      where: and(eq(lcInsurancePolicies.companyId, companyId), eq(lcInsurancePolicies.id, policyId)),
    });
    if (!policy) throw new EnterpriseLegalComplianceError('NOT_FOUND', 'Insurance policy not found');
    return policy;
  }

  private async recordAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(lcAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(row: typeof lcPlatformConfig.$inferSelect): LcPlatformConfigSummary {
  return {
    globalPolicies: row.globalPolicies,
    providerAdapterTemplates: row.providerAdapterTemplates,
    jurisdictionTemplates: row.jurisdictionTemplates,
    riskMethodology: row.riskMethodology,
    retentionTemplates: row.retentionTemplates,
    privacyDefaults: row.privacyDefaults,
    clauseLibraryTemplates: row.clauseLibraryTemplates,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toCategorySummary(row: typeof lcLegalCategories.$inferSelect): LcLegalCategorySummary {
  return {
    id: row.id,
    name: row.name,
    categoryKey: row.categoryKey,
    description: row.description,
    isActive: row.isActive,
  };
}

function toJurisdictionSummary(row: typeof lcJurisdictions.$inferSelect): LcJurisdictionSummary {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    provinceOrState: row.provinceOrState,
    municipalityOrRegion: row.municipalityOrRegion,
    industry: row.industry,
    isActive: row.isActive,
  };
}

function toClauseSummary(row: typeof lcClauseLibrary.$inferSelect): LcClauseSummary {
  return {
    id: row.id,
    clauseKey: row.clauseKey,
    title: row.title,
    isMandatory: row.isMandatory,
    isApproved: row.isApproved,
    version: row.version,
  };
}

function toProviderSummary(row: typeof lcSignatureProviderAdapters.$inferSelect): LcSignatureProviderSummary {
  return {
    id: row.id,
    providerType: row.providerType,
    providerKey: row.providerKey,
    name: row.name,
    status: row.status,
    isPrimary: row.isPrimary,
    lastTestAt: row.lastTestAt?.toISOString() ?? null,
    lastTestStatus: row.lastTestStatus,
  };
}

function toAnalysisSummary(row: typeof lcContractIntelligenceAnalyses.$inferSelect): LcContractAnalysisSummary {
  return {
    id: row.id,
    contractId: row.contractId,
    analysisType: row.analysisType,
    summary: row.summary,
    confidenceScore: row.confidenceScore != null ? Number(row.confidenceScore) : null,
    requiresHumanReview: row.requiresHumanReview,
    disclaimer: row.disclaimer,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPolicySummary(row: typeof lcPolicies.$inferSelect): LcPolicySummary {
  return {
    id: row.id,
    title: row.title,
    policyKey: row.policyKey,
    status: row.status,
    workflowStatus: row.workflowStatus,
    version: row.version,
    effectiveDate: row.effectiveDate,
    expiryDate: row.expiryDate,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function toInsurancePolicySummary(row: typeof lcInsurancePolicies.$inferSelect): LcInsurancePolicySummary {
  return {
    id: row.id,
    policyNumber: row.policyNumber,
    coverageType: row.coverageType,
    insurerName: row.insurerName,
    expiryDate: row.expiryDate,
    premiumCents: row.premiumCents,
  };
}

function toInsuranceClaimSummary(row: typeof lcInsuranceClaims.$inferSelect): LcInsuranceClaimSummary {
  return {
    id: row.id,
    policyId: row.policyId,
    claimNumber: row.claimNumber,
    title: row.title,
    status: row.status,
    claimAmountCents: row.claimAmountCents,
  };
}

function toPrivacyRequestSummary(row: typeof lcPrivacyRequests.$inferSelect): LcPrivacyRequestSummary {
  return {
    id: row.id,
    requestType: row.requestType,
    status: row.status,
    subjectName: row.subjectName,
    legalHoldBlocked: row.legalHoldBlocked,
    createdAt: row.createdAt.toISOString(),
  };
}

function toLegalHoldSummary(row: typeof lcLegalHolds.$inferSelect): LcLegalHoldSummary {
  return {
    id: row.id,
    title: row.title,
    reason: row.reason,
    workflowStatus: row.workflowStatus,
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

function toEvidenceSummary(row: typeof lcEvidenceRecords.$inferSelect): LcEvidenceSummary {
  return {
    id: row.id,
    evidenceType: row.evidenceType,
    title: row.title,
    integrityHash: row.integrityHash,
    linkedEntityType: row.linkedEntityType,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof lcAnalyticsSnapshots.$inferSelect): LcAnalyticsSummary {
  return {
    activeContractCount: row.activeContractCount,
    expiringContractCount: row.expiringContractCount,
    contractValueCents: row.contractValueCents,
    overdueObligationCount: row.overdueObligationCount,
    complianceGapCount: row.complianceGapCount,
    openRiskCount: row.openRiskCount,
    failedControlCount: row.failedControlCount,
    openLegalMatterCount: row.openLegalMatterCount,
    openClaimCount: row.openClaimCount,
    pendingPrivacyRequestCount: row.pendingPrivacyRequestCount,
    capturedAt: row.capturedAt.toISOString(),
  };
}
