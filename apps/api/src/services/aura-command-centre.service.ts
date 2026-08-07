import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { isCompanyOwnerRole, isPlatformOwnerRole } from '@titan/auth';
import type {
  AuraCommandActionDraft,
  AuraCommandAgentRegistryEntry,
  AuraCommandCentreDashboard,
  AuraCommandEventItem,
  AuraCommandFollowUp,
  AuraCommandHandoffSummary,
  AuraCommandMemoryEntry,
  CreateAuraCommandActionDraftRequest,
  CreateAuraCommandFollowUpRequest,
  CreateAuraCommandHandoffRequest,
  CreateAuraCommandMemoryRequest,
  DecideAuraCommandRequest,
  UpdateAuraCommandMemoryRequest,
} from '@titan/shared';
import {
  AURA_COMMAND_AGENT_EXISTING_KEY,
  AURA_COMMAND_AGENT_KEYS,
  AURA_COMMAND_AGENT_LABELS,
  AURA_COMMAND_CENTRE_GUARANTEES,
  AURA_COMMAND_UNDERSTANDS_MODULES,
  auraCommandDepartmentAvailability,
  auraCommandDepartmentGap,
  canAccessAuraCommandCentre,
  canDecideAuraCommandCentre,
  canWriteAuraCommandCentre,
  defaultAuraCommandAgentCapabilities,
  isAuraCommandAgentKey,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  agentTasks,
  auraCommandActionDrafts,
  auraCommandAgentRegistry,
  auraCommandFollowUps,
  auraCommandHandoffs,
  auraCommandMemory,
  auraMemory,
  invoices,
  jobs,
  securityAuditLogs,
  vehicles,
} from '@titan/db';

export class AuraCommandCentreError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuraCommandCentreError';
  }
}

export type AuraCommandCentreActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

type ServiceDeps = {
  db: DatabaseClient;
};

const PRIVATE_CONTEXT_KEYS = [
  'personalWhatsapp',
  'personal_whatsapp',
  'personalWa',
  'personal_wa',
  'privateMessage',
  'private_message',
  'waPrivate',
  'personalThread',
] as const;

function assertAccess(actor: AuraCommandCentreActor): void {
  if (
    !canAccessAuraCommandCentre({
      roleName: actor.roleName,
      permissions: actor.permissions,
    })
  ) {
    throw new AuraCommandCentreError(
      'FORBIDDEN',
      'AURA Command Centre requires agents/intelligence read access or Owner role',
    );
  }
}

function assertWrite(actor: AuraCommandCentreActor): void {
  if (
    !canWriteAuraCommandCentre({
      roleName: actor.roleName,
      permissions: actor.permissions,
    })
  ) {
    throw new AuraCommandCentreError(
      'FORBIDDEN',
      'AURA Command Centre write requires agents/intelligence write or Owner role',
    );
  }
}

function assertDecide(actor: AuraCommandCentreActor): void {
  if (
    !canDecideAuraCommandCentre({
      roleName: actor.roleName,
      permissions: actor.permissions,
    }) &&
    !isCompanyOwnerRole({ roleName: actor.roleName, permissions: actor.permissions }) &&
    !isPlatformOwnerRole({ roleName: actor.roleName, permissions: actor.permissions })
  ) {
    throw new AuraCommandCentreError(
      'FORBIDDEN',
      'Only the company Owner or Platform Owner may approve Command Centre actions and handoffs',
    );
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function sanitizeContextPayload(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const lower = key.toLowerCase();
    if (PRIVATE_CONTEXT_KEYS.some((blocked) => lower.includes(blocked.toLowerCase()))) {
      continue;
    }
    if (lower.includes('personal') && lower.includes('whatsapp')) continue;
    out[key] = value;
  }
  return out;
}

function toMemoryEntry(row: typeof auraCommandMemory.$inferSelect): AuraCommandMemoryEntry {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    status: row.status,
    sourceModule: row.sourceModule,
    importance: row.importance,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    decidedAt: toIso(row.decidedAt),
  };
}

function toHandoff(row: typeof auraCommandHandoffs.$inferSelect): AuraCommandHandoffSummary {
  const fromAgentKey: AuraCommandHandoffSummary['fromAgentKey'] = isAuraCommandAgentKey(
    row.fromAgentKey,
  )
    ? row.fromAgentKey
    : 'executive';
  return {
    id: row.id,
    fromAgentKey,
    toAgentKey: row.toAgentKey,
    contextSummary: row.contextSummary,
    status: row.status,
    approvalRequired: true,
    autoExecuted: false,
    createdAt: row.createdAt.toISOString(),
    decidedAt: toIso(row.decidedAt),
    decisionNotes: row.decisionNotes,
  };
}

function toActionDraft(row: typeof auraCommandActionDrafts.$inferSelect): AuraCommandActionDraft {
  const dept = isAuraCommandAgentKey(row.departmentKey)
    ? row.departmentKey
    : ('executive' as const);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    departmentKey: dept,
    status: row.status,
    approvalRequired: true,
    autoExecuted: false,
    createdAt: row.createdAt.toISOString(),
    decidedAt: toIso(row.decidedAt),
    decisionNotes: row.decisionNotes,
  };
}

function toFollowUp(row: typeof auraCommandFollowUps.$inferSelect): AuraCommandFollowUp {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueAt: toIso(row.dueAt),
    status: row.status,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    completedAt: toIso(row.completedAt),
  };
}

export class AuraCommandCentreService {
  constructor(private readonly deps: ServiceDeps) {}

  private async writeAudit(
    actor: AuraCommandCentreActor,
    action: string,
    entityType: string,
    entityId: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.deps.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'workflow',
      action,
      entityType,
      entityId,
      userId: actor.userId,
      metadata: {
        module: 'aura_command_centre',
        autoExecuted: false,
        neverSourcesPersonalWhatsappPrivate: true,
        noDemoData: true,
        noFakeAnalytics: true,
        ...metadata,
      },
    });
  }

  async getDashboard(actor: AuraCommandCentreActor): Promise<AuraCommandCentreDashboard> {
    assertAccess(actor);

    const [
      openJobsRow,
      outstandingInvoicesRow,
      pendingAgentTasksRow,
      fleetIssuesRow,
      commandMemoryCountRow,
      legacyMemoryCountRow,
      openFollowUpsRow,
      recentMemoryRows,
      handoffRows,
      actionRows,
      followUpRows,
      registryRows,
      pendingTaskSamples,
    ] = await Promise.all([
      this.deps.db
        .select({ value: count() })
        .from(jobs)
        .where(
          and(
            eq(jobs.companyId, actor.companyId),
            inArray(jobs.status, ['new', 'scheduled', 'in_progress']),
          ),
        ),
      this.deps.db
        .select({ value: count() })
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, actor.companyId),
            inArray(invoices.status, ['sent', 'partial', 'overdue']),
          ),
        ),
      this.deps.db
        .select({ value: count() })
        .from(agentTasks)
        .where(
          and(
            eq(agentTasks.companyId, actor.companyId),
            eq(agentTasks.status, 'pending_approval'),
          ),
        ),
      this.deps.db
        .select({ value: count() })
        .from(vehicles)
        .where(
          and(
            eq(vehicles.companyId, actor.companyId),
            inArray(vehicles.status, ['maintenance', 'out_of_service']),
          ),
        ),
      this.deps.db
        .select({ value: count() })
        .from(auraCommandMemory)
        .where(
          and(
            eq(auraCommandMemory.companyId, actor.companyId),
            eq(auraCommandMemory.status, 'active'),
            eq(auraCommandMemory.enabled, true),
          ),
        ),
      this.deps.db
        .select({ value: count() })
        .from(auraMemory)
        .where(and(eq(auraMemory.companyId, actor.companyId), eq(auraMemory.enabled, true))),
      this.deps.db
        .select({ value: count() })
        .from(auraCommandFollowUps)
        .where(
          and(
            eq(auraCommandFollowUps.companyId, actor.companyId),
            eq(auraCommandFollowUps.status, 'open'),
          ),
        ),
      this.deps.db.query.auraCommandMemory.findMany({
        where: and(
          eq(auraCommandMemory.companyId, actor.companyId),
          eq(auraCommandMemory.enabled, true),
        ),
        orderBy: [desc(auraCommandMemory.updatedAt)],
        limit: 8,
      }),
      this.deps.db.query.auraCommandHandoffs.findMany({
        where: eq(auraCommandHandoffs.companyId, actor.companyId),
        orderBy: [desc(auraCommandHandoffs.createdAt)],
        limit: 8,
      }),
      this.deps.db.query.auraCommandActionDrafts.findMany({
        where: and(
          eq(auraCommandActionDrafts.companyId, actor.companyId),
          inArray(auraCommandActionDrafts.status, ['draft', 'pending_approval']),
        ),
        orderBy: [desc(auraCommandActionDrafts.createdAt)],
        limit: 12,
      }),
      this.deps.db.query.auraCommandFollowUps.findMany({
        where: and(
          eq(auraCommandFollowUps.companyId, actor.companyId),
          eq(auraCommandFollowUps.status, 'open'),
        ),
        orderBy: [desc(auraCommandFollowUps.createdAt)],
        limit: 12,
      }),
      this.deps.db.query.auraCommandAgentRegistry.findMany({
        where: eq(auraCommandAgentRegistry.companyId, actor.companyId),
      }),
      this.deps.db.query.agentTasks.findMany({
        where: and(
          eq(agentTasks.companyId, actor.companyId),
          eq(agentTasks.status, 'pending_approval'),
        ),
        orderBy: [desc(agentTasks.createdAt)],
        limit: 8,
      }),
    ]);

    const openJobs = Number(openJobsRow[0]?.value ?? 0);
    const outstandingInvoices = Number(outstandingInvoicesRow[0]?.value ?? 0);
    const pendingApprovals = Number(pendingAgentTasksRow[0]?.value ?? 0) + actionRows.length;
    const fleetIssues = Number(fleetIssuesRow[0]?.value ?? 0);
    const memoryEntries =
      Number(commandMemoryCountRow[0]?.value ?? 0) + Number(legacyMemoryCountRow[0]?.value ?? 0);
    const openFollowUps = Number(openFollowUpsRow[0]?.value ?? 0);

    const healthNotes: string[] = [
      'Signals are counted from live tenant tables only — no demo analytics.',
      'Personal WhatsApp private content is never included in Command Centre context.',
    ];
    if (pendingApprovals === 0 && actionRows.length === 0) {
      healthNotes.push('No pending Command Centre or agent task approvals right now.');
    }

    const pendingApprovalEvents: AuraCommandEventItem[] = [
      ...pendingTaskSamples.map((task) => ({
        id: `agent-task-${task.id}`,
        kind: 'approval' as const,
        title: `Agent task pending: ${task.taskType}`,
        detail: 'Existing AURA agent task awaiting Owner approval.',
        department: 'executive' as const,
        createdAt: toIso(task.createdAt),
        href: '/aura',
      })),
      ...actionRows.map((draft) => ({
        id: `action-${draft.id}`,
        kind: 'approval' as const,
        title: draft.title,
        detail: draft.description,
        department: (isAuraCommandAgentKey(draft.departmentKey)
          ? draft.departmentKey
          : 'executive') as AuraCommandEventItem['department'],
        createdAt: toIso(draft.createdAt),
        href: '/aura/command-centre',
      })),
    ];

    const risks: AuraCommandEventItem[] = [];
    if (outstandingInvoices > 0) {
      risks.push({
        id: 'risk-receivables',
        kind: 'risk',
        title: `${outstandingInvoices} outstanding invoice${outstandingInvoices === 1 ? '' : 's'}`,
        detail: 'Real receivables rows in sent/partial/overdue status.',
        department: 'finance',
        createdAt: null,
        href: '/finance/invoices',
      });
    }
    if (fleetIssues > 0) {
      risks.push({
        id: 'risk-fleet',
        kind: 'risk',
        title: `${fleetIssues} fleet vehicle${fleetIssues === 1 ? '' : 's'} unavailable`,
        detail: 'Vehicles currently in maintenance or out of service.',
        department: 'fleet',
        createdAt: null,
        href: '/fleet',
      });
    }

    const opportunities: AuraCommandEventItem[] = [];
    if (openJobs === 0 && outstandingInvoices === 0) {
      opportunities.push({
        id: 'opp-capacity',
        kind: 'opportunity',
        title: 'Capacity available for new work',
        detail:
          'No open operational jobs and no outstanding invoices were found — opportunity signals remain advisory.',
        department: 'sales',
        createdAt: null,
        href: '/leads',
      });
    }

    const recommendations: AuraCommandEventItem[] = [
      {
        id: 'rec-chat',
        kind: 'recommendation',
        title: 'Ask AURA Executive Chat about today’s priorities',
        detail: 'Chat understands Customers, Jobs, Quotes, Invoices, Payments, Fleet, Inventory, Communications, Maintenance, and Reports from real context.',
        department: 'executive',
        createdAt: null,
        href: '/aura',
      },
    ];
    if (pendingApprovals > 0) {
      recommendations.push({
        id: 'rec-approvals',
        kind: 'recommendation',
        title: 'Review pending approvals before new outbound work',
        detail: 'Command Centre and agent tasks stay draft until Owner approval — never auto-executed.',
        department: 'executive',
        createdAt: null,
        href: '/aura/command-centre',
      });
    }

    const importantEvents: AuraCommandEventItem[] = [
      ...pendingApprovalEvents.slice(0, 5),
      ...risks,
      ...recentMemoryRows.slice(0, 3).map((row) => ({
        id: `memory-${row.id}`,
        kind: 'memory' as const,
        title: row.title,
        detail: row.content.slice(0, 180),
        department: 'executive' as const,
        createdAt: toIso(row.updatedAt),
        href: '/aura/command-centre',
      })),
    ];

    const registryByKey = new Map(registryRows.map((row) => [row.agentKey, row]));
    const agentRegistry: AuraCommandAgentRegistryEntry[] = AURA_COMMAND_AGENT_KEYS.map(
      (agentKey) => {
        const tenant = registryByKey.get(agentKey);
        return {
          agentKey,
          label: AURA_COMMAND_AGENT_LABELS[agentKey],
          status: tenant?.status ?? 'planned',
          existingAgentKey: AURA_COMMAND_AGENT_EXISTING_KEY[agentKey],
          foundationOnly: true as const,
          capabilities: Array.isArray(tenant?.capabilities)
            ? tenant!.capabilities
            : defaultAuraCommandAgentCapabilities(agentKey),
          notes: tenant?.notes ?? null,
          tenantRowId: tenant?.id ?? null,
        };
      },
    );

    const departments = AURA_COMMAND_AGENT_KEYS.map((agentKey) => {
      const availability = auraCommandDepartmentAvailability(agentKey);
      let signalCount: number | null = null;
      if (agentKey === 'finance') signalCount = outstandingInvoices;
      if (agentKey === 'operations') signalCount = openJobs;
      if (agentKey === 'fleet') signalCount = fleetIssues;
      if (agentKey === 'sales') signalCount = openJobs;
      return {
        department: agentKey,
        label: AURA_COMMAND_AGENT_LABELS[agentKey],
        availability,
        summary:
          availability === 'live_signals'
            ? 'Connected to live TITAN tables where available.'
            : availability === 'partial_signals'
              ? 'Partial live signals; full department agent not complete.'
              : 'Registry foundation only — specialist agent not implemented.',
        signalCount,
        honestGap: auraCommandDepartmentGap(agentKey),
      };
    });

    const followUps = followUpRows.map(toFollowUp);
    const dashboard: AuraCommandCentreDashboard = {
      summary:
        pendingApprovals > 0
          ? `Command Centre: ${pendingApprovals} pending approval item(s), ${openJobs} open job(s), ${outstandingInvoices} outstanding invoice(s).`
          : `Command Centre ready — ${openJobs} open job(s), ${outstandingInvoices} outstanding invoice(s), ${memoryEntries} memory entr${memoryEntries === 1 ? 'y' : 'ies'}.`,
      health: {
        openJobs,
        outstandingInvoices,
        pendingApprovals,
        fleetIssues,
        memoryEntries,
        openFollowUps,
        hasLiveSignals: true,
        notes: healthNotes,
      },
      importantEvents,
      pendingApprovals: pendingApprovalEvents,
      risks,
      opportunities,
      recommendations,
      departments,
      executiveAssistant: {
        dailyPriorities: [
          {
            id: 'priority-jobs',
            title: 'Operational load',
            detail: `${openJobs} open job(s) in new/scheduled/in_progress.`,
            href: '/jobs',
          },
          {
            id: 'priority-finance',
            title: 'Receivables attention',
            detail: `${outstandingInvoices} outstanding invoice(s).`,
            href: '/finance/invoices',
          },
          {
            id: 'priority-approvals',
            title: 'Approvals queue',
            detail: `${pendingApprovals} item(s) waiting for Owner decision.`,
            href: '/aura/command-centre',
          },
        ],
        businessQuestions: [
          {
            id: 'q-cash',
            question: 'Which invoices need follow-up this week?',
            context: 'Ask in AURA Executive Chat — uses real invoice context when permitted.',
          },
          {
            id: 'q-ops',
            question: 'What is blocking today’s jobs?',
            context: 'Operations signals come from live jobs/scheduling when available.',
          },
        ],
        recommendations: recommendations.map((item) => ({
          id: item.id,
          title: item.title,
          detail: item.detail,
          draftOnly: true as const,
        })),
        followUps,
        planningSupport: {
          mode: 'draft',
          summary:
            'Planning support is draft-level. Use Today’s Plan and AURA Executive Chat for deeper day planning; Command Centre does not auto-schedule work.',
          linkedSurfaces: [
            { label: 'AURA Executive Chat', href: '/aura' },
            { label: "Today's Plan", href: '/aura/todays-plan' },
            { label: 'AURA Team', href: '/aura/agents' },
          ],
        },
      },
      agentRegistry,
      recentMemory: recentMemoryRows.map(toMemoryEntry),
      recentHandoffs: handoffRows.map(toHandoff),
      pendingActionDrafts: actionRows.map(toActionDraft),
      chatIntegration: {
        auraChatHref: '/aura',
        understandsModules: [...AURA_COMMAND_UNDERSTANDS_MODULES],
        actionsAreDraftUntilApproved: true,
      },
      guarantees: AURA_COMMAND_CENTRE_GUARANTEES,
    };

    await this.writeAudit(actor, 'aura_command_centre.dashboard.read', 'aura_command_centre', null, {
      openJobs,
      outstandingInvoices,
      pendingApprovals,
    });

    return dashboard;
  }

  async listMemory(actor: AuraCommandCentreActor): Promise<AuraCommandMemoryEntry[]> {
    assertAccess(actor);
    const rows = await this.deps.db.query.auraCommandMemory.findMany({
      where: eq(auraCommandMemory.companyId, actor.companyId),
      orderBy: [desc(auraCommandMemory.updatedAt)],
      limit: 100,
    });
    return rows.map(toMemoryEntry);
  }

  async createMemory(
    actor: AuraCommandCentreActor,
    input: CreateAuraCommandMemoryRequest,
  ): Promise<AuraCommandMemoryEntry> {
    assertWrite(actor);
    const [row] = await this.deps.db
      .insert(auraCommandMemory)
      .values({
        companyId: actor.companyId,
        kind: input.kind,
        title: input.title.trim(),
        content: input.content.trim(),
        sourceModule: input.sourceModule ?? null,
        importance: input.importance ?? 3,
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId,
        decidedByUserId: input.kind === 'approved_decision' ? actor.userId : null,
        decidedAt: input.kind === 'approved_decision' ? new Date() : null,
      })
      .returning();
    await this.writeAudit(actor, 'aura_command_centre.memory.created', 'aura_command_memory', row.id, {
      kind: row.kind,
    });
    return toMemoryEntry(row);
  }

  async updateMemory(
    actor: AuraCommandCentreActor,
    memoryId: string,
    input: UpdateAuraCommandMemoryRequest,
  ): Promise<AuraCommandMemoryEntry> {
    assertWrite(actor);
    const existing = await this.deps.db.query.auraCommandMemory.findFirst({
      where: and(
        eq(auraCommandMemory.id, memoryId),
        eq(auraCommandMemory.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new AuraCommandCentreError('NOT_FOUND', 'Command Centre memory entry not found');
    }
    const [row] = await this.deps.db
      .update(auraCommandMemory)
      .set({
        title: input.title?.trim() ?? existing.title,
        content: input.content?.trim() ?? existing.content,
        status: input.status ?? existing.status,
        importance: input.importance ?? existing.importance,
        enabled: input.enabled ?? existing.enabled,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(
        and(eq(auraCommandMemory.id, memoryId), eq(auraCommandMemory.companyId, actor.companyId)),
      )
      .returning();
    await this.writeAudit(actor, 'aura_command_centre.memory.updated', 'aura_command_memory', row.id);
    return toMemoryEntry(row);
  }

  async listHandoffs(actor: AuraCommandCentreActor): Promise<AuraCommandHandoffSummary[]> {
    assertAccess(actor);
    const rows = await this.deps.db.query.auraCommandHandoffs.findMany({
      where: eq(auraCommandHandoffs.companyId, actor.companyId),
      orderBy: [desc(auraCommandHandoffs.createdAt)],
      limit: 50,
    });
    return rows.map(toHandoff);
  }

  async createHandoff(
    actor: AuraCommandCentreActor,
    input: CreateAuraCommandHandoffRequest,
  ): Promise<AuraCommandHandoffSummary> {
    assertWrite(actor);
    if (!isAuraCommandAgentKey(input.toAgentKey)) {
      throw new AuraCommandCentreError('VALIDATION', 'Invalid target agent key');
    }
    const [row] = await this.deps.db
      .insert(auraCommandHandoffs)
      .values({
        companyId: actor.companyId,
        fromAgentKey: input.fromAgentKey ?? 'executive',
        toAgentKey: input.toAgentKey,
        contextSummary: input.contextSummary.trim(),
        contextPayload: sanitizeContextPayload(input.contextPayload),
        status: 'pending_approval',
        approvalRequired: true,
        autoExecuted: false,
        requestedByUserId: actor.userId,
      })
      .returning();
    await this.writeAudit(
      actor,
      'aura_command_centre.handoff.created',
      'aura_command_handoff',
      row.id,
      { toAgentKey: row.toAgentKey, autoExecuted: false },
    );
    return toHandoff(row);
  }

  async decideHandoff(
    actor: AuraCommandCentreActor,
    handoffId: string,
    input: DecideAuraCommandRequest,
  ): Promise<AuraCommandHandoffSummary> {
    assertDecide(actor);
    const existing = await this.deps.db.query.auraCommandHandoffs.findFirst({
      where: and(
        eq(auraCommandHandoffs.id, handoffId),
        eq(auraCommandHandoffs.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new AuraCommandCentreError('NOT_FOUND', 'Handoff not found');
    }
    if (existing.status !== 'pending_approval' && existing.status !== 'draft') {
      throw new AuraCommandCentreError('CONFLICT', 'Handoff is not awaiting approval');
    }
    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const [row] = await this.deps.db
      .update(auraCommandHandoffs)
      .set({
        status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes?.trim() || null,
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(auraCommandHandoffs.id, handoffId),
          eq(auraCommandHandoffs.companyId, actor.companyId),
        ),
      )
      .returning();
    await this.writeAudit(
      actor,
      input.decision === 'approve'
        ? 'aura_command_centre.handoff.approved'
        : 'aura_command_centre.handoff.rejected',
      'aura_command_handoff',
      row.id,
      { autoExecuted: false },
    );
    return toHandoff(row);
  }

  async listActionDrafts(actor: AuraCommandCentreActor): Promise<AuraCommandActionDraft[]> {
    assertAccess(actor);
    const rows = await this.deps.db.query.auraCommandActionDrafts.findMany({
      where: eq(auraCommandActionDrafts.companyId, actor.companyId),
      orderBy: [desc(auraCommandActionDrafts.createdAt)],
      limit: 50,
    });
    return rows.map(toActionDraft);
  }

  async createActionDraft(
    actor: AuraCommandCentreActor,
    input: CreateAuraCommandActionDraftRequest,
  ): Promise<AuraCommandActionDraft> {
    assertWrite(actor);
    const [row] = await this.deps.db
      .insert(auraCommandActionDrafts)
      .values({
        companyId: actor.companyId,
        title: input.title.trim(),
        description: input.description.trim(),
        departmentKey: input.departmentKey ?? 'executive',
        suggestedAction: sanitizeContextPayload(input.suggestedAction),
        status: 'pending_approval',
        approvalRequired: true,
        autoExecuted: false,
        createdByUserId: actor.userId,
      })
      .returning();
    await this.writeAudit(
      actor,
      'aura_command_centre.action.created',
      'aura_command_action_draft',
      row.id,
      { autoExecuted: false },
    );
    return toActionDraft(row);
  }

  async decideActionDraft(
    actor: AuraCommandCentreActor,
    draftId: string,
    input: DecideAuraCommandRequest,
  ): Promise<AuraCommandActionDraft> {
    assertDecide(actor);
    const existing = await this.deps.db.query.auraCommandActionDrafts.findFirst({
      where: and(
        eq(auraCommandActionDrafts.id, draftId),
        eq(auraCommandActionDrafts.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new AuraCommandCentreError('NOT_FOUND', 'Action draft not found');
    }
    if (existing.status !== 'pending_approval' && existing.status !== 'draft') {
      throw new AuraCommandCentreError('CONFLICT', 'Action draft is not awaiting approval');
    }
    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const [row] = await this.deps.db
      .update(auraCommandActionDrafts)
      .set({
        status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes?.trim() || null,
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(auraCommandActionDrafts.id, draftId),
          eq(auraCommandActionDrafts.companyId, actor.companyId),
        ),
      )
      .returning();
    await this.writeAudit(
      actor,
      input.decision === 'approve'
        ? 'aura_command_centre.action.approved'
        : 'aura_command_centre.action.rejected',
      'aura_command_action_draft',
      row.id,
      { autoExecuted: false },
    );
    return toActionDraft(row);
  }

  async listFollowUps(actor: AuraCommandCentreActor): Promise<AuraCommandFollowUp[]> {
    assertAccess(actor);
    const rows = await this.deps.db.query.auraCommandFollowUps.findMany({
      where: eq(auraCommandFollowUps.companyId, actor.companyId),
      orderBy: [desc(auraCommandFollowUps.createdAt)],
      limit: 50,
    });
    return rows.map(toFollowUp);
  }

  async createFollowUp(
    actor: AuraCommandCentreActor,
    input: CreateAuraCommandFollowUpRequest,
  ): Promise<AuraCommandFollowUp> {
    assertWrite(actor);
    const [row] = await this.deps.db
      .insert(auraCommandFollowUps)
      .values({
        companyId: actor.companyId,
        title: input.title.trim(),
        notes: input.notes?.trim() || null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        source: input.source ?? 'command_centre',
        status: 'open',
        createdByUserId: actor.userId,
      })
      .returning();
    await this.writeAudit(
      actor,
      'aura_command_centre.follow_up.created',
      'aura_command_follow_up',
      row.id,
    );
    return toFollowUp(row);
  }

  async completeFollowUp(
    actor: AuraCommandCentreActor,
    followUpId: string,
  ): Promise<AuraCommandFollowUp> {
    assertWrite(actor);
    const existing = await this.deps.db.query.auraCommandFollowUps.findFirst({
      where: and(
        eq(auraCommandFollowUps.id, followUpId),
        eq(auraCommandFollowUps.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new AuraCommandCentreError('NOT_FOUND', 'Follow-up not found');
    }
    const [row] = await this.deps.db
      .update(auraCommandFollowUps)
      .set({
        status: 'done',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(auraCommandFollowUps.id, followUpId),
          eq(auraCommandFollowUps.companyId, actor.companyId),
        ),
      )
      .returning();
    await this.writeAudit(
      actor,
      'aura_command_centre.follow_up.completed',
      'aura_command_follow_up',
      row.id,
    );
    return toFollowUp(row);
  }

  async listAgentRegistry(
    actor: AuraCommandCentreActor,
  ): Promise<AuraCommandAgentRegistryEntry[]> {
    assertAccess(actor);
    const registryRows = await this.deps.db.query.auraCommandAgentRegistry.findMany({
      where: eq(auraCommandAgentRegistry.companyId, actor.companyId),
    });
    const registryByKey = new Map(registryRows.map((row) => [row.agentKey, row]));
    return AURA_COMMAND_AGENT_KEYS.map((agentKey) => {
      const tenant = registryByKey.get(agentKey);
      return {
        agentKey,
        label: AURA_COMMAND_AGENT_LABELS[agentKey],
        status: tenant?.status ?? 'planned',
        existingAgentKey: AURA_COMMAND_AGENT_EXISTING_KEY[agentKey],
        foundationOnly: true as const,
        capabilities: Array.isArray(tenant?.capabilities)
          ? tenant!.capabilities
          : defaultAuraCommandAgentCapabilities(agentKey),
        notes: tenant?.notes ?? null,
        tenantRowId: tenant?.id ?? null,
      };
    });
  }

  async ensureAgentRegistry(actor: AuraCommandCentreActor): Promise<AuraCommandAgentRegistryEntry[]> {
    assertWrite(actor);
    const existing = await this.deps.db.query.auraCommandAgentRegistry.findMany({
      where: eq(auraCommandAgentRegistry.companyId, actor.companyId),
    });
    const have = new Set(existing.map((row) => row.agentKey));
    const missing = AURA_COMMAND_AGENT_KEYS.filter((key) => !have.has(key));
    if (missing.length > 0) {
      await this.deps.db.insert(auraCommandAgentRegistry).values(
        missing.map((agentKey) => ({
          companyId: actor.companyId,
          agentKey,
          status: 'planned' as const,
          capabilities: defaultAuraCommandAgentCapabilities(agentKey),
          notes: 'Foundation registry row — specialist agent not fully implemented.',
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
        })),
      );
    }
    await this.writeAudit(
      actor,
      'aura_command_centre.registry.ensured',
      'aura_command_agent_registry',
      null,
      { seeded: missing.length },
    );
    return this.listAgentRegistry(actor);
  }
}
