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
  JobWorkflowAction,
  JobWorkflowTransitionRequest,
  RecordJobMaterialLineRequest,
  ReturnJobMaterialLineRequest,
  SubmitGatedJobCompletionRequest,
} from '@titan/shared';
import { JOB_EXECUTION_TRANSITIONS, evaluateCompletionGate, phaseToJobStatus } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  shouldRejectDuplicateCompletionSnapshot,
  shouldReplayGatedCompletionByClientActionId,
} from './job-execution-completion-idempotency.js';
import {
  inventoryItems,
  inventoryLocations,
  jobCompletionSnapshots,
  jobCrewMembers,
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
import { publishTenantDomainEvent } from '../lib/tenant-domain-event-publisher.js';
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

    if (toStatus !== job.status) {
      publishTenantDomainEvent({
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

    publishTenantDomainEvent({
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
        return this.hydrateMaterialLine(existing.id);
      }
    }

    const description = input.description.trim();
    if (!description) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Description is required');
    }
    if (input.quantity <= 0) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Quantity must be greater than zero');
    }

    const canAuthorize = canAuthorizeMaterials(actor);
    // Technicians (or anyone without inventory:write/manager access) always land in `requested`.
    const requestOnly = canAuthorize ? (input.requestOnly ?? true) : true;
    const attemptImmediateApproval = !requestOnly && canAuthorize;
    const isStockSource = input.materialSource === 'vehicle_stock' || input.materialSource === 'warehouse_stock';

    if (input.locationId) {
      await this.ensureLocationBelongsToCompany(actor.companyId, input.locationId);
    }
    if (input.inventoryItemId) {
      await this.ensureInventoryItemBelongsToCompany(actor.companyId, input.inventoryItemId);
    }

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
          notes: input.notes?.trim() || null,
        })
        .returning();

      if (!line) {
        throw new JobExecutionError('CREATE_FAILED', 'Unable to record material line');
      }

      if (!attemptImmediateApproval) {
        return line;
      }

      const now = new Date();

      if (input.inventoryItemId && input.locationId && isStockSource) {
        let movement;
        try {
          movement = await this.stockMovementsService.applyMovement(tx, {
            companyId: actor.companyId,
            itemId: input.inventoryItemId,
            locationId: input.locationId,
            movementType: 'issue',
            quantityDelta: -input.quantity,
            jobId,
            jobMaterialLineId: line.id,
            reason: 'job_material_issue',
            clientActionId: input.clientActionId ? `${input.clientActionId}:issue` : null,
            recordedByUserId: actor.userId,
          });
        } catch (error) {
          if (error instanceof StockMovementError) {
            throw new JobExecutionError(error.code, error.message);
          }
          throw error;
        }

        const [updated] = await tx
          .update(jobMaterialLines)
          .set({
            status: 'used',
            fulfilledQuantity: String(input.quantity),
            unitCostCents: movement.unitCostCents,
            stockMovementId: movement.id,
            approvedByUserId: actor.userId,
            approvedAt: now,
            updatedAt: now,
          })
          .where(eq(jobMaterialLines.id, line.id))
          .returning();

        return updated ?? line;
      }

      // Customer-supplied / supplier-purchase (or no linked stock item) — nothing to decrement.
      const [updated] = await tx
        .update(jobMaterialLines)
        .set({
          status: 'approved',
          fulfilledQuantity: String(input.quantity),
          approvedByUserId: actor.userId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(jobMaterialLines.id, line.id))
        .returning();

      return updated ?? line;
    });

    await this.db.insert(jobWorkflowEvents).values({
      companyId: actor.companyId,
      jobId,
      userId: actor.userId,
      action: 'record_material_line',
      metadata: {
        materialLineId: createdRow.id,
        status: createdRow.status,
        clientActionId: input.clientActionId ?? null,
      },
    });

    publishTenantDomainEvent({
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

    return this.hydrateMaterialLine(createdRow.id);
  }

  /**
   * Office decision on a `requested` material line. Approving a stock-sourced line decrements
   * inventory via the stock movement ledger; rejecting requires a reason. Re-invoking with the
   * same line once it has left `requested` is a no-op that returns the current state.
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

      return this.hydrateMaterialLine((updated ?? line).id);
    }

    const fulfilledQuantity =
      input.decision === 'partial' ? (input.fulfilledQuantity ?? 0) : requestedQuantity;

    if (!fulfilledQuantity || fulfilledQuantity <= 0) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Fulfilled quantity must be greater than zero');
    }
    if (fulfilledQuantity > requestedQuantity) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        'Fulfilled quantity cannot exceed the requested quantity',
      );
    }

    const locationId = input.locationId ?? line.locationId;
    const isStockSource = line.materialSource === 'vehicle_stock' || line.materialSource === 'warehouse_stock';
    const needsStock = Boolean(line.inventoryItemId && locationId && isStockSource);

    if (locationId) {
      await this.ensureLocationBelongsToCompany(actor.companyId, locationId);
    }

    let unitCostCents = line.unitCostCents;
    let stockMovementId: string | null = line.stockMovementId;

    const updatedRow = await this.db.transaction(async (tx) => {
      if (needsStock) {
        let movement;
        try {
          movement = await this.stockMovementsService.applyMovement(tx, {
            companyId: actor.companyId,
            itemId: line.inventoryItemId!,
            locationId: locationId!,
            movementType: 'issue',
            quantityDelta: -fulfilledQuantity,
            jobId,
            jobMaterialLineId: materialLineId,
            reason: 'job_material_issue',
            clientActionId: `${input.clientActionId}:issue`,
            recordedByUserId: actor.userId,
          });
        } catch (error) {
          if (error instanceof StockMovementError) {
            throw new JobExecutionError(error.code, error.message);
          }
          throw error;
        }
        unitCostCents = movement.unitCostCents;
        stockMovementId = movement.id;
      }

      const status: (typeof jobMaterialLines.$inferSelect)['status'] =
        fulfilledQuantity < requestedQuantity ? 'partially_fulfilled' : needsStock ? 'used' : 'approved';

      const [row] = await tx
        .update(jobMaterialLines)
        .set({
          status,
          fulfilledQuantity: String(fulfilledQuantity),
          locationId: locationId ?? null,
          unitCostCents,
          stockMovementId,
          approvedByUserId: actor.userId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(jobMaterialLines.id, materialLineId))
        .returning();

      return row ?? line;
    });

    await this.db.insert(jobWorkflowEvents).values({
      companyId: actor.companyId,
      jobId,
      userId: actor.userId,
      action: 'authorize_material_line',
      metadata: {
        materialLineId,
        decision: input.decision,
        fulfilledQuantity,
        clientActionId: input.clientActionId,
      },
    });

    publishTenantDomainEvent({
      companyId: actor.companyId,
      eventType: 'job.material_used',
      entityType: 'job_material_line',
      entityId: materialLineId,
      actorUserId: actor.userId,
      payload: { jobId, materialLineId, status: updatedRow.status, fulfilledQuantity },
    });

    return this.hydrateMaterialLine(updatedRow.id);
  }

  /** Returns issued/used stock back to a location. Idempotent no-op once already `returned`. */
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
      return this.hydrateMaterialLine(line.id);
    }

    if (!['used', 'partially_fulfilled', 'approved'].includes(line.status)) {
      throw new JobExecutionError(
        'INVALID_STATUS',
        `Cannot return a material line in status ${line.status}`,
      );
    }

    if (!input.quantity || input.quantity <= 0) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Return quantity must be greater than zero');
    }

    const reason = input.reason?.trim();
    if (!reason) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Return reason is required');
    }

    const fulfilled = line.fulfilledQuantity != null ? Number(line.fulfilledQuantity) : Number(line.quantity);
    if (input.quantity > fulfilled) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Cannot return more than the fulfilled quantity');
    }

    if (!line.inventoryItemId || !line.locationId) {
      throw new JobExecutionError(
        'VALIDATION_ERROR',
        'Material line has no linked stock item/location to return to',
      );
    }

    const updatedRow = await this.db.transaction(async (tx) => {
      let movement;
      try {
        movement = await this.stockMovementsService.applyMovement(tx, {
          companyId: actor.companyId,
          itemId: line.inventoryItemId!,
          locationId: line.locationId!,
          movementType: 'return_to_stock',
          quantityDelta: input.quantity,
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
          status: 'returned',
          returnReason: reason,
          stockMovementId: movement.id,
          updatedAt: new Date(),
        })
        .where(eq(jobMaterialLines.id, materialLineId))
        .returning();

      return row ?? line;
    });

    await this.db.insert(jobWorkflowEvents).values({
      companyId: actor.companyId,
      jobId,
      userId: actor.userId,
      action: 'return_material_line',
      metadata: { materialLineId, quantity: input.quantity, reason, clientActionId: input.clientActionId },
    });

    return this.hydrateMaterialLine(updatedRow.id);
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

  private async hydrateMaterialLine(materialLineId: string): Promise<JobMaterialLineSummary> {
    const row = await this.db.query.jobMaterialLines.findFirst({
      where: eq(jobMaterialLines.id, materialLineId),
      with: { inventoryItem: true, location: true, recordedBy: true, approvedBy: true },
    });

    if (!row) {
      throw new JobExecutionError('NOT_FOUND', 'Material line not found');
    }

    return toMaterialLineSummary(row, true);
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
            snapshot: completionSnapshotRow.snapshot,
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
          hasBinary,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          createdAt: doc.createdAt.toISOString(),
          downloadPath: hasBinary
            ? `/api/v1/jobs/${jobId}/evidence/${doc.id}/content`
            : null,
        };
      }),
    };
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
      if (shouldReplayGatedCompletionByClientActionId(existing)) {
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
    if (
      shouldRejectDuplicateCompletionSnapshot({
        existingSnapshot,
        reopenAt: job.reopenAt,
      })
    ) {
      throw new JobExecutionError(
        'COMPLETION_SNAPSHOT_EXISTS',
        'A completion snapshot already exists for this job — reopen the job with a reason before recording a new completion',
      );
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
    publishTenantDomainEvent({
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
      },
    });
    publishTenantDomainEvent({
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
  const quantity = Number(row.quantity);
  const rawUnitCostCents = row.unitCostCents ?? 0;
  const lineTotalCents = Number.isFinite(quantity) ? Math.round(rawUnitCostCents * quantity) : 0;

  return {
    id: row.id,
    jobId: row.jobId,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    materialSource: row.materialSource,
    status: row.status ?? 'used',
    inventoryItemId: row.inventoryItemId,
    inventoryItemName: row.inventoryItem?.name ?? null,
    locationId: row.locationId ?? null,
    locationName: row.location?.name ?? null,
    unitCostCents: includeCost ? rawUnitCostCents : null,
    lineTotalCents: includeCost ? lineTotalCents : null,
    fulfilledQuantity: row.fulfilledQuantity ?? null,
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
    notes: row.notes,
    recordedByUserId: row.recordedByUserId,
    recordedByName: row.recordedBy
      ? `${row.recordedBy.firstName} ${row.recordedBy.lastName}`.trim()
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : row.createdAt.toISOString(),
  };
}
