import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { isCompanyOwnerRole as isOwnerRole } from '@titan/auth';
import type {
  CompleteMaintenanceCycleRequest,
  CreateMaintenanceCommRequest,
  CreateRecurringMaintenancePlanRequest,
  OpsMaintenanceAuraSuggestionSummary,
  OpsMaintenanceCommRequestSummary,
  OpsMaintenanceDueItem,
  OpsMaintenanceReminderSummary,
  OpsMaintenanceRunSummary,
  OpsRecurringMaintenanceOverview,
  OpsRecurringMaintenancePlanSummary,
  PlumbingEquipmentKind,
  UpdateRecurringMaintenancePlanRequest,
} from '@titan/shared';
import {
  classifyMaintenanceDueBucket,
  daysUntilDue,
  PLUMBING_EQUIPMENT_KINDS,
  RECURRING_MAINTENANCE_GUARANTEES,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  alAssetRegistryProfiles,
  alPreventiveMaintenanceDue,
  assetEquipment,
  assetMaintenanceRecords,
  assetMaintenanceSchedules,
  customers,
  documents,
  opsMaintenanceAuraSuggestions,
  opsMaintenanceCommRequests,
  opsMaintenanceReminders,
  opsMaintenanceRuns,
  opsRecurringMaintenancePlans,
  securityAuditLogs,
} from '@titan/db';
import type { EnterpriseAssetLifecycleService } from './enterprise-asset-lifecycle.service.js';
import type { EmailCentreService } from './email-centre.service.js';

export class RecurringMaintenanceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RecurringMaintenanceError';
  }
}

export type RecurringMaintenanceActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

type ServiceDeps = {
  db: DatabaseClient;
  enterpriseAssetLifecycleService: EnterpriseAssetLifecycleService;
  emailCentreService?: EmailCentreService;
};

function assertOwner(actor: RecurringMaintenanceActor): void {
  if (!isOwnerRole({ roleName: actor.roleName, permissions: actor.permissions })) {
    throw new RecurringMaintenanceError(
      'FORBIDDEN',
      'Only the company Owner may approve customer maintenance communication',
    );
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function toPlanSummary(row: typeof opsRecurringMaintenancePlans.$inferSelect): OpsRecurringMaintenancePlanSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    assetId: row.assetId,
    scheduleId: row.scheduleId,
    customerId: row.customerId,
    propertyId: row.propertyId,
    jobId: row.jobId,
    plumbingKind: row.plumbingKind as PlumbingEquipmentKind,
    intervalDays: row.intervalDays,
    nextDueAt: toIso(row.nextDueAt),
    lastCompletedAt: toIso(row.lastCompletedAt),
    reminderDaysBefore: row.reminderDaysBefore,
    status: row.status,
    documentIds: Array.isArray(row.documentIds) ? row.documentIds : [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRunSummary(row: typeof opsMaintenanceRuns.$inferSelect): OpsMaintenanceRunSummary {
  return {
    id: row.id,
    planId: row.planId,
    dueId: row.dueId,
    maintenanceRecordId: row.maintenanceRecordId,
    jobId: row.jobId,
    status: row.status,
    completedAt: toIso(row.completedAt),
    notes: row.notes,
    documentIds: Array.isArray(row.documentIds) ? row.documentIds : [],
    createdAt: row.createdAt.toISOString(),
  };
}

function toReminderSummary(
  row: typeof opsMaintenanceReminders.$inferSelect,
): OpsMaintenanceReminderSummary {
  return {
    id: row.id,
    planId: row.planId,
    dueId: row.dueId,
    title: row.title,
    remindAt: row.remindAt.toISOString(),
    status: row.status,
    acknowledgedAt: toIso(row.acknowledgedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

function toCommSummary(
  row: typeof opsMaintenanceCommRequests.$inferSelect,
): OpsMaintenanceCommRequestSummary {
  return {
    id: row.id,
    planId: row.planId,
    customerId: row.customerId,
    subject: row.subject,
    body: row.body,
    status: row.status,
    emailDraftId: row.emailDraftId,
    autoExecuted: false,
    decidedAt: toIso(row.decidedAt),
    decisionNotes: row.decisionNotes,
    executedAt: toIso(row.executedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuraSummary(
  row: typeof opsMaintenanceAuraSuggestions.$inferSelect,
): OpsMaintenanceAuraSuggestionSummary {
  return {
    id: row.id,
    planId: row.planId,
    assetId: row.assetId,
    customerId: row.customerId,
    kind: row.kind,
    subject: row.subject,
    body: row.body,
    status: row.status,
    supportingSignals: Array.isArray(row.supportingSignals) ? row.supportingSignals : [],
    autoExecuted: false,
    decidedAt: toIso(row.decidedAt),
    decisionNotes: row.decisionNotes,
    createdAt: row.createdAt.toISOString(),
  };
}

export class RecurringMaintenanceService {
  constructor(private readonly deps: ServiceDeps) {}

  private async audit(
    actor: RecurringMaintenanceActor,
    action: string,
    entityType: string,
    entityId: string,
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
        noDemoData: true,
        noFakePlans: true,
        noFakeRuns: true,
        noAutoExternalCommunication: true,
        autoExecuted: false,
        ...metadata,
      },
    });
  }

  private async assertAsset(companyId: string, assetId: string) {
    const asset = await this.deps.db.query.assetEquipment.findFirst({
      where: and(eq(assetEquipment.id, assetId), eq(assetEquipment.companyId, companyId)),
    });
    if (!asset) {
      throw new RecurringMaintenanceError('NOT_FOUND', 'Asset not found in this company');
    }
    return asset;
  }

  private async assertCustomer(companyId: string, customerId: string) {
    const customer = await this.deps.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });
    if (!customer) {
      throw new RecurringMaintenanceError('NOT_FOUND', 'Customer not found in this company');
    }
    return customer;
  }

  private async assertDocuments(companyId: string, documentIds: string[]) {
    if (!documentIds.length) return;
    const rows = await this.deps.db.query.documents.findMany({
      where: and(eq(documents.companyId, companyId), inArray(documents.id, documentIds)),
    });
    if (rows.length !== documentIds.length) {
      throw new RecurringMaintenanceError(
        'VALIDATION_ERROR',
        'One or more documents were not found in this company',
      );
    }
  }

  async getOverview(actor: RecurringMaintenanceActor): Promise<OpsRecurringMaintenanceOverview> {
    const companyId = actor.companyId;
    const now = new Date();

    const plans = await this.deps.db.query.opsRecurringMaintenancePlans.findMany({
      where: and(
        eq(opsRecurringMaintenancePlans.companyId, companyId),
        inArray(opsRecurringMaintenancePlans.status, ['active', 'draft', 'paused']),
      ),
      orderBy: [desc(opsRecurringMaintenancePlans.updatedAt)],
      limit: 100,
    });

    const activePlans = plans.filter((p) => p.status === 'active');
    const dueItems = this.buildDueItems(activePlans, now);

    const [pendingReminders, pendingComm, pendingAura] = await Promise.all([
      this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(opsMaintenanceReminders)
        .where(
          and(
            eq(opsMaintenanceReminders.companyId, companyId),
            eq(opsMaintenanceReminders.status, 'pending'),
          ),
        ),
      this.deps.db.query.opsMaintenanceCommRequests.findMany({
        where: and(
          eq(opsMaintenanceCommRequests.companyId, companyId),
          inArray(opsMaintenanceCommRequests.status, ['draft', 'pending_approval', 'approved']),
        ),
        orderBy: [desc(opsMaintenanceCommRequests.createdAt)],
        limit: 50,
      }),
      this.deps.db.query.opsMaintenanceAuraSuggestions.findMany({
        where: and(
          eq(opsMaintenanceAuraSuggestions.companyId, companyId),
          inArray(opsMaintenanceAuraSuggestions.status, ['draft', 'pending_approval']),
        ),
        orderBy: [desc(opsMaintenanceAuraSuggestions.createdAt)],
        limit: 50,
      }),
    ]);

    await this.audit(actor, 'recurring_maintenance.overview.read', 'recurring_maintenance', companyId, {
      counts: {
        activePlans: activePlans.length,
        upcoming: dueItems.filter((d) => d.bucket === 'upcoming').length,
        due: dueItems.filter((d) => d.bucket === 'due').length,
        missed: dueItems.filter((d) => d.bucket === 'missed').length,
      },
    });

    return {
      counts: {
        activePlans: activePlans.length,
        upcoming: dueItems.filter((d) => d.bucket === 'upcoming').length,
        due: dueItems.filter((d) => d.bucket === 'due').length,
        missed: dueItems.filter((d) => d.bucket === 'missed').length,
        pendingReminders: Number(pendingReminders[0]?.count ?? 0),
        pendingCommApprovals: pendingComm.filter((c) =>
          ['draft', 'pending_approval', 'approved'].includes(c.status),
        ).length,
        pendingAuraSuggestions: pendingAura.length,
      },
      recentPlans: plans.slice(0, 20).map(toPlanSummary),
      dueItems,
      pendingCommRequests: pendingComm.map(toCommSummary),
      pendingAuraSuggestions: pendingAura.map(toAuraSummary),
      plumbingKinds: PLUMBING_EQUIPMENT_KINDS,
      guarantees: RECURRING_MAINTENANCE_GUARANTEES,
    };
  }

  private buildDueItems(
    plans: Array<typeof opsRecurringMaintenancePlans.$inferSelect>,
    now: Date,
  ): OpsMaintenanceDueItem[] {
    return plans
      .filter((p) => p.status === 'active')
      .map((plan) => {
        const bucket = classifyMaintenanceDueBucket(plan.nextDueAt, now);
        return {
          planId: plan.id,
          planName: plan.name,
          assetId: plan.assetId,
          customerId: plan.customerId,
          propertyId: plan.propertyId,
          plumbingKind: plan.plumbingKind as PlumbingEquipmentKind,
          nextDueAt: toIso(plan.nextDueAt),
          bucket,
          dueRecordId: null,
          dueStatus: null,
          daysUntilDue: daysUntilDue(plan.nextDueAt, now),
        };
      })
      .sort((a, b) => {
        const order = { missed: 0, due: 1, upcoming: 2, completed: 3 } as const;
        return order[a.bucket] - order[b.bucket];
      });
  }

  async listPlans(actor: RecurringMaintenanceActor): Promise<OpsRecurringMaintenancePlanSummary[]> {
    const rows = await this.deps.db.query.opsRecurringMaintenancePlans.findMany({
      where: eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
      orderBy: [desc(opsRecurringMaintenancePlans.updatedAt)],
      limit: 200,
    });
    return rows.map(toPlanSummary);
  }

  async createPlan(
    actor: RecurringMaintenanceActor,
    input: CreateRecurringMaintenancePlanRequest,
  ): Promise<OpsRecurringMaintenancePlanSummary> {
    await this.assertAsset(actor.companyId, input.assetId);
    if (input.customerId) await this.assertCustomer(actor.companyId, input.customerId);
    const documentIds = input.documentIds ?? [];
    await this.assertDocuments(actor.companyId, documentIds);

    if (!Number.isInteger(input.intervalDays) || input.intervalDays <= 0) {
      throw new RecurringMaintenanceError('VALIDATION_ERROR', 'intervalDays must be a positive integer');
    }

    const plumbingKind = input.plumbingKind ?? 'installed_equipment';
    if (!PLUMBING_EQUIPMENT_KINDS.includes(plumbingKind)) {
      throw new RecurringMaintenanceError('VALIDATION_ERROR', 'Invalid plumbing equipment kind');
    }

    // Prefer registry profile links when caller omitted customer/property.
    let customerId = input.customerId ?? null;
    let propertyId = input.propertyId ?? null;
    if (!customerId || !propertyId) {
      const profile = await this.deps.db.query.alAssetRegistryProfiles.findFirst({
        where: and(
          eq(alAssetRegistryProfiles.companyId, actor.companyId),
          eq(alAssetRegistryProfiles.assetId, input.assetId),
        ),
      });
      if (profile) {
        customerId = customerId ?? profile.customerId ?? null;
        propertyId = propertyId ?? profile.propertyId ?? null;
      }
    }

    const nextDueAt = input.nextDueAt ? new Date(input.nextDueAt) : null;
    if (input.nextDueAt && (!nextDueAt || Number.isNaN(nextDueAt.getTime()))) {
      throw new RecurringMaintenanceError('VALIDATION_ERROR', 'nextDueAt must be a valid ISO date');
    }

    const syncSchedule = input.syncSchedule !== false;
    let scheduleId: string | null = null;

    if (syncSchedule) {
      const [schedule] = await this.deps.db
        .insert(assetMaintenanceSchedules)
        .values({
          companyId: actor.companyId,
          assetId: input.assetId,
          scheduleType: 'service_interval',
          title: input.name.trim(),
          description: input.description?.trim() || null,
          intervalDays: input.intervalDays,
          nextDueAt,
          isActive: (input.status ?? 'active') === 'active',
          metadata: {
            source: 'recurring_maintenance_engine',
            plumbingKind,
          },
        })
        .returning();
      scheduleId = schedule!.id;
    }

    const [plan] = await this.deps.db
      .insert(opsRecurringMaintenancePlans)
      .values({
        companyId: actor.companyId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        assetId: input.assetId,
        scheduleId,
        customerId,
        propertyId,
        jobId: input.jobId ?? null,
        plumbingKind,
        intervalDays: input.intervalDays,
        nextDueAt,
        reminderDaysBefore: input.reminderDaysBefore ?? 7,
        status: input.status ?? 'active',
        documentIds,
        metadata: { source: 'recurring_maintenance_engine' },
        createdByUserId: actor.userId,
      })
      .returning();

    await this.audit(actor, 'recurring_maintenance.plan.created', 'ops_recurring_maintenance_plan', plan!.id, {
      assetId: plan!.assetId,
      scheduleId: plan!.scheduleId,
      plumbingKind: plan!.plumbingKind,
    });

    return toPlanSummary(plan!);
  }

  async updatePlan(
    actor: RecurringMaintenanceActor,
    planId: string,
    input: UpdateRecurringMaintenancePlanRequest,
  ): Promise<OpsRecurringMaintenancePlanSummary> {
    const existing = await this.deps.db.query.opsRecurringMaintenancePlans.findFirst({
      where: and(
        eq(opsRecurringMaintenancePlans.id, planId),
        eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new RecurringMaintenanceError('NOT_FOUND', 'Maintenance plan not found');
    }

    if (input.customerId) await this.assertCustomer(actor.companyId, input.customerId);
    if (input.documentIds) await this.assertDocuments(actor.companyId, input.documentIds);
    if (input.intervalDays !== undefined && (!Number.isInteger(input.intervalDays) || input.intervalDays <= 0)) {
      throw new RecurringMaintenanceError('VALIDATION_ERROR', 'intervalDays must be a positive integer');
    }
    if (input.plumbingKind && !PLUMBING_EQUIPMENT_KINDS.includes(input.plumbingKind)) {
      throw new RecurringMaintenanceError('VALIDATION_ERROR', 'Invalid plumbing equipment kind');
    }

    const nextDueAt =
      input.nextDueAt === undefined
        ? undefined
        : input.nextDueAt
          ? new Date(input.nextDueAt)
          : null;
    if (input.nextDueAt && nextDueAt && Number.isNaN(nextDueAt.getTime())) {
      throw new RecurringMaintenanceError('VALIDATION_ERROR', 'nextDueAt must be a valid ISO date');
    }

    const [updated] = await this.deps.db
      .update(opsRecurringMaintenancePlans)
      .set({
        name: input.name?.trim() ?? existing.name,
        description:
          input.description === undefined ? existing.description : input.description?.trim() || null,
        customerId: input.customerId === undefined ? existing.customerId : input.customerId,
        propertyId: input.propertyId === undefined ? existing.propertyId : input.propertyId,
        jobId: input.jobId === undefined ? existing.jobId : input.jobId,
        plumbingKind: input.plumbingKind ?? existing.plumbingKind,
        intervalDays: input.intervalDays ?? existing.intervalDays,
        nextDueAt: nextDueAt === undefined ? existing.nextDueAt : nextDueAt,
        reminderDaysBefore: input.reminderDaysBefore ?? existing.reminderDaysBefore,
        status: input.status ?? existing.status,
        documentIds: input.documentIds ?? existing.documentIds,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(opsRecurringMaintenancePlans.id, planId),
          eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
        ),
      )
      .returning();

    if (updated!.scheduleId) {
      await this.deps.db
        .update(assetMaintenanceSchedules)
        .set({
          title: updated!.name,
          description: updated!.description,
          intervalDays: updated!.intervalDays,
          nextDueAt: updated!.nextDueAt,
          isActive: updated!.status === 'active',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(assetMaintenanceSchedules.id, updated!.scheduleId),
            eq(assetMaintenanceSchedules.companyId, actor.companyId),
          ),
        );
    }

    await this.audit(actor, 'recurring_maintenance.plan.updated', 'ops_recurring_maintenance_plan', planId);
    return toPlanSummary(updated!);
  }

  /**
   * Reuses EnterpriseAssetLifecycleService.generateMaintenanceDue (emits maintenance.due)
   * then syncs plan next_due / creates in-app reminders for active plans.
   */
  async generateDueAndReminders(actor: RecurringMaintenanceActor): Promise<{
    dueGenerated: number;
    remindersCreated: number;
    plansSynced: number;
  }> {
    const dueRecords = await this.deps.enterpriseAssetLifecycleService.generateMaintenanceDue({
      companyId: actor.companyId,
      userId: actor.userId,
    });

    const plans = await this.deps.db.query.opsRecurringMaintenancePlans.findMany({
      where: and(
        eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
        eq(opsRecurringMaintenancePlans.status, 'active'),
      ),
    });

    const now = new Date();
    let remindersCreated = 0;
    let plansSynced = 0;

    for (const plan of plans) {
      if (!plan.nextDueAt) continue;
      plansSynced += 1;

      // Mark overdue open due rows for linked schedules.
      if (plan.scheduleId) {
        await this.deps.db
          .update(alPreventiveMaintenanceDue)
          .set({ status: 'overdue', updatedAt: now })
          .where(
            and(
              eq(alPreventiveMaintenanceDue.companyId, actor.companyId),
              eq(alPreventiveMaintenanceDue.scheduleId, plan.scheduleId),
              eq(alPreventiveMaintenanceDue.status, 'due'),
              lte(alPreventiveMaintenanceDue.dueAt, now),
            ),
          );
      }

      const remindAt = new Date(plan.nextDueAt);
      remindAt.setDate(remindAt.getDate() - (plan.reminderDaysBefore ?? 7));
      if (remindAt > now) continue;

      const existingReminder = await this.deps.db.query.opsMaintenanceReminders.findFirst({
        where: and(
          eq(opsMaintenanceReminders.companyId, actor.companyId),
          eq(opsMaintenanceReminders.planId, plan.id),
          eq(opsMaintenanceReminders.status, 'pending'),
        ),
      });
      if (existingReminder) continue;

      const linkedDue = plan.scheduleId
        ? await this.deps.db.query.alPreventiveMaintenanceDue.findFirst({
            where: and(
              eq(alPreventiveMaintenanceDue.companyId, actor.companyId),
              eq(alPreventiveMaintenanceDue.scheduleId, plan.scheduleId),
              inArray(alPreventiveMaintenanceDue.status, ['due', 'overdue', 'scheduled']),
            ),
          })
        : null;

      await this.deps.db.insert(opsMaintenanceReminders).values({
        companyId: actor.companyId,
        planId: plan.id,
        dueId: linkedDue?.id ?? null,
        title: `Maintenance reminder: ${plan.name}`,
        remindAt: remindAt < now ? now : remindAt,
        status: 'pending',
        metadata: {
          inAppOnly: true,
          noExternalSend: true,
          plumbingKind: plan.plumbingKind,
        },
      });
      remindersCreated += 1;
    }

    await this.audit(actor, 'recurring_maintenance.due.generated', 'recurring_maintenance', actor.companyId, {
      dueGenerated: dueRecords.length,
      remindersCreated,
      plansSynced,
      extendsExistingMaintenanceDue: true,
    });

    return {
      dueGenerated: dueRecords.length,
      remindersCreated,
      plansSynced,
    };
  }

  async listDueItems(actor: RecurringMaintenanceActor): Promise<OpsMaintenanceDueItem[]> {
    const plans = await this.deps.db.query.opsRecurringMaintenancePlans.findMany({
      where: and(
        eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
        eq(opsRecurringMaintenancePlans.status, 'active'),
      ),
    });
    const items = this.buildDueItems(plans, new Date());

    // Enrich with open due record ids when schedule-linked.
    for (const item of items) {
      const plan = plans.find((p) => p.id === item.planId);
      if (!plan?.scheduleId) continue;
      const due = await this.deps.db.query.alPreventiveMaintenanceDue.findFirst({
        where: and(
          eq(alPreventiveMaintenanceDue.companyId, actor.companyId),
          eq(alPreventiveMaintenanceDue.scheduleId, plan.scheduleId),
          inArray(alPreventiveMaintenanceDue.status, ['due', 'overdue', 'scheduled']),
        ),
      });
      if (due) {
        item.dueRecordId = due.id;
        item.dueStatus = due.status;
      }
    }
    return items;
  }

  async completeCycle(
    actor: RecurringMaintenanceActor,
    planId: string,
    input: CompleteMaintenanceCycleRequest = {},
  ): Promise<{ plan: OpsRecurringMaintenancePlanSummary; run: OpsMaintenanceRunSummary }> {
    const plan = await this.deps.db.query.opsRecurringMaintenancePlans.findFirst({
      where: and(
        eq(opsRecurringMaintenancePlans.id, planId),
        eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
      ),
    });
    if (!plan) {
      throw new RecurringMaintenanceError('NOT_FOUND', 'Maintenance plan not found');
    }

    const documentIds = input.documentIds ?? [];
    await this.assertDocuments(actor.companyId, documentIds);

    const completedAt = input.completedAt ? new Date(input.completedAt) : new Date();
    if (Number.isNaN(completedAt.getTime())) {
      throw new RecurringMaintenanceError('VALIDATION_ERROR', 'completedAt must be a valid ISO date');
    }

    const [record] = await this.deps.db
      .insert(assetMaintenanceRecords)
      .values({
        companyId: actor.companyId,
        assetId: plan.assetId,
        maintenanceType: 'preventative',
        status: 'completed',
        title: plan.name,
        description: input.notes?.trim() || plan.description,
        scheduledAt: plan.nextDueAt,
        completedAt,
        jobId: input.jobId ?? plan.jobId,
        notes: input.notes?.trim() || null,
        metadata: {
          source: 'recurring_maintenance_engine',
          planId: plan.id,
          documentIds,
        },
        createdByUserId: actor.userId,
      })
      .returning();

    if (input.dueId || plan.scheduleId) {
      const dueWhere = input.dueId
        ? and(
            eq(alPreventiveMaintenanceDue.id, input.dueId),
            eq(alPreventiveMaintenanceDue.companyId, actor.companyId),
          )
        : and(
            eq(alPreventiveMaintenanceDue.companyId, actor.companyId),
            eq(alPreventiveMaintenanceDue.scheduleId, plan.scheduleId!),
            inArray(alPreventiveMaintenanceDue.status, ['due', 'overdue', 'scheduled']),
          );
      await this.deps.db
        .update(alPreventiveMaintenanceDue)
        .set({ status: 'completed', completedAt, updatedAt: new Date() })
        .where(dueWhere);
    }

    const nextDueAt = new Date(completedAt);
    nextDueAt.setDate(nextDueAt.getDate() + plan.intervalDays);

    const [updatedPlan] = await this.deps.db
      .update(opsRecurringMaintenancePlans)
      .set({
        lastCompletedAt: completedAt,
        nextDueAt,
        jobId: input.jobId ?? plan.jobId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(opsRecurringMaintenancePlans.id, planId),
          eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
        ),
      )
      .returning();

    if (updatedPlan!.scheduleId) {
      await this.deps.db
        .update(assetMaintenanceSchedules)
        .set({
          lastCompletedAt: completedAt,
          nextDueAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(assetMaintenanceSchedules.id, updatedPlan!.scheduleId),
            eq(assetMaintenanceSchedules.companyId, actor.companyId),
          ),
        );
    }

    // Dismiss open reminders for this plan.
    await this.deps.db
      .update(opsMaintenanceReminders)
      .set({ status: 'acknowledged', acknowledgedByUserId: actor.userId, acknowledgedAt: completedAt, updatedAt: new Date() })
      .where(
        and(
          eq(opsMaintenanceReminders.companyId, actor.companyId),
          eq(opsMaintenanceReminders.planId, planId),
          eq(opsMaintenanceReminders.status, 'pending'),
        ),
      );

    const [run] = await this.deps.db
      .insert(opsMaintenanceRuns)
      .values({
        companyId: actor.companyId,
        planId,
        dueId: input.dueId ?? null,
        maintenanceRecordId: record!.id,
        jobId: input.jobId ?? plan.jobId,
        status: 'completed',
        completedAt,
        notes: input.notes?.trim() || null,
        documentIds,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.audit(actor, 'recurring_maintenance.cycle.completed', 'ops_maintenance_run', run!.id, {
      planId,
      maintenanceRecordId: record!.id,
      nextDueAt: nextDueAt.toISOString(),
    });

    return { plan: toPlanSummary(updatedPlan!), run: toRunSummary(run!) };
  }

  async listHistory(
    actor: RecurringMaintenanceActor,
    planId?: string,
  ): Promise<OpsMaintenanceRunSummary[]> {
    const rows = await this.deps.db.query.opsMaintenanceRuns.findMany({
      where: planId
        ? and(
            eq(opsMaintenanceRuns.companyId, actor.companyId),
            eq(opsMaintenanceRuns.planId, planId),
          )
        : eq(opsMaintenanceRuns.companyId, actor.companyId),
      orderBy: [desc(opsMaintenanceRuns.createdAt)],
      limit: 100,
    });
    return rows.map(toRunSummary);
  }

  async listReminders(actor: RecurringMaintenanceActor): Promise<OpsMaintenanceReminderSummary[]> {
    const rows = await this.deps.db.query.opsMaintenanceReminders.findMany({
      where: eq(opsMaintenanceReminders.companyId, actor.companyId),
      orderBy: [desc(opsMaintenanceReminders.remindAt)],
      limit: 100,
    });
    return rows.map(toReminderSummary);
  }

  async acknowledgeReminder(
    actor: RecurringMaintenanceActor,
    reminderId: string,
  ): Promise<OpsMaintenanceReminderSummary> {
    const [updated] = await this.deps.db
      .update(opsMaintenanceReminders)
      .set({
        status: 'acknowledged',
        acknowledgedByUserId: actor.userId,
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(opsMaintenanceReminders.id, reminderId),
          eq(opsMaintenanceReminders.companyId, actor.companyId),
        ),
      )
      .returning();
    if (!updated) {
      throw new RecurringMaintenanceError('NOT_FOUND', 'Reminder not found');
    }
    await this.audit(actor, 'recurring_maintenance.reminder.acknowledged', 'ops_maintenance_reminder', reminderId);
    return toReminderSummary(updated);
  }

  /**
   * Draft AURA suggestions from real plan state — never auto-executed,
   * never creates customer-facing outbound.
   */
  async generateAuraSuggestions(
    actor: RecurringMaintenanceActor,
  ): Promise<OpsMaintenanceAuraSuggestionSummary[]> {
    const now = new Date();
    const plans = await this.deps.db.query.opsRecurringMaintenancePlans.findMany({
      where: and(
        eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
        eq(opsRecurringMaintenancePlans.status, 'active'),
      ),
    });

    const created: OpsMaintenanceAuraSuggestionSummary[] = [];

    for (const plan of plans) {
      const bucket = classifyMaintenanceDueBucket(plan.nextDueAt, now);
      const days = daysUntilDue(plan.nextDueAt, now);

      if (bucket === 'upcoming' && days !== null && days <= (plan.reminderDaysBefore ?? 7)) {
        const existing = await this.findOpenAura(actor.companyId, plan.id, 'upcoming_alert');
        if (!existing) {
          created.push(
            await this.insertAura(actor, {
              planId: plan.id,
              assetId: plan.assetId,
              customerId: plan.customerId,
              kind: 'upcoming_alert',
              subject: `Upcoming maintenance: ${plan.name}`,
              body: `${plan.name} (${plan.plumbingKind}) is due in ${days} day(s). Review schedule and prepare resources. Draft suggestion only — no customer send.`,
              signals: [{ bucket, daysUntilDue: days, planId: plan.id }],
            }),
          );
        }
      }

      if (bucket === 'missed' || bucket === 'due') {
        const kind = bucket === 'missed' ? 'missed_maintenance' : 'upcoming_alert';
        const existing = await this.findOpenAura(actor.companyId, plan.id, kind);
        if (!existing) {
          created.push(
            await this.insertAura(actor, {
              planId: plan.id,
              assetId: plan.assetId,
              customerId: plan.customerId,
              kind,
              subject:
                bucket === 'missed'
                  ? `Missed maintenance: ${plan.name}`
                  : `Maintenance due now: ${plan.name}`,
              body:
                bucket === 'missed'
                  ? `${plan.name} appears overdue. Draft opportunity to schedule service — Owner approval required before any customer communication.`
                  : `${plan.name} is due. Consider booking a maintenance job. Draft suggestion only.`,
              signals: [{ bucket, daysUntilDue: days, planId: plan.id }],
            }),
          );
        }
      }

      if ((bucket === 'missed' || bucket === 'due') && plan.customerId) {
        const existing = await this.findOpenAura(actor.companyId, plan.id, 'customer_opportunity');
        if (!existing) {
          created.push(
            await this.insertAura(actor, {
              planId: plan.id,
              assetId: plan.assetId,
              customerId: plan.customerId,
              kind: 'customer_opportunity',
              subject: `Customer maintenance opportunity: ${plan.name}`,
              body: `Customer-linked ${plan.plumbingKind} plan "${plan.name}" needs attention. Draft a customer message via the approval queue — never auto-send.`,
              signals: [
                { bucket, customerId: plan.customerId, propertyId: plan.propertyId, planId: plan.id },
              ],
            }),
          );
        }
      }
    }

    await this.audit(actor, 'recurring_maintenance.aura.generated', 'recurring_maintenance', actor.companyId, {
      created: created.length,
      autoExecuted: false,
    });

    return created;
  }

  private async findOpenAura(
    companyId: string,
    planId: string,
    kind: OpsMaintenanceAuraSuggestionSummary['kind'],
  ) {
    return this.deps.db.query.opsMaintenanceAuraSuggestions.findFirst({
      where: and(
        eq(opsMaintenanceAuraSuggestions.companyId, companyId),
        eq(opsMaintenanceAuraSuggestions.planId, planId),
        eq(opsMaintenanceAuraSuggestions.kind, kind),
        inArray(opsMaintenanceAuraSuggestions.status, ['draft', 'pending_approval']),
      ),
    });
  }

  private async insertAura(
    actor: RecurringMaintenanceActor,
    input: {
      planId: string;
      assetId: string;
      customerId: string | null;
      kind: OpsMaintenanceAuraSuggestionSummary['kind'];
      subject: string;
      body: string;
      signals: Array<Record<string, unknown>>;
    },
  ): Promise<OpsMaintenanceAuraSuggestionSummary> {
    const [row] = await this.deps.db
      .insert(opsMaintenanceAuraSuggestions)
      .values({
        companyId: actor.companyId,
        planId: input.planId,
        assetId: input.assetId,
        customerId: input.customerId,
        kind: input.kind,
        subject: input.subject,
        body: input.body,
        status: 'pending_approval',
        supportingSignals: input.signals,
        autoExecuted: false,
        createdByUserId: actor.userId,
      })
      .returning();
    return toAuraSummary(row!);
  }

  async listAuraSuggestions(
    actor: RecurringMaintenanceActor,
  ): Promise<OpsMaintenanceAuraSuggestionSummary[]> {
    const rows = await this.deps.db.query.opsMaintenanceAuraSuggestions.findMany({
      where: eq(opsMaintenanceAuraSuggestions.companyId, actor.companyId),
      orderBy: [desc(opsMaintenanceAuraSuggestions.createdAt)],
      limit: 100,
    });
    return rows.map(toAuraSummary);
  }

  async decideAuraSuggestion(
    actor: RecurringMaintenanceActor,
    suggestionId: string,
    decision: 'approve' | 'reject',
    notes?: string,
  ): Promise<OpsMaintenanceAuraSuggestionSummary> {
    assertOwner(actor);
    const existing = await this.deps.db.query.opsMaintenanceAuraSuggestions.findFirst({
      where: and(
        eq(opsMaintenanceAuraSuggestions.id, suggestionId),
        eq(opsMaintenanceAuraSuggestions.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new RecurringMaintenanceError('NOT_FOUND', 'AURA suggestion not found');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new RecurringMaintenanceError('CONFLICT', 'Suggestion already decided');
    }

    const [updated] = await this.deps.db
      .update(opsMaintenanceAuraSuggestions)
      .set({
        status: decision === 'approve' ? 'approved' : 'rejected',
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes:
          notes?.trim() ||
          (decision === 'approve'
            ? 'Approved as advisory only. Approval does not execute customer communication, jobs, or schedule changes.'
            : null),
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(opsMaintenanceAuraSuggestions.id, suggestionId),
          eq(opsMaintenanceAuraSuggestions.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.audit(
      actor,
      decision === 'approve'
        ? 'recurring_maintenance.aura.approved'
        : 'recurring_maintenance.aura.rejected',
      'ops_maintenance_aura_suggestion',
      suggestionId,
      { autoExecuted: false },
    );

    return toAuraSummary(updated!);
  }

  async createCommRequest(
    actor: RecurringMaintenanceActor,
    input: CreateMaintenanceCommRequest,
  ): Promise<OpsMaintenanceCommRequestSummary> {
    if (!input.subject.trim() || !input.body.trim()) {
      throw new RecurringMaintenanceError('VALIDATION_ERROR', 'subject and body are required');
    }

    let customerId = input.customerId ?? null;
    let planId = input.planId ?? null;

    if (planId) {
      const plan = await this.deps.db.query.opsRecurringMaintenancePlans.findFirst({
        where: and(
          eq(opsRecurringMaintenancePlans.id, planId),
          eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
        ),
      });
      if (!plan) {
        throw new RecurringMaintenanceError('NOT_FOUND', 'Maintenance plan not found');
      }
      customerId = customerId ?? plan.customerId;
    }
    if (customerId) await this.assertCustomer(actor.companyId, customerId);

    const [row] = await this.deps.db
      .insert(opsMaintenanceCommRequests)
      .values({
        companyId: actor.companyId,
        planId,
        customerId,
        subject: input.subject.trim(),
        body: input.body.trim(),
        status: 'pending_approval',
        autoExecuted: false,
        metadata: {
          to: input.to ?? [],
          requiresOwnerApproval: true,
          noAutoExternalCommunication: true,
        },
        createdByUserId: actor.userId,
      })
      .returning();

    await this.audit(actor, 'recurring_maintenance.comm.drafted', 'ops_maintenance_comm_request', row!.id, {
      status: 'pending_approval',
      autoExecuted: false,
    });

    return toCommSummary(row!);
  }

  async listCommRequests(
    actor: RecurringMaintenanceActor,
  ): Promise<OpsMaintenanceCommRequestSummary[]> {
    const rows = await this.deps.db.query.opsMaintenanceCommRequests.findMany({
      where: eq(opsMaintenanceCommRequests.companyId, actor.companyId),
      orderBy: [desc(opsMaintenanceCommRequests.createdAt)],
      limit: 100,
    });
    return rows.map(toCommSummary);
  }

  async decideCommRequest(
    actor: RecurringMaintenanceActor,
    requestId: string,
    decision: 'approve' | 'reject',
    notes?: string,
  ): Promise<OpsMaintenanceCommRequestSummary> {
    assertOwner(actor);
    const existing = await this.deps.db.query.opsMaintenanceCommRequests.findFirst({
      where: and(
        eq(opsMaintenanceCommRequests.id, requestId),
        eq(opsMaintenanceCommRequests.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new RecurringMaintenanceError('NOT_FOUND', 'Communication request not found');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new RecurringMaintenanceError('CONFLICT', 'Communication request already decided');
    }

    const [updated] = await this.deps.db
      .update(opsMaintenanceCommRequests)
      .set({
        status: decision === 'approve' ? 'approved' : 'rejected',
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: notes?.trim() || null,
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(opsMaintenanceCommRequests.id, requestId),
          eq(opsMaintenanceCommRequests.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.audit(
      actor,
      decision === 'approve'
        ? 'recurring_maintenance.comm.approved'
        : 'recurring_maintenance.comm.rejected',
      'ops_maintenance_comm_request',
      requestId,
      { autoExecuted: false },
    );

    return toCommSummary(updated!);
  }

  /**
   * After Owner approval: create Email Centre draft (Gmail path) + timeline note.
   * Does NOT auto-send — Email Centre still requires its own approve→execute.
   */
  async executeCommRequest(
    actor: RecurringMaintenanceActor,
    requestId: string,
  ): Promise<OpsMaintenanceCommRequestSummary> {
    assertOwner(actor);
    if (!this.deps.emailCentreService) {
      throw new RecurringMaintenanceError(
        'NOT_CONFIGURED',
        'Email Centre is not wired for maintenance customer communication',
      );
    }

    const existing = await this.deps.db.query.opsMaintenanceCommRequests.findFirst({
      where: and(
        eq(opsMaintenanceCommRequests.id, requestId),
        eq(opsMaintenanceCommRequests.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new RecurringMaintenanceError('NOT_FOUND', 'Communication request not found');
    }
    if (existing.status !== 'approved') {
      throw new RecurringMaintenanceError(
        'CONFLICT',
        'Owner must approve the communication request before Email Centre draft creation',
      );
    }
    if (existing.emailDraftId) {
      throw new RecurringMaintenanceError('CONFLICT', 'Email Centre draft already created for this request');
    }

    const metaTo = Array.isArray((existing.metadata as { to?: string[] })?.to)
      ? ((existing.metadata as { to: string[] }).to)
      : [];
    let to = metaTo.filter(Boolean);
    if (!to.length && existing.customerId) {
      const customer = await this.assertCustomer(actor.companyId, existing.customerId);
      if (customer.email) to = [customer.email];
    }
    if (!to.length) {
      throw new RecurringMaintenanceError(
        'VALIDATION_ERROR',
        'Customer email is missing — provide a to address when drafting the request',
      );
    }

    const draft = await this.deps.emailCentreService.createReplyOrForwardDraft(actor, {
      to,
      subject: existing.subject,
      bodyText: existing.body,
    });

    await this.deps.emailCentreService.createTimelineNote(actor, {
      body: `Maintenance customer communication drafted (request ${existing.id} → Email Centre draft ${draft.id}). Approve and execute in Email Centre. Resend remains transactional-only.`,
      customerId: existing.customerId ?? undefined,
      statusUpdate: 'maintenance_comm_email_draft',
      metadata: {
        maintenanceCommRequestId: existing.id,
        emailDraftId: draft.id,
        planId: existing.planId,
        autoSend: false,
      },
    });

    const [updated] = await this.deps.db
      .update(opsMaintenanceCommRequests)
      .set({
        status: 'executed',
        emailDraftId: draft.id,
        executedAt: new Date(),
        autoExecuted: false,
        updatedAt: new Date(),
        metadata: {
          ...(existing.metadata as Record<string, unknown>),
          emailDraftCreated: true,
          emailCentreApproveExecuteStillRequired: true,
        },
      })
      .where(
        and(
          eq(opsMaintenanceCommRequests.id, requestId),
          eq(opsMaintenanceCommRequests.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.audit(actor, 'recurring_maintenance.comm.executed', 'ops_maintenance_comm_request', requestId, {
      emailDraftId: draft.id,
      autoExecuted: false,
      emailCentreApproveExecuteStillRequired: true,
    });

    return toCommSummary(updated!);
  }
}
