import { and, asc, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import type {
  AssignJobCrewRequest,
  AuthorizeJobMaterialLineRequest,
  AuthorizeJobVariationRequest,
  CreateJobVariationRequest,
  JobCompletionGateResult,
  JobCrewMemberSummary,
  JobExecutionPhase,
  JobExecutionSummary,
  JobMaterialLineSummary,
  JobVariationStatus,
  JobVariationSummary,
  JobVehicleAssignmentSummary,
  JobTimelineEventSummary,
  JobWorkflowAction,
  JobWorkflowTransitionRequest,
  ReceiveUnusedDirectPurchaseRequest,
  RecordJobMaterialLineRequest,
  ResolveMaterialStockVarianceRequest,
  ReturnJobMaterialLineRequest,
  SubmitGatedJobCompletionRequest,
} from '@titan/shared';
import {
  JOB_EXECUTION_TRANSITIONS,
  STOCK_VARIANCE_REVIEW_LABEL,
  directPurchaseEvidenceOk,
  evaluateCompletionGate,
  isDirectPurchaseMaterialSource,
  isStockMaterialSource,
  mapWorkflowActionToCommunicationHook,
  materialChargeableQuantity,
  materialFlowSourceFor,
  phaseToJobStatus,
  stockVarianceReviewRequired,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  inventoryItems,
  inventoryLocations,
  inventoryStockLevels,
  jobCompletionSnapshots,
  jobCrewMembers,
  jobDirectCostEntries,
  jobMaterialLines,
  jobs,
  jobVariations,
  jobVehicleAssignments,
  jobWorkflowEvents,
  mobileJobDocumentation,
  mobileJobInventoryUsage,
  mobileTimeEntries,
  securityAuditLogs,
  users,
  vehicles,
} from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';
import { StockMovementError, type StockMovementsService } from './stock-movements.service.js';

export class JobExecutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'JobExecutionError';
  }
}

export type ExecutionScope = {
  companyId: string;
  userId: string;
  roleName?: string;
  permissions?: string[];
};

/** True when the actor can approve/decrement stock directly (Owner/Manager or inventory:write). */
function canAuthorizeMaterials(actor: ExecutionScope): boolean {
  const permissions = actor.permissions ?? [];
  if (permissions.includes('*') || permissions.includes('inventory:write')) {
    return true;
  }
  const role = actor.roleName;
  return role === 'Company Owner' || role === 'Manager' || role === 'Owner' || role === 'Admin';
}

type JobRow = typeof jobs.$inferSelect;

/** Action -> resulting phase. Source phases for each action live in JOB_EXECUTION_TRANSITIONS. */
export const ACTION_TARGET_PHASE: Record<JobWorkflowAction, JobExecutionPhase> = {
  accept: 'accepted',
  en_route: 'en_route',
  arrive: 'on_site',
  start_work: 'in_progress',
  pause: 'paused',
  resume: 'in_progress',
  await_customer: 'awaiting_customer',
  await_parts: 'awaiting_parts',
  await_approval: 'awaiting_approval',
  still_busy: 'work_continues',
  ready_to_complete: 'ready_to_complete',
  complete: 'completed',
  reopen: 'assigned',
};

/** Actions a technician/office user may take from the given phase, excluding the office-only reopen path. */
export function availableActionsForPhase(phase: JobExecutionPhase): JobWorkflowAction[] {
  return (Object.keys(JOB_EXECUTION_TRANSITIONS) as JobWorkflowAction[]).filter(
    (action) => action !== 'reopen' && JOB_EXECUTION_TRANSITIONS[action].includes(phase),
  );
}

/** Matches mobile job documentation photos to a work phase via metadata.phase, falling back to title text. */
export function documentMatchesPhase(
  doc: { title: string; metadata: Record<string, unknown> | null },
  phase: 'before' | 'during' | 'after',
): boolean {
  const metaPhase = doc.metadata && typeof doc.metadata.phase === 'string' ? doc.metadata.phase.toLowerCase() : null;
  if (metaPhase) {
    return metaPhase === phase;
  }
  return doc.title.toLowerCase().includes(phase);
}

/** True when a stored (binary-backed) photo matching the given phase exists among the docs. */
export function hasStoredPhotoEvidence(
  docs: Array<{
    title: string;
    metadata: Record<string, unknown> | null;
    documentationType: string;
    storageKey: string | null;
  }>,
  phase: 'before' | 'during' | 'after',
): boolean {
  return docs.some(
    (doc) => doc.documentationType === 'photo' && documentMatchesPhase(doc, phase) && Boolean(doc.storageKey),
  );
}

/** True when a stored (binary-backed) customer signature exists among the docs. */
export function hasStoredSignatureEvidence(
  docs: Array<{ documentationType: string; storageKey: string | null }>,
): boolean {
  return docs.some((doc) => doc.documentationType === 'customer_signature' && Boolean(doc.storageKey));
}

/** True when the user is the legacy single assignee OR an active crew member on the job. */
export async function userHasJobAccess(
  db: DatabaseClient,
  companyId: string,
  jobId: string,
  userId: string,
): Promise<boolean> {
  const job = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    columns: { assignedUserId: true },
  });

  if (!job) {
    return false;
  }

  if (job.assignedUserId === userId) {
    return true;
  }

  const crewMember = await db.query.jobCrewMembers.findFirst({
    where: and(
      eq(jobCrewMembers.companyId, companyId),
      eq(jobCrewMembers.jobId, jobId),
      eq(jobCrewMembers.userId, userId),
      isNull(jobCrewMembers.unassignedAt),
    ),
    columns: { id: true },
  });

  return Boolean(crewMember);
}

/** All job ids visible to a user: legacy assignee jobs plus jobs where they are an active crew member. */
export async function getJobIdsForUserIncludingCrew(
  db: DatabaseClient,
  companyId: string,
  userId: string,
): Promise<string[]> {
  const [assignedRows, crewRows] = await Promise.all([
    db.query.jobs.findMany({
      where: and(eq(jobs.companyId, companyId), eq(jobs.assignedUserId, userId)),
      columns: { id: true },
    }),
    db.query.jobCrewMembers.findMany({
      where: and(
        eq(jobCrewMembers.companyId, companyId),
        eq(jobCrewMembers.userId, userId),
        isNull(jobCrewMembers.unassignedAt),
      ),
      columns: { jobId: true },
    }),
  ]);

  return Array.from(new Set([...assignedRows.map((row) => row.id), ...crewRows.map((row) => row.jobId)]));
}

/** Keeps job_crew_members aligned with jobs.assignedUserId when set from the classic single-assignee flow. */
export async function upsertPrimaryCrewMember(
  db: DatabaseClient,
  params: { companyId: string; jobId: string; userId: string; assignedByUserId: string | null },
): Promise<void> {
  const now = new Date();

  await db
    .insert(jobCrewMembers)
    .values({
      companyId: params.companyId,
      jobId: params.jobId,
      userId: params.userId,
      crewRole: 'crew_leader',
      isPrimary: true,
      assignedByUserId: params.assignedByUserId,
      assignedAt: now,
    })
    .onConflictDoUpdate({
      target: [jobCrewMembers.jobId, jobCrewMembers.userId],
      set: {
        isPrimary: true,
        unassignedAt: null,
        assignedAt: now,
        assignedByUserId: params.assignedByUserId,
        updatedAt: now,
      },
    });
}

export class JobExecutionService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly stockMovementsService: StockMovementsService,
  ) {}

  async assertUserOnJob(companyId: string, jobId: string, userId: string): Promise<boolean> {
    return userHasJobAccess(this.db, companyId, jobId, userId);
  }

  async assignCrew(
    actor: ExecutionScope,
    jobId: string,
    input: AssignJobCrewRequest,
  ): Promise<{ crew: JobCrewMemberSummary[]; vehicle: JobVehicleAssignmentSummary | null }> {
    const job = await this.requireJob(actor.companyId, jobId);

    if (input.members.length < 2 || input.members.length > 4) {
      throw new JobExecutionError('VALIDATION_ERROR', 'A crew requires between 2 and 4 members');
    }

    const memberIds = input.members.map((member) => member.userId);
    if (new Set(memberIds).size !== memberIds.length) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Crew members must be unique');
    }

    const activeUsers = await this.db.query.users.findMany({
      where: and(inArray(users.id, memberIds), eq(users.companyId, actor.companyId), eq(users.isActive, true)),
      columns: { id: true },
    });
    if (activeUsers.length !== memberIds.length) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        'One or more crew members are not active team members for this company',
      );
    }

    const primaryUserId =
      input.primaryUserId ??
      input.members.find((member) => member.isPrimary)?.userId ??
      input.members.find((member) => member.crewRole === 'crew_leader')?.userId ??
      input.members[0]!.userId;

    if (!memberIds.includes(primaryUserId)) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Primary crew member must be included in the crew');
    }

    if (input.vehicleId) {
      const vehicle = await this.db.query.vehicles.findFirst({
        where: and(eq(vehicles.id, input.vehicleId), eq(vehicles.companyId, actor.companyId)),
        columns: { id: true },
      });
      if (!vehicle) {
        throw new JobExecutionError('NOT_FOUND', 'Vehicle not found for this company');
      }
    }

    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(jobCrewMembers)
        .set({ unassignedAt: now, updatedAt: now })
        .where(
          and(
            eq(jobCrewMembers.companyId, actor.companyId),
            eq(jobCrewMembers.jobId, jobId),
            isNull(jobCrewMembers.unassignedAt),
            notInArray(jobCrewMembers.userId, memberIds),
          ),
        );

      for (const member of input.members) {
        await tx
          .insert(jobCrewMembers)
          .values({
            companyId: actor.companyId,
            jobId,
            userId: member.userId,
            crewRole: member.crewRole,
            isPrimary: member.userId === primaryUserId,
            assignedByUserId: actor.userId,
            assignedAt: now,
          })
          .onConflictDoUpdate({
            target: [jobCrewMembers.jobId, jobCrewMembers.userId],
            set: {
              crewRole: member.crewRole,
              isPrimary: member.userId === primaryUserId,
              unassignedAt: null,
              assignedAt: now,
              assignedByUserId: actor.userId,
              updatedAt: now,
            },
          });
      }

      if (input.vehicleId !== undefined) {
        await tx
          .update(jobVehicleAssignments)
          .set({ unassignedAt: now, updatedAt: now })
          .where(
            and(
              eq(jobVehicleAssignments.companyId, actor.companyId),
              eq(jobVehicleAssignments.jobId, jobId),
              isNull(jobVehicleAssignments.unassignedAt),
            ),
          );

        if (input.vehicleId) {
          await tx.insert(jobVehicleAssignments).values({
            companyId: actor.companyId,
            jobId,
            vehicleId: input.vehicleId,
            assignedByUserId: actor.userId,
            assignedAt: now,
          });
        }
      }

      await tx
        .update(jobs)
        .set({ assignedUserId: primaryUserId, updatedAt: now })
        .where(and(eq(jobs.id, jobId), eq(jobs.companyId, actor.companyId)));

      await tx.insert(jobWorkflowEvents).values({
        companyId: actor.companyId,
        jobId,
        userId: actor.userId,
        action: 'assign_crew',
        fromPhase: job.executionPhase,
        toPhase: job.executionPhase,
        metadata: { memberIds, primaryUserId, vehicleId: input.vehicleId ?? null },
      });

      await tx.insert(securityAuditLogs).values({
        companyId: actor.companyId,
        category: 'workflow',
        action: 'job_crew_assigned',
        entityType: 'job',
        entityId: jobId,
        userId: actor.userId,
        metadata: { memberIds, primaryUserId, vehicleId: input.vehicleId ?? null },
      });
    });

    const [crew, vehicle] = await Promise.all([
      this.getCrew(actor.companyId, jobId),
      this.getActiveVehicle(actor.companyId, jobId),
    ]);

    return { crew, vehicle };
  }

  async getCrew(companyId: string, jobId: string): Promise<JobCrewMemberSummary[]> {
    const rows = await this.db
      .select({ crew: jobCrewMembers, user: users })
      .from(jobCrewMembers)
      .innerJoin(users, eq(jobCrewMembers.userId, users.id))
      .where(
        and(
          eq(jobCrewMembers.companyId, companyId),
          eq(jobCrewMembers.jobId, jobId),
          isNull(jobCrewMembers.unassignedAt),
        ),
      )
      .orderBy(desc(jobCrewMembers.isPrimary), asc(jobCrewMembers.assignedAt));

    return rows.map(({ crew, user }) => toCrewMemberSummary(crew, user));
  }

  async getActiveVehicle(companyId: string, jobId: string): Promise<JobVehicleAssignmentSummary | null> {
    const rows = await this.db
      .select({ assignment: jobVehicleAssignments, vehicle: vehicles })
      .from(jobVehicleAssignments)
      .innerJoin(vehicles, eq(jobVehicleAssignments.vehicleId, vehicles.id))
      .where(
        and(
          eq(jobVehicleAssignments.companyId, companyId),
          eq(jobVehicleAssignments.jobId, jobId),
          isNull(jobVehicleAssignments.unassignedAt),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? toVehicleAssignmentSummary(row.assignment, row.vehicle) : null;
  }

  async transition(scope: ExecutionScope, jobId: string, input: JobWorkflowTransitionRequest): Promise<JobRow> {
    const job = await this.requireJob(scope.companyId, jobId);

    if (input.action === 'complete') {
      throw new JobExecutionError('COMPLETION_GATE_REQUIRED', 'Use the gated completion endpoint to complete a job');
    }
    if (input.action === 'still_busy') {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        'Use the Still Busy endpoint to end the current visit without completing the job',
      );
    }
    if (input.action === 'reopen') {
      throw new JobExecutionError('VALIDATION_ERROR', 'Use the reopen endpoint to reopen a completed job');
    }

    if (input.clientActionId) {
      const existing = await this.db.query.jobWorkflowEvents.findFirst({
        where: and(
          eq(jobWorkflowEvents.companyId, scope.companyId),
          eq(jobWorkflowEvents.clientActionId, input.clientActionId),
        ),
      });
      if (existing) {
        return job;
      }
    }

    const allowedFromPhases = JOB_EXECUTION_TRANSITIONS[input.action];
    if (!allowedFromPhases.includes(job.executionPhase)) {
      throw new JobExecutionError(
        'INVALID_TRANSITION',
        `Cannot perform "${input.action}" while job is ${job.executionPhase.replace(/_/g, ' ')}`,
      );
    }

    if (input.action === 'pause' && !input.reason?.trim()) {
      throw new JobExecutionError('VALIDATION_ERROR', 'A reason is required to pause a job');
    }

    const toPhase = ACTION_TARGET_PHASE[input.action];
    const toStatus = phaseToJobStatus(toPhase);
    const now = new Date();

    const [updated] = await this.db
      .update(jobs)
      .set({ executionPhase: toPhase, executionPhaseUpdatedAt: now, status: toStatus, updatedAt: now })
      .where(and(eq(jobs.id, jobId), eq(jobs.companyId, scope.companyId)))
      .returning();

    if (!updated) {
      throw new JobExecutionError('UPDATE_FAILED', 'Unable to update job');
    }

    await this.db.insert(jobWorkflowEvents).values({
      companyId: scope.companyId,
      jobId,
      userId: scope.userId,
      action: input.action,
      fromPhase: job.executionPhase,
      toPhase,
      fromStatus: job.status,
      toStatus,
      reason: input.reason?.trim() || null,
      clientActionId: input.clientActionId ?? null,
    });

    const communicationHook = mapWorkflowActionToCommunicationHook(input.action);

    if (toStatus !== job.status) {
      emitBusinessEvent({
        companyId: scope.companyId,
        eventType: 'job.status_changed',
        entityType: 'job',
        entityId: jobId,
        actorUserId: scope.userId,
        payload: {
          job: {
            id: jobId,
            status: toStatus,
            customerId: updated.customerId,
            scheduledAt: updated.scheduledAt?.toISOString() ?? null,
          },
          customerId: updated.customerId,
          executionPhase: toPhase,
          /** Readiness hint only — never auto-queues or sends CX messages. */
          dispatchCommunicationHook: communicationHook,
          dispatchCommunicationAutoSend: false,
        },
      });
    }

    return updated;
  }

  /** Office-only path: caller must enforce the requesting role. */
  async reopenJob(actor: ExecutionScope, jobId: string, reason: string): Promise<JobRow> {
    const job = await this.requireJob(actor.companyId, jobId);

    if (job.executionPhase !== 'completed') {
      throw new JobExecutionError('INVALID_TRANSITION', 'Only completed jobs can be reopened');
    }

    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new JobExecutionError('VALIDATION_ERROR', 'A reason is required to reopen a job');
    }

    const hadStarted = await this.db.query.jobWorkflowEvents.findFirst({
      where: and(
        eq(jobWorkflowEvents.companyId, actor.companyId),
        eq(jobWorkflowEvents.jobId, jobId),
        eq(jobWorkflowEvents.action, 'start_work'),
      ),
      columns: { id: true },
    });

    const toPhase: JobExecutionPhase = hadStarted ? 'in_progress' : 'assigned';
    const toStatus = phaseToJobStatus(toPhase);
    const now = new Date();

    const [updated] = await this.db
      .update(jobs)
      .set({
        executionPhase: toPhase,
        executionPhaseUpdatedAt: now,
        status: toStatus,
        reopenReason: trimmedReason,
        reopenAt: now,
        reopenByUserId: actor.userId,
        updatedAt: now,
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.companyId, actor.companyId)))
      .returning();

    if (!updated) {
      throw new JobExecutionError('UPDATE_FAILED', 'Unable to reopen job');
    }

    await this.db.insert(jobWorkflowEvents).values({
      companyId: actor.companyId,
      jobId,
      userId: actor.userId,
      action: 'reopen',
      fromPhase: job.executionPhase,
      toPhase,
      fromStatus: job.status,
      toStatus,
      reason: trimmedReason,
    });

    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'workflow',
      action: 'job_reopened',
      entityType: 'job',
      entityId: jobId,
      userId: actor.userId,
      metadata: { reason: trimmedReason, toPhase },
    });

    emitBusinessEvent({
      companyId: actor.companyId,
      eventType: 'job.status_changed',
      entityType: 'job',
      entityId: jobId,
      actorUserId: actor.userId,
      payload: {
        job: {
          id: jobId,
          status: toStatus,
          customerId: updated.customerId,
          scheduledAt: updated.scheduledAt?.toISOString() ?? null,
        },
        customerId: updated.customerId,
        executionPhase: toPhase,
      },
    });

    return updated;
  }

  async createVariation(
    actor: ExecutionScope,
    jobId: string,
    input: CreateJobVariationRequest,
  ): Promise<JobVariationSummary> {
    await this.requireJob(actor.companyId, jobId);

    const title = input.title.trim();
    const siteCondition = input.siteCondition.trim();
    const explanation = input.explanation.trim();
    if (!title || !siteCondition || !explanation) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        'Title, site condition and explanation are required to raise a variation',
      );
    }

    const [created] = await this.db
      .insert(jobVariations)
      .values({
        companyId: actor.companyId,
        jobId,
        createdByUserId: actor.userId,
        title,
        siteCondition,
        explanation,
        labourEffect: input.labourEffect?.trim() || null,
        materialEffect: input.materialEffect?.trim() || null,
        proposedScope: input.proposedScope?.trim() || null,
        photoDocIds: input.photoDocIds ?? [],
      })
      .returning();

    if (!created) {
      throw new JobExecutionError('CREATE_FAILED', 'Unable to create variation');
    }

    await this.db.insert(jobWorkflowEvents).values({
      companyId: actor.companyId,
      jobId,
      userId: actor.userId,
      action: 'create_variation',
      metadata: { variationId: created.id },
    });

    return toVariationSummary(created);
  }

  async listVariations(
    companyId: string,
    jobId: string,
    status?: JobVariationStatus,
  ): Promise<JobVariationSummary[]> {
    const rows = await this.db.query.jobVariations.findMany({
      where: status
        ? and(
            eq(jobVariations.companyId, companyId),
            eq(jobVariations.jobId, jobId),
            eq(jobVariations.status, status),
          )
        : and(eq(jobVariations.companyId, companyId), eq(jobVariations.jobId, jobId)),
      orderBy: [desc(jobVariations.createdAt)],
    });

    return rows.map(toVariationSummary);
  }

  /** Office-only path: caller must enforce the requesting role. */
  async authorizeVariation(
    actor: ExecutionScope,
    jobId: string,
    variationId: string,
    input: AuthorizeJobVariationRequest,
  ): Promise<JobVariationSummary> {
    const variation = await this.db.query.jobVariations.findFirst({
      where: and(
        eq(jobVariations.id, variationId),
        eq(jobVariations.companyId, actor.companyId),
        eq(jobVariations.jobId, jobId),
      ),
    });

    if (!variation) {
      throw new JobExecutionError('NOT_FOUND', 'Variation not found');
    }
    if (variation.status !== 'pending') {
      throw new JobExecutionError('INVALID_STATE', 'Only pending variations can be authorized');
    }

    const now = new Date();
    const [updated] = await this.db
      .update(jobVariations)
      .set({
        status: input.status,
        authorizedByUserId: actor.userId,
        authorizedAt: now,
        authorizationNotes: input.notes?.trim() || null,
        updatedAt: now,
      })
      .where(and(eq(jobVariations.id, variationId), eq(jobVariations.companyId, actor.companyId)))
      .returning();

    if (!updated) {
      throw new JobExecutionError('UPDATE_FAILED', 'Unable to update variation');
    }

    await this.db.insert(jobWorkflowEvents).values({
      companyId: actor.companyId,
      jobId,
      userId: actor.userId,
      action: 'authorize_variation',
      metadata: { variationId, status: input.status, notes: input.notes ?? null },
    });

    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'workflow',
      action: 'job_variation_authorized',
      entityType: 'job_variation',
      entityId: variationId,
      userId: actor.userId,
      metadata: { jobId, status: input.status },
    });

    return toVariationSummary(updated);
  }

  async recordMaterialLine(
    actor: ExecutionScope,
    jobId: string,
    input: RecordJobMaterialLineRequest,
  ): Promise<JobMaterialLineSummary> {
    await this.requireJob(actor.companyId, jobId);

    if (input.clientActionId) {
      const existing = await this.db.query.jobMaterialLines.findFirst({
        where: and(
          eq(jobMaterialLines.companyId, actor.companyId),
          eq(jobMaterialLines.clientActionId, input.clientActionId),
        ),
      });
      if (existing) {
        return this.hydrateMaterialLine(existing.id, canAuthorizeMaterials(actor));
      }
    }

    const description = input.description.trim();
    if (!description) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Description is required');
    }
    if (input.quantity <= 0) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Quantity must be greater than zero');
    }

    const isStockSource = isStockMaterialSource(input.materialSource);
    const isDirectSource = isDirectPurchaseMaterialSource(input.materialSource);

    if (isDirectSource && !directPurchaseEvidenceOk(input)) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        'DIRECT PURCHASE requires a supplier slip/reference or receipt upload',
      );
    }

    if (isStockSource && input.receiptDocumentationId) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        'STOCK material must not be recorded as a supplier slip expense — use DIRECT PURCHASE for job-bought material',
      );
    }

    const canAuthorize = canAuthorizeMaterials(actor);
    // Technicians (or anyone without inventory:write/manager access) always land in `requested`.
    const requestOnly = canAuthorize ? (input.requestOnly ?? true) : true;
    const attemptImmediateApproval = !requestOnly && canAuthorize;

    if (input.locationId) {
      await this.ensureLocationBelongsToCompany(actor.companyId, input.locationId);
    }
    if (input.inventoryItemId) {
      await this.ensureInventoryItemBelongsToCompany(actor.companyId, input.inventoryItemId);
    }

    const unitCostCents =
      canAuthorize && input.unitCostCents != null && Number.isFinite(input.unitCostCents)
        ? Math.max(0, Math.round(input.unitCostCents))
        : 0;

    const createdRow = await this.db.transaction(async (tx) => {
      const [line] = await tx
        .insert(jobMaterialLines)
        .values({
          companyId: actor.companyId,
          jobId,
          recordedByUserId: actor.userId,
          description,
          quantity: String(input.quantity),
          unit: input.unit?.trim() || 'ea',
          materialSource: input.materialSource,
          status: 'requested',
          inventoryItemId: input.inventoryItemId ?? null,
          locationId: input.locationId ?? null,
          quotedQuantity: input.quotedQuantity != null ? String(input.quotedQuantity) : null,
          clientActionId: input.clientActionId?.trim() || null,
          supplierReference: input.supplierReference?.trim() || null,
          receiptDocumentationId: input.receiptDocumentationId ?? null,
          unitCostCents,
          notes: input.notes?.trim() || null,
        })
        .returning();

      if (!line) {
        throw new JobExecutionError('CREATE_FAILED', 'Unable to record material line');
      }

      if (!attemptImmediateApproval) {
        return line;
      }

      return this.fulfillMaterialLineInTx(tx, {
        actor,
        jobId,
        line,
        fulfilledQuantity: input.quantity,
        inventoryItemId: input.inventoryItemId ?? null,
        locationId: input.locationId ?? null,
        unitCostCents: input.unitCostCents ?? null,
        supplierReference: input.supplierReference ?? null,
        receiptDocumentationId: input.receiptDocumentationId ?? null,
        clientActionId: input.clientActionId?.trim() || `record:${line.id}`,
      });
    });

    await this.db.insert(jobWorkflowEvents).values({
      companyId: actor.companyId,
      jobId,
      userId: actor.userId,
      action: 'record_material_line',
      metadata: {
        materialLineId: createdRow.id,
        status: createdRow.status,
        materialFlowSource: materialFlowSourceFor(createdRow.materialSource),
        clientActionId: input.clientActionId ?? null,
      },
    });

    emitBusinessEvent({
      companyId: actor.companyId,
      eventType: 'job.material_used',
      entityType: 'job_material_line',
      entityId: createdRow.id,
      actorUserId: actor.userId,
      payload: {
        jobId,
        materialLineId: createdRow.id,
        materialSource: createdRow.materialSource,
        status: createdRow.status,
        quantity: createdRow.quantity,
        unit: createdRow.unit,
        inventoryItemId: createdRow.inventoryItemId,
        recordedByUserId: createdRow.recordedByUserId,
      },
    });

    emitBusinessEvent({
      companyId: actor.companyId,
      eventType: 'job.material_line_recorded',
      entityType: 'job_material_line',
      entityId: createdRow.id,
      actorUserId: actor.userId,
      payload: { jobId, materialLineId: createdRow.id, status: createdRow.status },
    });

    return this.hydrateMaterialLine(createdRow.id, canAuthorize);
  }

  /**
   * Office decision on a `requested` material line.
   * STOCK → decrement inventory once (never negative; shortfall → STOCK VARIANCE).
   * DIRECT PURCHASE → job expense / JPE via material_line direct cost — no stock decrement.
   */
  async authorizeMaterialLine(
    actor: ExecutionScope,
    jobId: string,
    materialLineId: string,
    input: AuthorizeJobMaterialLineRequest,
  ): Promise<JobMaterialLineSummary> {
    if (!canAuthorizeMaterials(actor)) {
      throw new JobExecutionError(
        'FORBIDDEN',
        'Only Owner/Manager or inventory:write may authorize material requests',
      );
    }

    await this.requireJob(actor.companyId, jobId);

    const line = await this.db.query.jobMaterialLines.findFirst({
      where: and(
        eq(jobMaterialLines.id, materialLineId),
        eq(jobMaterialLines.companyId, actor.companyId),
        eq(jobMaterialLines.jobId, jobId),
      ),
    });

    if (!line) {
      throw new JobExecutionError('NOT_FOUND', 'Material line not found');
    }

    if (line.status !== 'requested') {
      return this.hydrateMaterialLine(line.id);
    }

    const now = new Date();
    const requestedQuantity = Number(line.quantity);

    if (input.decision === 'reject') {
      const reason = input.reason?.trim();
      if (!reason) {
        throw new JobExecutionError('VALIDATION_ERROR', 'Rejection reason is required');
      }

      const [updated] = await this.db
        .update(jobMaterialLines)
        .set({
          status: 'rejected',
          rejectionReason: reason,
          approvedByUserId: actor.userId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(jobMaterialLines.id, materialLineId))
        .returning();

      await this.db.insert(jobWorkflowEvents).values({
        companyId: actor.companyId,
        jobId,
        userId: actor.userId,
        action: 'reject_material_line',
        metadata: { materialLineId, reason, clientActionId: input.clientActionId },
      });

      await this.db.insert(securityAuditLogs).values({
        companyId: actor.companyId,
        category: 'inventory',
        action: 'material_line_rejected',
        entityType: 'job_material_line',
        entityId: materialLineId,
        userId: actor.userId,
        metadata: { jobId, reason, clientActionId: input.clientActionId },
      });

      return this.hydrateMaterialLine((updated ?? line).id);
    }

    const requestedFulfilled =
      input.decision === 'partial' ? (input.fulfilledQuantity ?? 0) : requestedQuantity;

    if (!requestedFulfilled || requestedFulfilled <= 0) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Fulfilled quantity must be greater than zero');
    }
    if (requestedFulfilled > requestedQuantity) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        'Fulfilled quantity cannot exceed the requested quantity',
      );
    }

    const updatedRow = await this.db.transaction(async (tx) =>
      this.fulfillMaterialLineInTx(tx, {
        actor,
        jobId,
        line,
        fulfilledQuantity: requestedFulfilled,
        inventoryItemId: input.inventoryItemId ?? line.inventoryItemId,
        locationId: input.locationId ?? line.locationId,
        unitCostCents: input.unitCostCents ?? null,
        supplierReference: input.supplierReference ?? line.supplierReference,
        receiptDocumentationId: input.receiptDocumentationId ?? line.receiptDocumentationId,
        clientActionId: input.clientActionId,
      }),
    );

    await this.db.insert(jobWorkflowEvents).values({
      companyId: actor.companyId,
      jobId,
      userId: actor.userId,
      action: 'authorize_material_line',
      metadata: {
        materialLineId,
        decision: input.decision,
        fulfilledQuantity: updatedRow.fulfilledQuantity,
        stockVarianceStatus: updatedRow.stockVarianceStatus,
        clientActionId: input.clientActionId,
      },
    });

    emitBusinessEvent({
      companyId: actor.companyId,
      eventType: 'job.material_used',
      entityType: 'job_material_line',
      entityId: materialLineId,
      actorUserId: actor.userId,
      payload: {
        jobId,
        materialLineId,
        status: updatedRow.status,
        fulfilledQuantity: updatedRow.fulfilledQuantity,
        stockVarianceStatus: updatedRow.stockVarianceStatus,
      },
    });

    return this.hydrateMaterialLine(updatedRow.id);
  }

  /**
   * Returns unused STOCK material to inventory. Partial returns keep chargeable used qty on the job.
   * DIRECT PURCHASE unused material must use receiveUnusedDirectPurchaseIntoStock.
   */
  async returnMaterialLine(
    actor: ExecutionScope,
    jobId: string,
    materialLineId: string,
    input: ReturnJobMaterialLineRequest,
  ): Promise<JobMaterialLineSummary> {
    await this.requireJob(actor.companyId, jobId);

    const line = await this.db.query.jobMaterialLines.findFirst({
      where: and(
        eq(jobMaterialLines.id, materialLineId),
        eq(jobMaterialLines.companyId, actor.companyId),
        eq(jobMaterialLines.jobId, jobId),
      ),
    });

    if (!line) {
      throw new JobExecutionError('NOT_FOUND', 'Material line not found');
    }

    if (line.status === 'returned') {
      return this.hydrateMaterialLine(line.id, canAuthorizeMaterials(actor));
    }

    if (!['used', 'partially_fulfilled', 'approved'].includes(line.status)) {
      throw new JobExecutionError(
        'INVALID_STATUS',
        `Cannot return a material line in status ${line.status}`,
      );
    }

    if (isDirectPurchaseMaterialSource(line.materialSource) && !line.inventoryItemId) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        'Unused DIRECT PURCHASE material must be received into stock (not returned as stock issue)',
      );
    }

    if (!input.quantity || input.quantity <= 0) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Return quantity must be greater than zero');
    }

    const reason = input.reason?.trim();
    if (!reason) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Return reason is required');
    }

    const fulfilled =
      line.fulfilledQuantity != null ? Number(line.fulfilledQuantity) : Number(line.quantity);
    const alreadyReturned = Number(line.returnedQuantity ?? 0);
    const returnable = Math.max(0, fulfilled - alreadyReturned);
    if (input.quantity > returnable) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        `Cannot return more than the remaining quantity on the job (${returnable})`,
      );
    }

    if (!line.inventoryItemId || !line.locationId) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        'Material line has no linked stock item/location to return to',
      );
    }

    const newReturned = alreadyReturned + input.quantity;
    const fullyReturned = newReturned >= fulfilled - 1e-9;

    const updatedRow = await this.db.transaction(async (tx) => {
      let movement;
      try {
        movement = await this.stockMovementsService.applyMovement(tx, {
          companyId: actor.companyId,
          itemId: line.inventoryItemId!,
          locationId: line.locationId!,
          movementType: 'return_to_stock',
          quantityDelta: Math.round(input.quantity),
          jobId,
          jobMaterialLineId: materialLineId,
          reason: 'job_material_return',
          notes: reason,
          clientActionId: `${input.clientActionId}:return`,
          recordedByUserId: actor.userId,
        });
      } catch (error) {
        if (error instanceof StockMovementError) {
          throw new JobExecutionError(error.code, error.message);
        }
        throw error;
      }

      const [row] = await tx
        .update(jobMaterialLines)
        .set({
          status: fullyReturned ? 'returned' : line.status === 'partially_fulfilled' ? 'partially_fulfilled' : 'used',
          returnedQuantity: String(newReturned),
          returnReason: reason,
          stockMovementId: movement.id,
          updatedAt: new Date(),
        })
        .where(eq(jobMaterialLines.id, materialLineId))
        .returning();

      if (line.directCostEntryId) {
        const chargeable = Math.max(0, fulfilled - newReturned);
        await tx
          .update(jobDirectCostEntries)
          .set({
            amountCents: Math.round(chargeable * (line.unitCostCents ?? 0)),
            quantity: String(chargeable),
            updatedAt: new Date(),
          })
          .where(eq(jobDirectCostEntries.id, line.directCostEntryId));
      }

      return row ?? line;
    });

    await this.db.insert(jobWorkflowEvents).values({
      companyId: actor.companyId,
      jobId,
      userId: actor.userId,
      action: 'return_material_line',
      metadata: {
        materialLineId,
        quantity: input.quantity,
        returnedQuantity: newReturned,
        reason,
        clientActionId: input.clientActionId,
      },
    });

    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'inventory',
      action: 'material_line_returned_to_stock',
      entityType: 'job_material_line',
      entityId: materialLineId,
      userId: actor.userId,
      metadata: {
        jobId,
        quantity: input.quantity,
        returnedQuantity: newReturned,
        inventoryItemId: line.inventoryItemId,
        locationId: line.locationId,
        clientActionId: input.clientActionId,
      },
    });

    return this.hydrateMaterialLine(updatedRow.id, canAuthorizeMaterials(actor));
  }

  /**
   * Unused DIRECT PURCHASE material comes back to van/store:
   * Job purchase → unused qty → RECEIVE INTO STOCK (audited). Job keeps only chargeable used cost.
   */
  async receiveUnusedDirectPurchaseIntoStock(
    actor: ExecutionScope,
    jobId: string,
    materialLineId: string,
    input: ReceiveUnusedDirectPurchaseRequest,
  ): Promise<JobMaterialLineSummary> {
    if (!canAuthorizeMaterials(actor)) {
      throw new JobExecutionError(
        'FORBIDDEN',
        'Only Owner/Manager or inventory:write may receive unused direct-purchase material into stock',
      );
    }

    await this.requireJob(actor.companyId, jobId);

    const line = await this.db.query.jobMaterialLines.findFirst({
      where: and(
        eq(jobMaterialLines.id, materialLineId),
        eq(jobMaterialLines.companyId, actor.companyId),
        eq(jobMaterialLines.jobId, jobId),
      ),
    });

    if (!line) {
      throw new JobExecutionError('NOT_FOUND', 'Material line not found');
    }

    if (!isDirectPurchaseMaterialSource(line.materialSource)) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        'Only DIRECT PURCHASE lines can receive unused material into stock this way',
      );
    }

    if (!['used', 'partially_fulfilled', 'approved'].includes(line.status)) {
      throw new JobExecutionError(
        'INVALID_STATUS',
        `Cannot receive unused material for status ${line.status}`,
      );
    }

    if (!input.quantity || input.quantity <= 0) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Quantity must be greater than zero');
    }

    const reason = input.reason?.trim();
    if (!reason) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Reason is required');
    }

    await this.ensureLocationBelongsToCompany(actor.companyId, input.locationId);
    await this.ensureInventoryItemBelongsToCompany(actor.companyId, input.inventoryItemId);

    const fulfilled =
      line.fulfilledQuantity != null ? Number(line.fulfilledQuantity) : Number(line.quantity);
    const alreadyReturned = Number(line.returnedQuantity ?? 0);
    const returnable = Math.max(0, fulfilled - alreadyReturned);
    if (input.quantity > returnable) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        `Cannot receive more than unused quantity on the job (${returnable})`,
      );
    }

    const unitCostCents =
      input.unitCostCents != null && Number.isFinite(input.unitCostCents)
        ? Math.max(0, Math.round(input.unitCostCents))
        : line.unitCostCents ?? 0;
    const newReturned = alreadyReturned + input.quantity;
    const fullyReturned = newReturned >= fulfilled - 1e-9;

    const updatedRow = await this.db.transaction(async (tx) => {
      let movement;
      try {
        movement = await this.stockMovementsService.applyMovement(tx, {
          companyId: actor.companyId,
          itemId: input.inventoryItemId,
          locationId: input.locationId,
          movementType: 'receipt',
          quantityDelta: Math.round(input.quantity),
          unitCostCents,
          jobId,
          jobMaterialLineId: materialLineId,
          reason: 'direct_purchase_unused_receive',
          notes: reason,
          clientActionId: `${input.clientActionId}:receive`,
          recordedByUserId: actor.userId,
        });
      } catch (error) {
        if (error instanceof StockMovementError) {
          throw new JobExecutionError(error.code, error.message);
        }
        throw error;
      }

      const [row] = await tx
        .update(jobMaterialLines)
        .set({
          status: fullyReturned ? 'returned' : line.status,
          returnedQuantity: String(newReturned),
          inventoryItemId: input.inventoryItemId,
          locationId: input.locationId,
          unitCostCents,
          returnReason: reason,
          stockMovementId: movement.id,
          updatedAt: new Date(),
        })
        .where(eq(jobMaterialLines.id, materialLineId))
        .returning();

      if (line.directCostEntryId) {
        const chargeable = Math.max(0, fulfilled - newReturned);
        await tx
          .update(jobDirectCostEntries)
          .set({
            amountCents: Math.round(chargeable * unitCostCents),
            quantity: String(chargeable),
            unitCostCents,
            inventoryItemId: input.inventoryItemId,
            updatedAt: new Date(),
          })
          .where(eq(jobDirectCostEntries.id, line.directCostEntryId));
      }

      return row ?? line;
    });

    await this.db.insert(jobWorkflowEvents).values({
      companyId: actor.companyId,
      jobId,
      userId: actor.userId,
      action: 'receive_unused_direct_purchase',
      metadata: {
        materialLineId,
        quantity: input.quantity,
        returnedQuantity: newReturned,
        inventoryItemId: input.inventoryItemId,
        locationId: input.locationId,
        clientActionId: input.clientActionId,
      },
    });

    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'inventory',
      action: 'direct_purchase_received_into_stock',
      entityType: 'job_material_line',
      entityId: materialLineId,
      userId: actor.userId,
      metadata: {
        jobId,
        quantity: input.quantity,
        unitCostCents,
        inventoryItemId: input.inventoryItemId,
        locationId: input.locationId,
        supplierReference: line.supplierReference,
        receiptDocumentationId: line.receiptDocumentationId,
        clientActionId: input.clientActionId,
      },
    });

    return this.hydrateMaterialLine(updatedRow.id);
  }

  /** Owner/Admin resolves STOCK VARIANCE — REVIEW REQUIRED with audit trail. */
  async resolveMaterialStockVariance(
    actor: ExecutionScope,
    jobId: string,
    materialLineId: string,
    input: ResolveMaterialStockVarianceRequest,
  ): Promise<JobMaterialLineSummary> {
    if (!canAuthorizeMaterials(actor)) {
      throw new JobExecutionError(
        'FORBIDDEN',
        'Only Owner/Manager or inventory:write may resolve stock variance',
      );
    }

    await this.requireJob(actor.companyId, jobId);

    const line = await this.db.query.jobMaterialLines.findFirst({
      where: and(
        eq(jobMaterialLines.id, materialLineId),
        eq(jobMaterialLines.companyId, actor.companyId),
        eq(jobMaterialLines.jobId, jobId),
      ),
    });

    if (!line) {
      throw new JobExecutionError('NOT_FOUND', 'Material line not found');
    }

    if (line.stockVarianceStatus !== 'review_required') {
      return this.hydrateMaterialLine(line.id);
    }

    const notes = input.resolutionNotes.trim();
    if (!notes) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Resolution notes are required');
    }

    const now = new Date();
    const patch: Partial<typeof jobMaterialLines.$inferInsert> = {
      stockVarianceStatus: 'resolved',
      stockVarianceNotes: notes,
      stockVarianceResolvedByUserId: actor.userId,
      stockVarianceResolvedAt: now,
      updatedAt: now,
    };

    if (
      input.correctedFulfilledQuantity != null &&
      Number.isFinite(input.correctedFulfilledQuantity) &&
      input.correctedFulfilledQuantity >= 0
    ) {
      const fulfilled = Number(line.fulfilledQuantity ?? line.quantity);
      const returned = Number(line.returnedQuantity ?? 0);
      if (input.correctedFulfilledQuantity < returned) {
        throw new JobExecutionError(
          'VALIDATION_ERROR',
          'Corrected fulfilled quantity cannot be below returned quantity',
        );
      }
      patch.fulfilledQuantity = String(input.correctedFulfilledQuantity);
      if (input.correctedFulfilledQuantity <= returned) {
        patch.status = 'returned';
      } else if (input.correctedFulfilledQuantity < Number(line.quantity)) {
        patch.status = 'partially_fulfilled';
      } else if (isStockMaterialSource(line.materialSource)) {
        patch.status = 'used';
      }
      void fulfilled;
    }

    const [updated] = await this.db
      .update(jobMaterialLines)
      .set(patch)
      .where(eq(jobMaterialLines.id, materialLineId))
      .returning();

    await this.db.insert(jobWorkflowEvents).values({
      companyId: actor.companyId,
      jobId,
      userId: actor.userId,
      action: 'resolve_material_stock_variance',
      metadata: {
        materialLineId,
        resolutionNotes: notes,
        correctedFulfilledQuantity: input.correctedFulfilledQuantity ?? null,
        clientActionId: input.clientActionId,
      },
    });

    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'inventory',
      action: 'material_stock_variance_resolved',
      entityType: 'job_material_line',
      entityId: materialLineId,
      userId: actor.userId,
      metadata: {
        jobId,
        resolutionNotes: notes,
        correctedFulfilledQuantity: input.correctedFulfilledQuantity ?? null,
        previousNotes: line.stockVarianceNotes,
        clientActionId: input.clientActionId,
      },
    });

    return this.hydrateMaterialLine((updated ?? line).id);
  }

  /** Owner queue: material lines flagged STOCK VARIANCE — REVIEW REQUIRED. */
  async listStockVarianceMaterialLines(
    companyId: string,
    includeCost = true,
  ): Promise<JobMaterialLineSummary[]> {
    const rows = await this.db.query.jobMaterialLines.findMany({
      where: and(
        eq(jobMaterialLines.companyId, companyId),
        eq(jobMaterialLines.stockVarianceStatus, 'review_required'),
      ),
      with: { inventoryItem: true, location: true, recordedBy: true, approvedBy: true, job: true },
      orderBy: [desc(jobMaterialLines.updatedAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      ...toMaterialLineSummary(row, includeCost),
      jobNumber: row.job?.jobNumber ?? null,
    }));
  }

  async listMaterialLines(
    companyId: string,
    jobId: string,
    includeCost = true,
  ): Promise<JobMaterialLineSummary[]> {
    const rows = await this.db.query.jobMaterialLines.findMany({
      where: and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId)),
      with: { inventoryItem: true, location: true, recordedBy: true, approvedBy: true },
      orderBy: [desc(jobMaterialLines.createdAt)],
    });

    return rows.map((row) => toMaterialLineSummary(row, includeCost));
  }

  /** Office-facing cross-job queue of technician material requests awaiting a decision. */
  async listPendingMaterialRequests(
    companyId: string,
    includeCost = true,
  ): Promise<JobMaterialLineSummary[]> {
    const rows = await this.db.query.jobMaterialLines.findMany({
      where: and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.status, 'requested')),
      with: { inventoryItem: true, location: true, recordedBy: true, approvedBy: true, job: true },
      orderBy: [desc(jobMaterialLines.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      ...toMaterialLineSummary(row, includeCost),
      jobNumber: row.job?.jobNumber ?? null,
    }));
  }

  private async hydrateMaterialLine(
    materialLineId: string,
    includeCost = true,
  ): Promise<JobMaterialLineSummary> {
    const row = await this.db.query.jobMaterialLines.findFirst({
      where: eq(jobMaterialLines.id, materialLineId),
      with: { inventoryItem: true, location: true, recordedBy: true, approvedBy: true },
    });

    if (!row) {
      throw new JobExecutionError('NOT_FOUND', 'Material line not found');
    }

    return toMaterialLineSummary(row, includeCost);
  }

  private async ensureLocationBelongsToCompany(companyId: string, locationId: string): Promise<void> {
    const location = await this.db.query.inventoryLocations.findFirst({
      where: and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId)),
    });
    if (!location) {
      throw new JobExecutionError('LOCATION_NOT_FOUND', 'Inventory location not found');
    }
  }

  private async ensureInventoryItemBelongsToCompany(companyId: string, itemId: string): Promise<void> {
    const item = await this.db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.id, itemId), eq(inventoryItems.companyId, companyId)),
    });
    if (!item) {
      throw new JobExecutionError('ITEM_NOT_FOUND', 'Inventory item not found');
    }
  }

  private async getOnHandQuantity(
    dbOrTx: DatabaseClient | Parameters<StockMovementsService['applyMovement']>[0],
    companyId: string,
    itemId: string,
    locationId: string,
  ): Promise<number> {
    const level = await dbOrTx.query.inventoryStockLevels.findFirst({
      where: and(
        eq(inventoryStockLevels.companyId, companyId),
        eq(inventoryStockLevels.itemId, itemId),
        eq(inventoryStockLevels.locationId, locationId),
      ),
    });
    return level?.quantityOnHand ?? 0;
  }

  /**
   * Single fulfillment path for STOCK vs DIRECT PURCHASE — prevents double-count and negatives.
   */
  private async fulfillMaterialLineInTx(
    tx: Parameters<StockMovementsService['applyMovement']>[0],
    args: {
      actor: ExecutionScope;
      jobId: string;
      line: typeof jobMaterialLines.$inferSelect;
      fulfilledQuantity: number;
      inventoryItemId: string | null;
      locationId: string | null;
      unitCostCents: number | null;
      supplierReference: string | null;
      receiptDocumentationId: string | null;
      clientActionId: string;
    },
  ): Promise<typeof jobMaterialLines.$inferSelect> {
    const {
      actor,
      jobId,
      line,
      inventoryItemId,
      locationId,
      clientActionId,
    } = args;
    const now = new Date();
    const requestedQuantity = Number(line.quantity);
    const isStockSource = isStockMaterialSource(line.materialSource);
    const isDirectSource = isDirectPurchaseMaterialSource(line.materialSource);
    const supplierReference = args.supplierReference?.trim() || line.supplierReference;
    const receiptDocumentationId = args.receiptDocumentationId ?? line.receiptDocumentationId;

    if (isStockSource && (!inventoryItemId || !locationId)) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        'Inventory item and stock location are required to approve STOCK material use',
      );
    }

    if (isDirectSource && !directPurchaseEvidenceOk({ supplierReference, receiptDocumentationId })) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        'DIRECT PURCHASE requires a supplier slip/reference or receipt upload before approval',
      );
    }

    if (locationId) {
      const location = await tx.query.inventoryLocations.findFirst({
        where: and(
          eq(inventoryLocations.id, locationId),
          eq(inventoryLocations.companyId, actor.companyId),
        ),
      });
      if (!location) {
        throw new JobExecutionError('LOCATION_NOT_FOUND', 'Inventory location not found');
      }
    }
    if (inventoryItemId) {
      const item = await tx.query.inventoryItems.findFirst({
        where: and(
          eq(inventoryItems.id, inventoryItemId),
          eq(inventoryItems.companyId, actor.companyId),
        ),
      });
      if (!item) {
        throw new JobExecutionError('ITEM_NOT_FOUND', 'Inventory item not found');
      }
    }

    let issueQuantity = args.fulfilledQuantity;
    let unitCostCents =
      args.unitCostCents != null && Number.isFinite(args.unitCostCents)
        ? Math.max(0, Math.round(args.unitCostCents))
        : line.unitCostCents ?? 0;
    let stockMovementId: string | null = line.stockMovementId;
    let stockVarianceStatus: (typeof jobMaterialLines.$inferSelect)['stockVarianceStatus'] =
      line.stockVarianceStatus ?? 'none';
    let stockVarianceNotes: string | null = line.stockVarianceNotes ?? null;
    let directCostEntryId: string | null = line.directCostEntryId ?? null;

    if (isStockSource && inventoryItemId && locationId) {
      const available = await this.getOnHandQuantity(tx, actor.companyId, inventoryItemId, locationId);
      const variance = stockVarianceReviewRequired({
        requestedQuantity: args.fulfilledQuantity,
        availableQuantity: available,
      });

      if (variance) {
        issueQuantity = Math.max(0, Math.min(args.fulfilledQuantity, available));
        stockVarianceStatus = 'review_required';
        stockVarianceNotes = `${STOCK_VARIANCE_REVIEW_LABEL}: requested ${args.fulfilledQuantity}, on hand ${available}, issued ${issueQuantity}`;
      }

      if (issueQuantity > 0) {
        // Stock ledger is integer on-hand; truncate fractional request to whole units.
        const stockIssueQty = Math.trunc(issueQuantity);
        issueQuantity = stockIssueQty;
        if (stockIssueQty > 0) {
          try {
            const movement = await this.stockMovementsService.applyMovement(tx, {
              companyId: actor.companyId,
              itemId: inventoryItemId,
              locationId,
              movementType: 'issue',
              quantityDelta: -stockIssueQty,
              jobId,
              jobMaterialLineId: line.id,
              reason: 'job_material_issue',
              clientActionId: `${clientActionId}:issue`,
              recordedByUserId: actor.userId,
            });
            unitCostCents = movement.unitCostCents;
            stockMovementId = movement.id;
          } catch (error) {
            if (error instanceof StockMovementError) {
              if (error.code === 'INSUFFICIENT_STOCK') {
                stockVarianceStatus = 'review_required';
                stockVarianceNotes = `${STOCK_VARIANCE_REVIEW_LABEL}: ${error.message}`;
                issueQuantity = 0;
              } else {
                throw new JobExecutionError(error.code, error.message);
              }
            } else {
              throw error;
            }
          }
        }
      }

      await tx.insert(securityAuditLogs).values({
        companyId: actor.companyId,
        category: 'inventory',
        action:
          stockVarianceStatus === 'review_required'
            ? 'material_stock_variance_flagged'
            : 'material_stock_issued',
        entityType: 'job_material_line',
        entityId: line.id,
        userId: actor.userId,
        metadata: {
          jobId,
          inventoryItemId,
          locationId,
          requestedQuantity: args.fulfilledQuantity,
          issuedQuantity: issueQuantity,
          stockVarianceStatus,
          clientActionId,
        },
      });
    }

    if (isDirectSource) {
      // Authoritative DIRECT PURCHASE path: job expense once — never also issue from inventory.
      const amountCents = Math.round(args.fulfilledQuantity * unitCostCents);
      const existingCost = await tx.query.jobDirectCostEntries.findFirst({
        where: and(
          eq(jobDirectCostEntries.companyId, actor.companyId),
          eq(jobDirectCostEntries.sourceType, 'material_line'),
          eq(jobDirectCostEntries.sourceId, line.id),
        ),
      });

      if (existingCost) {
        directCostEntryId = existingCost.id;
        await tx
          .update(jobDirectCostEntries)
          .set({
            amountCents,
            quantity: String(args.fulfilledQuantity),
            unitCostCents,
            receiptDocumentId: receiptDocumentationId,
            notes: supplierReference ? `Supplier ref: ${supplierReference}` : existingCost.notes,
            updatedAt: now,
          })
          .where(eq(jobDirectCostEntries.id, existingCost.id));
      } else {
        const [cost] = await tx
          .insert(jobDirectCostEntries)
          .values({
            companyId: actor.companyId,
            jobId,
            category: 'consumables',
            description: line.description,
            amountCents,
            quantity: String(args.fulfilledQuantity),
            unitCostCents,
            inventoryItemId: inventoryItemId ?? null,
            sourceType: 'material_line',
            sourceId: line.id,
            costDate: now,
            enteredByUserId: actor.userId,
            receiptDocumentId: receiptDocumentationId,
            notes: supplierReference ? `Supplier ref: ${supplierReference}` : null,
          })
          .returning();
        directCostEntryId = cost?.id ?? null;
      }

      issueQuantity = args.fulfilledQuantity;

      await tx.insert(securityAuditLogs).values({
        companyId: actor.companyId,
        category: 'financial',
        action: 'material_direct_purchase_posted',
        entityType: 'job_material_line',
        entityId: line.id,
        userId: actor.userId,
        metadata: {
          jobId,
          directCostEntryId,
          amountCents,
          supplierReference,
          receiptDocumentationId,
          clientActionId,
          inventoryDecremented: false,
        },
      });
    }

    const status: (typeof jobMaterialLines.$inferSelect)['status'] =
      issueQuantity <= 0 && stockVarianceStatus === 'review_required'
        ? 'partially_fulfilled'
        : issueQuantity < requestedQuantity
          ? 'partially_fulfilled'
          : isStockSource
            ? 'used'
            : 'approved';

    const [row] = await tx
      .update(jobMaterialLines)
      .set({
        status,
        fulfilledQuantity: String(issueQuantity),
        inventoryItemId: inventoryItemId ?? null,
        locationId: locationId ?? null,
        unitCostCents,
        stockMovementId,
        supplierReference: supplierReference ?? null,
        receiptDocumentationId: receiptDocumentationId ?? null,
        directCostEntryId,
        stockVarianceStatus,
        stockVarianceNotes,
        approvedByUserId: actor.userId,
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(jobMaterialLines.id, line.id))
      .returning();

    return row ?? line;
  }

  /** Office-facing rollup used by the execution summary endpoint. */
  async getExecutionSummary(scope: ExecutionScope, jobId: string): Promise<JobExecutionSummary> {
    const job = await this.requireJob(scope.companyId, jobId);

    const [crew, vehicle, pendingVariations, completionGate, completionSnapshotRow, docs, labourRows] =
      await Promise.all([
        this.getCrew(scope.companyId, jobId),
        this.getActiveVehicle(scope.companyId, jobId),
        this.listVariations(scope.companyId, jobId, 'pending'),
        this.getCompletionGate(scope, jobId),
        this.db.query.jobCompletionSnapshots.findFirst({
          where: and(
            eq(jobCompletionSnapshots.companyId, scope.companyId),
            eq(jobCompletionSnapshots.jobId, jobId),
          ),
          columns: {
            id: true,
            jobId: true,
            completedByUserId: true,
            createdAt: true,
            snapshot: true,
          },
        }),
        this.db.query.mobileJobDocumentation.findMany({
          where: and(
            eq(mobileJobDocumentation.companyId, scope.companyId),
            eq(mobileJobDocumentation.jobId, jobId),
          ),
          orderBy: [desc(mobileJobDocumentation.createdAt)],
          columns: {
            id: true,
            documentationType: true,
            title: true,
            evidencePhase: true,
            attachmentCategory: true,
            clientVisible: true,
            userId: true,
            storageKey: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        }),
        this.db.query.mobileTimeEntries.findMany({
          where: and(
            eq(mobileTimeEntries.companyId, scope.companyId),
            eq(mobileTimeEntries.jobId, jobId),
          ),
          columns: { durationMinutes: true },
        }),
      ]);

    const labourTotalMinutes = labourRows.reduce(
      (sum, row) => sum + (row.durationMinutes ?? 0),
      0,
    );

    return {
      jobId,
      executionPhase: job.executionPhase,
      status: job.status,
      crew,
      vehicle,
      pendingVariations,
      completionGate,
      completionSnapshot: completionSnapshotRow
        ? {
            id: completionSnapshotRow.id,
            jobId: completionSnapshotRow.jobId,
            completedByUserId: completionSnapshotRow.completedByUserId,
            createdAt: completionSnapshotRow.createdAt.toISOString(),
            snapshot: completionSnapshotRow.snapshot as Record<string, unknown>,
          }
        : null,
      labour: {
        entryCount: labourRows.length,
        totalMinutes: labourTotalMinutes,
      },
      evidence: docs.map((doc) => {
        const hasBinary = Boolean(doc.storageKey);
        return {
          id: doc.id,
          documentationType: doc.documentationType,
          title: doc.title,
          evidencePhase: doc.evidencePhase,
          attachmentCategory: doc.attachmentCategory ?? null,
          clientVisible: doc.clientVisible ?? false,
          hasBinary,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          uploadedByUserId: doc.userId ?? null,
          createdAt: doc.createdAt.toISOString(),
          downloadPath: hasBinary
            ? `/api/v1/jobs/${jobId}/evidence/${doc.id}/content`
            : null,
        };
      }),
    };
  }

  /** Job 360 operational timeline from existing workflow events (tenant-scoped). */
  async listTimeline(scope: ExecutionScope, jobId: string): Promise<JobTimelineEventSummary[]> {
    await this.requireJob(scope.companyId, jobId);

    const rows = await this.db.query.jobWorkflowEvents.findMany({
      where: and(eq(jobWorkflowEvents.companyId, scope.companyId), eq(jobWorkflowEvents.jobId, jobId)),
      orderBy: [desc(jobWorkflowEvents.createdAt)],
      limit: 200,
    });

    const userIds = [...new Set(rows.map((row) => row.userId))];
    const userRows =
      userIds.length > 0
        ? await this.db.query.users.findMany({
            where: and(eq(users.companyId, scope.companyId), inArray(users.id, userIds)),
            columns: { id: true, firstName: true, lastName: true },
          })
        : [];
    const usersById = new Map(userRows.map((user) => [user.id, user]));

    return rows.map((row) => {
      const user = usersById.get(row.userId);
      return {
        id: row.id,
        action: row.action,
        fromPhase: row.fromPhase,
        toPhase: row.toPhase,
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        reason: row.reason,
        userId: row.userId,
        userName: user ? `${user.firstName} ${user.lastName}`.trim() : null,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async getCompletionGate(scope: ExecutionScope, jobId: string): Promise<JobCompletionGateResult> {
    const job = await this.requireJob(scope.companyId, jobId);
    const context = await this.collectGateContext(scope.companyId, jobId);

    return evaluateCompletionGate({
      jobType: job.jobType,
      workPerformedSummary: null,
      checklist: {},
      hasBeforePhoto: context.hasBeforePhoto,
      hasAfterPhoto: context.hasAfterPhoto,
      hasLabour: context.hasLabour,
      hasMaterialsOrExplicitNone: context.hasMaterials,
      siteCondition: null,
      customerRepName: null,
      hasSignature: context.hasStoredSignature,
      signatureUnavailableReason: null,
      cocRequired: null,
      technicianDeclaration: false,
      pendingVariationCount: context.pendingVariationCount,
    });
  }

  async completeGated(
    scope: ExecutionScope,
    jobId: string,
    input: SubmitGatedJobCompletionRequest,
  ): Promise<JobRow> {
    const job = await this.requireJob(scope.companyId, jobId);

    if (input.clientActionId) {
      const existing = await this.db.query.jobWorkflowEvents.findFirst({
        where: and(
          eq(jobWorkflowEvents.companyId, scope.companyId),
          eq(jobWorkflowEvents.clientActionId, input.clientActionId),
        ),
      });
      if (existing) {
        return this.requireJob(scope.companyId, jobId);
      }
    }

    if (!JOB_EXECUTION_TRANSITIONS.complete.includes(job.executionPhase)) {
      throw new JobExecutionError(
        'INVALID_TRANSITION',
        `Cannot complete a job in ${job.executionPhase.replace(/_/g, ' ')} phase`,
      );
    }

    const existingSnapshot = await this.db.query.jobCompletionSnapshots.findFirst({
      where: and(
        eq(jobCompletionSnapshots.companyId, scope.companyId),
        eq(jobCompletionSnapshots.jobId, jobId),
      ),
      columns: { createdAt: true },
    });
    if (existingSnapshot) {
      const reopenedSinceSnapshot =
        job.reopenAt != null && job.reopenAt.getTime() > existingSnapshot.createdAt.getTime();
      if (!reopenedSinceSnapshot) {
        throw new JobExecutionError(
          'COMPLETION_SNAPSHOT_EXISTS',
          'A completion snapshot already exists for this job — reopen the job with a reason before recording a new completion',
        );
      }
    }

    const context = await this.collectGateContext(scope.companyId, jobId);
    const explicitNoMaterials = input.checklist?.materials_not_required === true;

    let hasValidSignature = false;
    if (input.signatureDocId) {
      const signatureDoc = context.documentationById.get(input.signatureDocId);
      if (
        !signatureDoc ||
        signatureDoc.documentationType !== 'customer_signature' ||
        !signatureDoc.storageKey
      ) {
        throw new JobExecutionError(
          'VALIDATION_ERROR',
          'signatureDocId must reference a stored customer signature with binary evidence',
        );
      }
      hasValidSignature = true;
    } else if (context.hasStoredSignature) {
      hasValidSignature = true;
    }

    const gate = evaluateCompletionGate({
      jobType: job.jobType,
      workPerformedSummary: input.workPerformedSummary,
      checklist: input.checklist,
      hasBeforePhoto: context.hasBeforePhoto,
      hasAfterPhoto: context.hasAfterPhoto,
      hasLabour: context.hasLabour,
      hasMaterialsOrExplicitNone: context.hasMaterials || explicitNoMaterials,
      siteCondition: input.siteCondition,
      customerRepName: input.customerRepName,
      hasSignature: hasValidSignature,
      signatureUnavailableReason: input.signatureUnavailableReason,
      cocRequired: input.cocRequired,
      technicianDeclaration: input.technicianDeclaration,
      pendingVariationCount: context.pendingVariationCount,
    });

    if (!gate.canComplete) {
      throw new JobExecutionError(
        'COMPLETION_GATE_FAILED',
        `Job cannot be completed yet: ${gate.missing.join(', ')}`,
      );
    }

    const now = new Date();
    const snapshotPayload: Record<string, unknown> = {
      ...input,
      gate,
      completedAt: now.toISOString(),
    };

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(jobs)
        .set({ executionPhase: 'completed', executionPhaseUpdatedAt: now, status: 'completed', updatedAt: now })
        .where(and(eq(jobs.id, jobId), eq(jobs.companyId, scope.companyId)))
        .returning();

      if (!row) {
        throw new JobExecutionError('UPDATE_FAILED', 'Unable to complete job');
      }

      await tx
        .insert(jobCompletionSnapshots)
        .values({
          companyId: scope.companyId,
          jobId,
          completedByUserId: scope.userId,
          snapshot: snapshotPayload,
        })
        .onConflictDoUpdate({
          target: jobCompletionSnapshots.jobId,
          set: { snapshot: snapshotPayload, completedByUserId: scope.userId, createdAt: now },
        });

      await tx.insert(jobWorkflowEvents).values({
        companyId: scope.companyId,
        jobId,
        userId: scope.userId,
        action: 'complete',
        fromPhase: job.executionPhase,
        toPhase: 'completed',
        fromStatus: job.status,
        toStatus: 'completed',
        clientActionId: input.clientActionId ?? null,
        metadata: { checklist: input.checklist },
      });

      return row;
    });

    // Never call Xero (or any provider) directly here — downstream automation subscribes to these events.
    emitBusinessEvent({
      companyId: scope.companyId,
      eventType: 'job.status_changed',
      entityType: 'job',
      entityId: jobId,
      actorUserId: scope.userId,
      payload: {
        job: {
          id: jobId,
          status: 'completed',
          customerId: updated.customerId,
          scheduledAt: updated.scheduledAt?.toISOString() ?? null,
        },
        customerId: updated.customerId,
        executionPhase: 'completed',
        dispatchCommunicationHook: 'job_completed' as const,
        dispatchCommunicationAutoSend: false,
      },
    });
    emitBusinessEvent({
      companyId: scope.companyId,
      eventType: 'job.completed',
      entityType: 'job',
      entityId: jobId,
      actorUserId: scope.userId,
      payload: {
        job: {
          id: jobId,
          status: 'completed',
          customerId: updated.customerId,
          scheduledAt: updated.scheduledAt?.toISOString() ?? null,
        },
        customerId: updated.customerId,
      },
    });

    return updated;
  }

  private async collectGateContext(companyId: string, jobId: string) {
    const [docs, labourEntries, materialLines, inventoryUsage, pendingVariations] = await Promise.all([
      this.db.query.mobileJobDocumentation.findMany({
        where: and(
          eq(mobileJobDocumentation.companyId, companyId),
          eq(mobileJobDocumentation.jobId, jobId),
        ),
        columns: { id: true, title: true, metadata: true, documentationType: true, storageKey: true },
      }),
      this.db.query.mobileTimeEntries.findMany({
        where: and(eq(mobileTimeEntries.companyId, companyId), eq(mobileTimeEntries.jobId, jobId)),
        columns: { id: true },
      }),
      this.db.query.jobMaterialLines.findMany({
        where: and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId)),
        columns: { id: true },
      }),
      this.db.query.mobileJobInventoryUsage.findMany({
        where: and(eq(mobileJobInventoryUsage.companyId, companyId), eq(mobileJobInventoryUsage.jobId, jobId)),
        columns: { id: true },
      }),
      this.db.query.jobVariations.findMany({
        where: and(
          eq(jobVariations.companyId, companyId),
          eq(jobVariations.jobId, jobId),
          eq(jobVariations.status, 'pending'),
        ),
        columns: { id: true },
      }),
    ]);

    return {
      // Before/after evidence must have a stored binary — a placeholder title/metadata row is not enough.
      hasBeforePhoto: hasStoredPhotoEvidence(docs, 'before'),
      hasAfterPhoto: hasStoredPhotoEvidence(docs, 'after'),
      hasLabour: labourEntries.length > 0,
      hasMaterials: materialLines.length > 0 || inventoryUsage.length > 0,
      pendingVariationCount: pendingVariations.length,
      hasStoredSignature: hasStoredSignatureEvidence(docs),
      documentationById: new Map(docs.map((doc) => [doc.id, doc])),
    };
  }

  private async requireJob(companyId: string, jobId: string): Promise<JobRow> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    });

    if (!job) {
      throw new JobExecutionError('NOT_FOUND', 'Job not found');
    }

    return job;
  }
}

export function toCrewMemberSummary(
  crew: typeof jobCrewMembers.$inferSelect,
  user: { firstName: string; lastName: string },
): JobCrewMemberSummary {
  return {
    id: crew.id,
    userId: crew.userId,
    userName: `${user.firstName} ${user.lastName}`.trim(),
    crewRole: crew.crewRole,
    isPrimary: crew.isPrimary,
    assignedAt: crew.assignedAt.toISOString(),
  };
}

export function toVehicleAssignmentSummary(
  assignment: typeof jobVehicleAssignments.$inferSelect,
  vehicle: { name: string; licensePlate: string },
): JobVehicleAssignmentSummary {
  return {
    id: assignment.id,
    vehicleId: assignment.vehicleId,
    vehicleName: vehicle.name,
    licensePlate: vehicle.licensePlate,
    assignedAt: assignment.assignedAt.toISOString(),
  };
}

export function toVariationSummary(row: typeof jobVariations.$inferSelect): JobVariationSummary {
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    siteCondition: row.siteCondition,
    explanation: row.explanation,
    labourEffect: row.labourEffect,
    materialEffect: row.materialEffect,
    proposedScope: row.proposedScope,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    authorizedAt: row.authorizedAt?.toISOString() ?? null,
  };
}

export function toMaterialLineSummary(
  row: typeof jobMaterialLines.$inferSelect & {
    inventoryItem?: typeof inventoryItems.$inferSelect | null;
    location?: typeof inventoryLocations.$inferSelect | null;
    recordedBy?: typeof users.$inferSelect | null;
    approvedBy?: typeof users.$inferSelect | null;
  },
  includeCost = true,
): JobMaterialLineSummary {
  const returnedQuantity = row.returnedQuantity != null ? String(row.returnedQuantity) : '0';
  const chargeable = materialChargeableQuantity({
    quantity: row.quantity,
    fulfilledQuantity: row.fulfilledQuantity,
    returnedQuantity,
    status: row.status ?? 'used',
  });
  const rawUnitCostCents = row.unitCostCents ?? 0;
  const lineTotalCents = Math.round(chargeable * rawUnitCostCents);
  const flow = materialFlowSourceFor(row.materialSource);

  return {
    id: row.id,
    jobId: row.jobId,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    materialSource: row.materialSource,
    materialFlowSource: flow,
    status: row.status ?? 'used',
    inventoryItemId: row.inventoryItemId,
    inventoryItemName: row.inventoryItem?.name ?? null,
    locationId: row.locationId ?? null,
    locationName: row.location?.name ?? null,
    unitCostCents: includeCost ? rawUnitCostCents : null,
    lineTotalCents: includeCost ? lineTotalCents : null,
    fulfilledQuantity: row.fulfilledQuantity ?? null,
    returnedQuantity,
    chargeableQuantity: String(chargeable),
    quotedQuantity: row.quotedQuantity ?? null,
    clientActionId: row.clientActionId ?? null,
    approvedByUserId: row.approvedByUserId ?? null,
    approvedByName: row.approvedBy
      ? `${row.approvedBy.firstName} ${row.approvedBy.lastName}`.trim()
      : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    rejectionReason: row.rejectionReason ?? null,
    returnReason: row.returnReason ?? null,
    supplierReference: row.supplierReference,
    receiptDocumentationId: row.receiptDocumentationId ?? null,
    directCostEntryId: row.directCostEntryId ?? null,
    stockVarianceStatus: row.stockVarianceStatus ?? 'none',
    stockVarianceNotes: row.stockVarianceNotes ?? null,
    notes: row.notes,
    recordedByUserId: row.recordedByUserId,
    recordedByName: row.recordedBy
      ? `${row.recordedBy.firstName} ${row.recordedBy.lastName}`.trim()
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : row.createdAt.toISOString(),
  };
}
