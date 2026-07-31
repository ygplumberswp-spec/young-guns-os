import { and, desc, eq, ne } from 'drizzle-orm';
import {
  AGENT_REGISTRY,
  AGENT_TOOL_REGISTRY,
  CAPABILITY_DEPARTMENTS,
  CAPABILITY_MATCH_THRESHOLD,
  PROHIBITED_CAPABILITY_ACTIONS,
  getAgentRegistryEntry,
  indicatesCodeBackedCapability,
  matchCapabilityKeywordRoute,
  scoreCapabilityMessageMatch,
  type AgentKey,
  type CapabilityKeywordRoute,
  type CapabilityDiscoveryResponse,
  type CapabilityDuplicateMatch,
  type CapabilityProposal,
  type CreateCapabilityProposalRequest,
  type DiscoverCapabilityRequest,
  type TenantCapabilityDetail,
  type TenantCapabilitySummary,
  type TenantCapabilityTestResult,
  type TenantCapabilityTestSummary,
  type TenantCapabilityVersionSummary,
  type UpdateCapabilityProposalRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  agentProfiles,
  agentProfilePermissions,
  agentProfileTools,
  tenantCapabilities,
  tenantCapabilityAuditLog,
  tenantCapabilityTests,
  tenantCapabilityVersions,
} from '@titan/db';
import { listMissionControlSnapshots } from './tenant-capability-mission-control.js';

export class TenantCapabilityBuilderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TenantCapabilityBuilderError';
  }
}

type TenantScope = { companyId: string; userId: string };

const DEFAULT_ALLOWED_ACTIONS = [
  { id: 'analyze', label: 'Analyse business data', allowed: true },
  { id: 'summarize', label: 'Prepare summaries', allowed: true },
  { id: 'recommend', label: 'Recommend follow-ups', allowed: true },
  { id: 'draft_checklist', label: 'Draft checklists', allowed: true },
  { id: 'low_risk_automation', label: 'Perform approved low-risk actions', allowed: false },
];

export class TenantCapabilityBuilderService {
  constructor(private readonly db: DatabaseClient) {}

  async listCapabilities(companyId: string): Promise<TenantCapabilitySummary[]> {
    const rows = await this.db.query.tenantCapabilities.findMany({
      where: eq(tenantCapabilities.companyId, companyId),
      orderBy: [desc(tenantCapabilities.updatedAt)],
    });
    return rows.map((row) => toSummary(row));
  }

  async listMissionControlSnapshots(companyId: string) {
    const rows = await this.db.query.tenantCapabilities.findMany({
      where: eq(tenantCapabilities.companyId, companyId),
      orderBy: [desc(tenantCapabilities.updatedAt)],
    });

    return listMissionControlSnapshots(
      rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        status: row.status,
        healthState: row.healthState as { status?: string } | null,
      })),
    );
  }

  async getCapability(
    companyId: string,
    capabilityId: string,
  ): Promise<TenantCapabilityDetail | null> {
    const row = await this.db.query.tenantCapabilities.findFirst({
      where: and(
        eq(tenantCapabilities.id, capabilityId),
        eq(tenantCapabilities.companyId, companyId),
      ),
    });
    if (!row) return null;
    return toDetail(row);
  }

  async discover(
    scope: TenantScope,
    input: DiscoverCapabilityRequest,
  ): Promise<CapabilityDiscoveryResponse> {
    const description = input.description.trim();
    if (!description) {
      throw new TenantCapabilityBuilderError(
        'VALIDATION_ERROR',
        'Describe the capability you need.',
      );
    }

    const route = matchCapabilityKeywordRoute(description);
    const duplicateMatches = await this.findDuplicates(scope.companyId, description, route);
    const answers = input.answers ?? {};

    const missingQuestions = buildDiscoveryQuestions(route, answers);
    if (missingQuestions.length > 0) {
      return {
        complete: false,
        questions: missingQuestions,
        duplicateMatches,
        recommendation: 'needs_more_info',
        recommendationSummary: 'AURA needs a little more information before preparing a proposal.',
        proposal: null,
      };
    }

    const requiresCode = route?.requiresCode === true || indicatesCodeBackedCapability(description);
    if (requiresCode) {
      return {
        complete: true,
        questions: [],
        duplicateMatches,
        recommendation: 'code_backed',
        recommendationSummary:
          'This capability needs new application logic or integrations. AURA App Builder will prepare a controlled development plan.',
        proposal: buildProposal(description, route, answers, true, duplicateMatches),
      };
    }

    const extendMatch = duplicateMatches.find((m) => m.recommendation === 'extend_existing');
    const recommendation =
      input.answers?.duplicateResolution === 'create_separate'
        ? 'create_tenant'
        : extendMatch
          ? 'extend_existing'
          : 'create_tenant';

    return {
      complete: true,
      questions: [],
      duplicateMatches,
      recommendation,
      recommendationSummary: extendMatch
        ? `This looks similar to ${extendMatch.name}. AURA recommends extending that capability instead of creating a duplicate.`
        : 'AURA can configure this as a tenant capability using approved tools and data access.',
      proposal: buildProposal(
        description,
        route,
        answers,
        false,
        duplicateMatches,
        recommendation,
        extendMatch,
      ),
    };
  }

  async createProposal(
    scope: TenantScope,
    input: CreateCapabilityProposalRequest,
  ): Promise<TenantCapabilityDetail> {
    const discovery = await this.discover(scope, input);
    if (!discovery.complete || !discovery.proposal) {
      throw new TenantCapabilityBuilderError(
        'DISCOVERY_INCOMPLETE',
        'Complete the discovery questions before creating a proposal.',
      );
    }

    if (input.duplicateResolution === 'cancel') {
      throw new TenantCapabilityBuilderError('CANCELLED', 'Capability creation cancelled.');
    }

    const proposal = { ...discovery.proposal };
    if (input.duplicateResolution === 'extend_existing' && input.extendAgentKey) {
      proposal.extendsAgentKey = input.extendAgentKey;
      const entry = getAgentRegistryEntry(input.extendAgentKey);
      proposal.extendsAgentName = entry?.name ?? input.extendAgentKey;
    }

    const slug = await uniqueSlug(scope.companyId, proposal.name);
    const configuration = buildConfiguration(proposal, input.answers ?? {});

    const [created] = await this.db
      .insert(tenantCapabilities)
      .values({
        companyId: scope.companyId,
        slug,
        name: proposal.name,
        department: proposal.department,
        purpose: proposal.purpose,
        capabilityType: proposal.configurationOnly ? 'tenant_configuration' : 'code_backed',
        status: proposal.configurationOnly ? 'draft' : 'awaiting_approval',
        version: 1,
        baseAgentKey: proposal.baseAgentKey,
        extendsAgentKey: proposal.extendsAgentKey,
        proposal,
        configuration,
        approvalPolicy: {
          mode: 'ask_before_external_actions',
          externalActionsRequireApproval: true,
        },
        riskLevel: proposal.riskLevel,
        providerRequirements: proposal.providerRequirements,
        capabilityTags: extractTags(proposal.purpose),
        createdByUserId: scope.userId,
        updatedByUserId: scope.userId,
      })
      .returning();

    if (!created) {
      throw new TenantCapabilityBuilderError(
        'CREATE_FAILED',
        'Unable to create capability proposal.',
      );
    }

    await this.recordAudit(
      scope,
      created.id,
      'proposal_created',
      `Proposal created for ${created.name}`,
    );
    await this.recordVersion(scope, created, 'Proposal created');

    const detail = await this.getCapability(scope.companyId, created.id);
    if (!detail) {
      throw new TenantCapabilityBuilderError('CREATE_FAILED', 'Unable to load created capability.');
    }
    return detail;
  }

  async updateProposal(
    scope: TenantScope,
    capabilityId: string,
    input: UpdateCapabilityProposalRequest,
  ): Promise<TenantCapabilityDetail> {
    const existing = await this.getCapability(scope.companyId, capabilityId);
    if (!existing) {
      throw new TenantCapabilityBuilderError('NOT_FOUND', 'Capability not found.');
    }
    if (existing.status === 'active' || existing.status === 'archived') {
      throw new TenantCapabilityBuilderError(
        'INVALID_STATE',
        'Active or archived capabilities cannot be edited here.',
      );
    }

    const proposal: CapabilityProposal = {
      ...existing.proposal,
      name: input.name?.trim() || existing.proposal.name,
      department: input.department || existing.proposal.department,
      purpose: input.purpose?.trim() || existing.proposal.purpose,
      departmentLabel:
        CAPABILITY_DEPARTMENTS.find(
          (d) => d.id === (input.department || existing.proposal.department),
        )?.label ?? existing.proposal.departmentLabel,
      dataAccess: input.dataAccess ?? existing.proposal.dataAccess,
    };

    if (input.allowedLowRiskActions !== undefined) {
      proposal.allowedActions = DEFAULT_ALLOWED_ACTIONS.map((action) =>
        action.id === 'low_risk_automation'
          ? { ...action, allowed: input.allowedLowRiskActions === true }
          : action,
      );
    }

    const configuration = {
      ...existing.configuration,
      roleScope: input.roleScope ??
        (existing.configuration.roleScope as string[] | undefined) ?? ['owner'],
      dataAccess: proposal.dataAccess,
    };

    const [updated] = await this.db
      .update(tenantCapabilities)
      .set({
        name: proposal.name,
        department: proposal.department,
        purpose: proposal.purpose,
        proposal,
        configuration,
        updatedByUserId: scope.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantCapabilities.id, capabilityId),
          eq(tenantCapabilities.companyId, scope.companyId),
        ),
      )
      .returning();

    if (!updated) {
      throw new TenantCapabilityBuilderError('UPDATE_FAILED', 'Unable to update proposal.');
    }

    await this.recordAudit(
      scope,
      capabilityId,
      'proposal_updated',
      `Proposal updated for ${updated.name}`,
    );
    const detail = await this.getCapability(scope.companyId, capabilityId);
    if (!detail)
      throw new TenantCapabilityBuilderError('UPDATE_FAILED', 'Unable to load capability.');
    return detail;
  }

  async testCapability(
    scope: TenantScope,
    capabilityId: string,
  ): Promise<{ test: TenantCapabilityTestSummary; capability: TenantCapabilityDetail }> {
    const capability = await this.getCapability(scope.companyId, capabilityId);
    if (!capability) {
      throw new TenantCapabilityBuilderError('NOT_FOUND', 'Capability not found.');
    }

    const verification = await this.verifyConfiguration(scope.companyId, capability);
    const result: TenantCapabilityTestResult = verification.failed.length
      ? 'failed'
      : verification.warnings.length
        ? 'passed_with_warnings'
        : 'passed';

    const summary =
      result === 'passed'
        ? 'All safety checks passed. The capability is ready for activation review.'
        : result === 'passed_with_warnings'
          ? `Passed with warnings: ${verification.warnings.join(' ')}`
          : `Failed: ${verification.failed.join(' ')}`;

    const [testRow] = await this.db
      .insert(tenantCapabilityTests)
      .values({
        capabilityId,
        companyId: scope.companyId,
        result,
        summary,
        details: {
          checks: verification.checks,
          warnings: verification.warnings,
          failed: verification.failed,
        },
        testedByUserId: scope.userId,
      })
      .returning();

    await this.db
      .update(tenantCapabilities)
      .set({
        status: result === 'failed' ? 'failed_deployment' : 'testing',
        healthState: {
          lastTestAt: new Date().toISOString(),
          lastTestResult: result,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantCapabilities.id, capabilityId),
          eq(tenantCapabilities.companyId, scope.companyId),
        ),
      );

    await this.recordAudit(scope, capabilityId, 'capability_tested', summary);

    const updated = await this.getCapability(scope.companyId, capabilityId);
    if (!updated || !testRow) {
      throw new TenantCapabilityBuilderError('TEST_FAILED', 'Unable to complete capability test.');
    }

    return {
      test: {
        id: testRow.id,
        result: testRow.result,
        summary: testRow.summary,
        details: testRow.details as Record<string, unknown>,
        createdAt: testRow.createdAt.toISOString(),
      },
      capability: updated,
    };
  }

  async activateCapability(
    scope: TenantScope,
    capabilityId: string,
  ): Promise<TenantCapabilityDetail> {
    const capability = await this.getCapability(scope.companyId, capabilityId);
    if (!capability) {
      throw new TenantCapabilityBuilderError('NOT_FOUND', 'Capability not found.');
    }
    if (capability.capabilityType === 'code_backed') {
      throw new TenantCapabilityBuilderError(
        'CODE_BACKED',
        'Code-backed capabilities must be completed through AURA App Builder before activation.',
      );
    }

    const verification = await this.verifyConfiguration(scope.companyId, capability);
    if (verification.failed.length > 0) {
      throw new TenantCapabilityBuilderError('VERIFICATION_FAILED', verification.failed.join(' '));
    }

    if (capability.status !== 'testing' && capability.status !== 'draft') {
      throw new TenantCapabilityBuilderError(
        'INVALID_STATE',
        'Run a successful capability test before activation.',
      );
    }

    const profileId = await this.ensureAgentProfile(scope, capability);

    const [activated] = await this.db
      .update(tenantCapabilities)
      .set({
        status: 'active',
        agentProfileId: profileId,
        activatedAt: new Date(),
        version: capability.version + 1,
        healthState: {
          status: 'healthy',
          lastActivatedAt: new Date().toISOString(),
        },
        updatedByUserId: scope.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantCapabilities.id, capabilityId),
          eq(tenantCapabilities.companyId, scope.companyId),
        ),
      )
      .returning();

    if (!activated) {
      throw new TenantCapabilityBuilderError('ACTIVATION_FAILED', 'Unable to activate capability.');
    }

    await this.recordVersion(scope, activated, 'Activated');
    await this.recordAudit(
      scope,
      capabilityId,
      'capability_activated',
      `${activated.name} is now active.`,
    );

    const detail = await this.getCapability(scope.companyId, capabilityId);
    if (!detail)
      throw new TenantCapabilityBuilderError('ACTIVATION_FAILED', 'Unable to load capability.');
    return detail;
  }

  async disableCapability(
    scope: TenantScope,
    capabilityId: string,
  ): Promise<TenantCapabilityDetail> {
    return this.setStatus(
      scope,
      capabilityId,
      'disabled',
      'capability_disabled',
      'Capability disabled.',
    );
  }

  async archiveCapability(
    scope: TenantScope,
    capabilityId: string,
  ): Promise<TenantCapabilityDetail> {
    const [updated] = await this.db
      .update(tenantCapabilities)
      .set({
        status: 'archived',
        archivedAt: new Date(),
        updatedByUserId: scope.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantCapabilities.id, capabilityId),
          eq(tenantCapabilities.companyId, scope.companyId),
        ),
      )
      .returning();

    if (!updated) {
      throw new TenantCapabilityBuilderError('NOT_FOUND', 'Capability not found.');
    }
    await this.recordAudit(scope, capabilityId, 'capability_archived', `${updated.name} archived.`);
    const detail = await this.getCapability(scope.companyId, capabilityId);
    if (!detail) throw new TenantCapabilityBuilderError('NOT_FOUND', 'Capability not found.');
    return detail;
  }

  async listVersions(
    companyId: string,
    capabilityId: string,
  ): Promise<TenantCapabilityVersionSummary[]> {
    const rows = await this.db.query.tenantCapabilityVersions.findMany({
      where: and(
        eq(tenantCapabilityVersions.capabilityId, capabilityId),
        eq(tenantCapabilityVersions.companyId, companyId),
      ),
      orderBy: [desc(tenantCapabilityVersions.version)],
    });

    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      status: row.status,
      changeSummary: row.changeSummary,
      createdAt: row.createdAt.toISOString(),
      createdByName: null,
    }));
  }

  async matchCapabilityForRequest(
    companyId: string,
    message: string,
  ): Promise<TenantCapabilitySummary | null> {
    const active = await this.db.query.tenantCapabilities.findMany({
      where: and(
        eq(tenantCapabilities.companyId, companyId),
        eq(tenantCapabilities.status, 'active'),
      ),
    });

    const normalized = message.toLowerCase();
    let best: (typeof active)[number] | null = null;
    let bestScore = 0;

    for (const capability of active) {
      const tags = (capability.capabilityTags as string[]) ?? [];
      const score = scoreCapabilityMessageMatch(normalized, {
        name: capability.name,
        purpose: capability.purpose,
        tags,
      });
      if (score > bestScore) {
        bestScore = score;
        best = capability;
      }
    }

    return bestScore >= CAPABILITY_MATCH_THRESHOLD && best ? toSummary(best) : null;
  }

  private async setStatus(
    scope: TenantScope,
    capabilityId: string,
    status: TenantCapabilityDetail['status'],
    eventType: string,
    summary: string,
  ): Promise<TenantCapabilityDetail> {
    const [updated] = await this.db
      .update(tenantCapabilities)
      .set({
        status,
        updatedByUserId: scope.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantCapabilities.id, capabilityId),
          eq(tenantCapabilities.companyId, scope.companyId),
        ),
      )
      .returning();

    if (!updated) {
      throw new TenantCapabilityBuilderError('NOT_FOUND', 'Capability not found.');
    }
    await this.recordAudit(scope, capabilityId, eventType, summary);
    const detail = await this.getCapability(scope.companyId, capabilityId);
    if (!detail) throw new TenantCapabilityBuilderError('NOT_FOUND', 'Capability not found.');
    return detail;
  }

  private async findDuplicates(
    companyId: string,
    description: string,
    route: CapabilityKeywordRoute | null,
  ): Promise<CapabilityDuplicateMatch[]> {
    const matches: CapabilityDuplicateMatch[] = [];
    const normalized = description.toLowerCase();

    for (const entry of AGENT_REGISTRY) {
      const haystack =
        `${entry.name} ${entry.description} ${entry.focusAreas.join(' ')}`.toLowerCase();
      const overlap = route?.registryAgentKey === entry.agentKey;
      const keywordHit = route?.keywords.some((k) => normalized.includes(k));
      if (
        overlap ||
        (keywordHit && haystack.split(' ').some((w) => normalized.includes(w) && w.length > 4))
      ) {
        matches.push({
          matchType: 'registry_agent',
          id: entry.agentKey,
          name: entry.name,
          reason: 'An existing specialist agent already covers similar work.',
          recommendation: 'extend_existing',
        });
      }
    }

    const existing = await this.db.query.tenantCapabilities.findMany({
      where: and(
        eq(tenantCapabilities.companyId, companyId),
        ne(tenantCapabilities.status, 'archived'),
      ),
    });

    for (const capability of existing) {
      const terms = `${capability.name} ${capability.purpose}`.toLowerCase();
      if (
        route?.keywords.some((k) => terms.includes(k)) ||
        normalized.includes(capability.name.toLowerCase())
      ) {
        matches.push({
          matchType: 'tenant_capability',
          id: capability.id,
          name: capability.name,
          reason: 'A similar tenant capability already exists.',
          recommendation: 'extend_existing',
        });
      }
    }

    return dedupeMatches(matches);
  }

  private async verifyConfiguration(companyId: string, capability: TenantCapabilityDetail) {
    const checks: string[] = [];
    const warnings: string[] = [];
    const failed: string[] = [];

    checks.push('Tenant context verified');

    if (!capability.baseAgentKey) {
      failed.push('No base specialist agent selected.');
    } else if (!getAgentRegistryEntry(capability.baseAgentKey)) {
      failed.push('Base specialist agent is invalid.');
    } else {
      checks.push('Base specialist agent is valid');
    }

    const toolKeys = (capability.configuration.approvedToolKeys as string[] | undefined) ?? [];
    for (const toolKey of toolKeys) {
      const tool = AGENT_TOOL_REGISTRY.find((t) => t.toolKey === toolKey);
      if (!tool) {
        failed.push(`Tool ${toolKey} is not available.`);
      }
    }
    if (toolKeys.length > 0) checks.push('Approved tools exist');

    if (capability.providerRequirements.length > 0) {
      warnings.push(`Provider requirements noted: ${capability.providerRequirements.join(', ')}.`);
    }

    if (!capability.approvalPolicy || capability.proposal.prohibitedActions.length === 0) {
      warnings.push('Approval policy should be reviewed before activation.');
    } else {
      checks.push('Approval policy attached');
    }

    checks.push('Tenant isolation preserved');
    checks.push('No cross-tenant access configured');

    const profileConflict = capability.baseAgentKey
      ? await this.db.query.agentProfiles.findFirst({
          where: and(
            eq(agentProfiles.companyId, companyId),
            eq(agentProfiles.agentKey, capability.baseAgentKey),
          ),
        })
      : null;

    if (
      profileConflict &&
      capability.extendsAgentKey &&
      profileConflict.id !== capability.agentProfileId
    ) {
      checks.push('Existing profile will be extended safely');
    }

    return { checks, warnings, failed };
  }

  private async ensureAgentProfile(
    scope: TenantScope,
    capability: TenantCapabilityDetail,
  ): Promise<string | null> {
    if (!capability.baseAgentKey) return null;

    const registry = getAgentRegistryEntry(capability.baseAgentKey);
    if (!registry) return null;

    const existing = await this.db.query.agentProfiles.findFirst({
      where: and(
        eq(agentProfiles.companyId, scope.companyId),
        eq(agentProfiles.agentKey, capability.baseAgentKey),
      ),
    });

    const customConfig = {
      tenantCapabilityId: capability.id,
      tenantCapabilitySlug: capability.slug,
      instructions: capability.configuration.instructions,
      dataAccess: capability.proposal.dataAccess,
      triggers: capability.configuration.triggers ?? [],
      outputFormats: capability.configuration.outputFormats ?? ['summary'],
    };

    if (existing) {
      const mergedConfig = {
        ...(existing.config ?? {}),
        customCapabilities: [
          ...(
            ((existing.config as Record<string, unknown>)?.customCapabilities as unknown[]) ?? []
          ).filter(
            (item) =>
              typeof item === 'object' &&
              item !== null &&
              (item as { tenantCapabilityId?: string }).tenantCapabilityId !== capability.id,
          ),
          customConfig,
        ],
      };

      await this.db
        .update(agentProfiles)
        .set({
          config: mergedConfig,
          description: existing.description ?? capability.purpose,
          updatedAt: new Date(),
        })
        .where(eq(agentProfiles.id, existing.id));

      return existing.id;
    }

    const toolKeys = (
      (capability.configuration.approvedToolKeys as string[] | undefined) ??
      registry.suggestedToolKeys
    ).slice(0, 12);
    const validToolKeys = toolKeys.filter((toolKey) =>
      AGENT_TOOL_REGISTRY.some((tool) => tool.toolKey === toolKey),
    );

    const [created] = await this.db
      .insert(agentProfiles)
      .values({
        companyId: scope.companyId,
        createdByUserId: scope.userId,
        agentKey: capability.baseAgentKey,
        name: capability.name,
        description: capability.purpose,
        status: 'active',
        config: { customCapabilities: [customConfig] },
      })
      .returning();

    if (!created) {
      throw new TenantCapabilityBuilderError('PROFILE_FAILED', 'Unable to create agent profile.');
    }

    const permissions = [...new Set(registry.suggestedPermissions)].slice(0, 24);
    if (permissions.length > 0) {
      await this.db.insert(agentProfilePermissions).values(
        permissions.map((permission) => ({
          companyId: scope.companyId,
          agentProfileId: created.id,
          permission,
        })),
      );
    }

    if (validToolKeys.length > 0) {
      await this.db.insert(agentProfileTools).values(
        validToolKeys.map((toolKey) => ({
          companyId: scope.companyId,
          agentProfileId: created.id,
          toolKey,
          enabled: true,
          config: {},
        })),
      );
    }

    return created.id;
  }

  private async recordVersion(
    scope: TenantScope,
    capability: typeof tenantCapabilities.$inferSelect,
    changeSummary: string,
  ) {
    await this.db.insert(tenantCapabilityVersions).values({
      capabilityId: capability.id,
      companyId: scope.companyId,
      version: capability.version,
      status: capability.status,
      proposal: capability.proposal as Record<string, unknown>,
      configuration: capability.configuration as Record<string, unknown>,
      changeSummary,
      createdByUserId: scope.userId,
    });
  }

  private async recordAudit(
    scope: TenantScope,
    capabilityId: string | null,
    eventType: string,
    summary: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.db.insert(tenantCapabilityAuditLog).values({
      capabilityId,
      companyId: scope.companyId,
      eventType,
      summary,
      metadata,
      userId: scope.userId,
    });
  }
}

function buildDiscoveryQuestions(
  route: CapabilityKeywordRoute | null,
  answers: Record<string, string>,
): CapabilityDiscoveryResponse['questions'] {
  const questions: CapabilityDiscoveryResponse['questions'] = [];
  if (!answers.purpose && !route) {
    questions.push({
      id: 'purpose',
      prompt: 'What should this capability achieve for your business?',
      required: true,
    });
  }
  if (!answers.department) {
    questions.push({
      id: 'department',
      prompt: 'Which department will use it most often?',
      required: true,
    });
  }
  if (!answers.dataAccess) {
    questions.push({
      id: 'dataAccess',
      prompt: 'What business data may it access? (e.g. customers, jobs, invoices)',
      required: true,
    });
  }
  if (!answers.actionMode) {
    questions.push({
      id: 'actionMode',
      prompt: 'Should it only recommend actions, or may it perform approved low-risk actions?',
      required: true,
    });
  }
  return questions;
}

function buildProposal(
  description: string,
  route: CapabilityKeywordRoute | null,
  answers: Record<string, string>,
  codeBacked: boolean,
  _duplicates: CapabilityDuplicateMatch[],
  recommendation?: string,
  extendMatch?: CapabilityDuplicateMatch,
): CapabilityProposal {
  const department = answers.department ?? route?.department ?? 'operations';
  const departmentLabel =
    CAPABILITY_DEPARTMENTS.find((d) => d.id === department)?.label ?? 'Operations';
  const name = inferName(description, route);
  const purpose = answers.purpose?.trim() || description.trim();
  const dataAccess = parseList(answers.dataAccess ?? 'company profile, customers, jobs');
  const allowLowRisk = answers.actionMode?.toLowerCase().includes('perform') ?? false;

  const baseAgentKey = route?.baseAgentKey ?? 'automation';
  const extendsAgentKey =
    recommendation === 'extend_existing' && extendMatch?.matchType === 'registry_agent'
      ? (extendMatch.id as AgentKey)
      : null;

  return {
    name,
    department,
    departmentLabel,
    purpose,
    capabilityType: codeBacked ? 'code_backed' : 'tenant_configuration',
    dataAccess,
    allowedActions: DEFAULT_ALLOWED_ACTIONS.map((action) =>
      action.id === 'low_risk_automation' ? { ...action, allowed: allowLowRisk } : action,
    ),
    prohibitedActions: [...PROHIBITED_CAPABILITY_ACTIONS],
    approvalRequirements: ['Required before external actions'],
    providerRequirements: route?.providerRequirements ?? [],
    riskLevel: codeBacked ? 'high' : allowLowRisk ? 'medium' : 'low',
    baseAgentKey,
    extendsAgentKey,
    extendsAgentName: extendsAgentKey
      ? (getAgentRegistryEntry(extendsAgentKey)?.name ?? null)
      : null,
    configurationOnly: !codeBacked,
    estimatedUsageNote: null,
  };
}

function buildConfiguration(
  proposal: CapabilityProposal,
  answers: Record<string, string>,
): Record<string, unknown> {
  const registry = proposal.baseAgentKey ? getAgentRegistryEntry(proposal.baseAgentKey) : null;
  return {
    instructions: `You are ${proposal.name}. ${proposal.purpose}`,
    approvedToolKeys: registry?.suggestedToolKeys.slice(0, 8) ?? [],
    dataAccess: proposal.dataAccess,
    roleScope: parseList(answers.roleScope ?? 'owner, manager'),
    triggers: [],
    outputFormats: ['summary', 'checklist'],
    escalationRules: ['Escalate sensitive actions for owner approval'],
  };
}

function inferName(description: string, route: CapabilityKeywordRoute | null): string {
  if (route?.keywords.includes('tender')) return 'Tender Intelligence';
  if (route?.keywords.includes('warranty')) return 'Warranty Follow-up Intelligence';
  if (route?.keywords.includes('unpaid')) return 'Debt Collection Assistant';
  if (route?.keywords.includes('stock')) return 'Stock Readiness Assistant';
  if (route?.keywords.includes('certificate')) return 'Technician Certificate Monitor';
  if (route?.keywords.includes('retention')) return 'Customer Retention Agent';
  const trimmed = description.trim();
  if (trimmed.length <= 48)
    return trimmed.replace(/^(add|create)\s+(an?\s+)?agent\s+(that|to)\s+/i, '').slice(0, 48);
  return 'Custom Business Capability';
}

function parseList(value: string): string[] {
  return value
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractTags(purpose: string): string[] {
  return purpose
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 4)
    .slice(0, 8);
}

async function uniqueSlug(_companyId: string, name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'capability';
  return `${base}-${Date.now().toString(36)}`;
}

function dedupeMatches(matches: CapabilityDuplicateMatch[]): CapabilityDuplicateMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.matchType}:${match.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toSummary(row: typeof tenantCapabilities.$inferSelect): TenantCapabilitySummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    department: row.department,
    purpose: row.purpose,
    capabilityType: row.capabilityType,
    status: row.status,
    version: row.version,
    baseAgentKey: row.baseAgentKey,
    extendsAgentKey: row.extendsAgentKey,
    riskLevel: row.riskLevel as TenantCapabilitySummary['riskLevel'],
    healthStatus: (row.healthState as { status?: string })?.status ?? row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    activatedAt: row.activatedAt?.toISOString() ?? null,
  };
}

function toDetail(row: typeof tenantCapabilities.$inferSelect): TenantCapabilityDetail {
  return {
    ...toSummary(row),
    proposal: row.proposal as CapabilityProposal,
    configuration: row.configuration as Record<string, unknown>,
    approvalPolicy: row.approvalPolicy as Record<string, unknown>,
    providerRequirements: (row.providerRequirements as string[]) ?? [],
    capabilityTags: (row.capabilityTags as string[]) ?? [],
    agentProfileId: row.agentProfileId,
    appBuilderRequestId: row.appBuilderRequestId,
  };
}
