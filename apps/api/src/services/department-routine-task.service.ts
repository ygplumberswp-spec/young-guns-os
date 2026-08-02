import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type {
  CorporateDepartmentId,
  DepartmentRoutineTaskAuditRecord,
  DepartmentRoutineTaskRecord,
  DepartmentRoutineTaskStatus,
} from '@titan/shared';
import {
  buildRoutineKey,
  canAccessDepartment,
  canMutateDepartmentTasks,
  getCorporateDepartmentById,
  isTaskOverdue,
  listAllDepartmentRoutineDefinitions,
  localDateIso,
  resolveRoutinePeriod,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { departmentRoutineTaskAuditLogs, departmentRoutineTasks } from '@titan/db';

export class DepartmentRoutineTaskError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DepartmentRoutineTaskError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
  permissions: string[];
};

function mapTask(row: typeof departmentRoutineTasks.$inferSelect): DepartmentRoutineTaskRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    departmentId: row.departmentId as CorporateDepartmentId,
    routineKey: row.routineKey,
    title: row.title,
    description: row.description,
    href: row.href,
    cadence: row.cadence,
    accountableOwner: row.accountableOwner as DepartmentRoutineTaskRecord['accountableOwner'],
    assignedUserId: row.assignedUserId,
    dueDate: row.dueDate,
    periodStart: row.periodStart,
    status: row.status,
    requiresApproval: row.requiresApproval,
    approvalGateId: row.approvalGateId,
    handoffToDepartmentId: row.handoffToDepartmentId as CorporateDepartmentId | null,
    handoffStatus: row.handoffStatus,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedByUserId: row.completedByUserId,
    skippedAt: row.skippedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapAudit(
  row: typeof departmentRoutineTaskAuditLogs.$inferSelect,
): DepartmentRoutineTaskAuditRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    eventType: row.eventType,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    message: row.message,
    metadata: row.metadata ?? {},
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}

function taskPriority(status: DepartmentRoutineTaskStatus, dueDate: string): 'critical' | 'high' | 'normal' {
  if (status === 'overdue' || status === 'blocked') return 'critical';
  if (status === 'awaiting_approval') return 'high';
  if (dueDate === localDateIso()) return 'high';
  return 'normal';
}

export class DepartmentRoutineTaskService {
  constructor(private readonly db: DatabaseClient) {}

  /** Idempotent generation of current-period routine task instances. */
  async ensureCurrentPeriodTasks(companyId: string): Promise<number> {
    const definitions = listAllDepartmentRoutineDefinitions();
    let created = 0;

    for (const def of definitions) {
      const dept = getCorporateDepartmentById(def.departmentId);
      if (!dept) continue;

      const { periodStart, dueDate } = resolveRoutinePeriod(def.cadence);
      const routineKey = buildRoutineKey(def.departmentId, def.cadence, def.label);
      const requiresApproval = def.approvalGateId != null;

      const inserted = await this.db
        .insert(departmentRoutineTasks)
        .values({
          companyId,
          departmentId: def.departmentId,
          routineKey,
          title: def.label,
          description: `${def.cadence} routine — ${dept.label}`,
          href: def.href,
          cadence: def.cadence,
          accountableOwner: dept.accountableOwner,
          dueDate,
          periodStart,
          status: requiresApproval ? 'awaiting_approval' : 'pending',
          requiresApproval,
          approvalGateId: def.approvalGateId,
          handoffToDepartmentId: def.handoffToDepartmentId,
          handoffStatus: def.handoffToDepartmentId ? 'pending' : null,
        })
        .onConflictDoNothing({
          target: [
            departmentRoutineTasks.companyId,
            departmentRoutineTasks.routineKey,
            departmentRoutineTasks.periodStart,
          ],
        })
        .returning({ id: departmentRoutineTasks.id });

      if (inserted.length > 0) {
        created += 1;
        await this.writeAudit(companyId, inserted[0]!.id, {
          eventType: 'created',
          fromStatus: null,
          toStatus: requiresApproval ? 'awaiting_approval' : 'pending',
          message: `Routine task created for ${def.cadence} period starting ${periodStart}`,
          userId: null,
          metadata: { routineKey, departmentId: def.departmentId },
        });
      }
    }

    await this.refreshOverdueStatuses(companyId);
    return created;
  }

  async refreshOverdueStatuses(companyId: string): Promise<void> {
    const today = localDateIso();
    const rows = await this.db.query.departmentRoutineTasks.findMany({
      where: and(
        eq(departmentRoutineTasks.companyId, companyId),
        inArray(departmentRoutineTasks.status, ['pending', 'in_progress']),
        lt(departmentRoutineTasks.dueDate, today),
      ),
    });

    for (const row of rows) {
      await this.db
        .update(departmentRoutineTasks)
        .set({ status: 'overdue', updatedAt: new Date() })
        .where(eq(departmentRoutineTasks.id, row.id));

      await this.writeAudit(companyId, row.id, {
        eventType: 'status_changed',
        fromStatus: row.status,
        toStatus: 'overdue',
        message: `Task overdue — due ${row.dueDate}`,
        userId: null,
        metadata: {},
      });
    }
  }

  async listTasksForDepartment(
    scope: TenantScope,
    departmentId: CorporateDepartmentId,
  ): Promise<DepartmentRoutineTaskRecord[]> {
    if (!canAccessDepartment(scope.permissions, departmentId)) {
      throw new DepartmentRoutineTaskError('FORBIDDEN', 'Department access denied');
    }

    await this.ensureCurrentPeriodTasks(scope.companyId);

    const rows = await this.db.query.departmentRoutineTasks.findMany({
      where: and(
        eq(departmentRoutineTasks.companyId, scope.companyId),
        eq(departmentRoutineTasks.departmentId, departmentId),
      ),
      orderBy: [departmentRoutineTasks.dueDate, desc(departmentRoutineTasks.updatedAt)],
    });

    return rows.map(mapTask);
  }

  async listTodayTasksForDepartment(
    scope: TenantScope,
    departmentId: CorporateDepartmentId,
  ): Promise<DepartmentRoutineTaskRecord[]> {
    const tasks = await this.listTasksForDepartment(scope, departmentId);
    const today = localDateIso();
    return tasks.filter(
      (task) =>
        task.status !== 'completed' &&
        task.status !== 'skipped' &&
        (task.dueDate <= today || task.cadence === 'daily'),
    );
  }

  async countCompanyTasks(companyId: string): Promise<number> {
    await this.ensureCurrentPeriodTasks(companyId);
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(departmentRoutineTasks)
      .where(eq(departmentRoutineTasks.companyId, companyId));
    return row?.count ?? 0;
  }

  async getTask(
    scope: TenantScope,
    taskId: string,
  ): Promise<DepartmentRoutineTaskRecord | null> {
    const row = await this.db.query.departmentRoutineTasks.findFirst({
      where: and(
        eq(departmentRoutineTasks.id, taskId),
        eq(departmentRoutineTasks.companyId, scope.companyId),
      ),
    });
    if (!row) return null;
    if (!canAccessDepartment(scope.permissions, row.departmentId as CorporateDepartmentId)) {
      throw new DepartmentRoutineTaskError('FORBIDDEN', 'Department access denied');
    }
    return mapTask(row);
  }

  async listTaskAudit(
    scope: TenantScope,
    taskId: string,
  ): Promise<DepartmentRoutineTaskAuditRecord[]> {
    const task = await this.getTask(scope, taskId);
    if (!task) {
      throw new DepartmentRoutineTaskError('NOT_FOUND', 'Task not found');
    }

    const rows = await this.db.query.departmentRoutineTaskAuditLogs.findMany({
      where: and(
        eq(departmentRoutineTaskAuditLogs.companyId, scope.companyId),
        eq(departmentRoutineTaskAuditLogs.taskId, taskId),
      ),
      orderBy: [desc(departmentRoutineTaskAuditLogs.createdAt)],
    });

    return rows.map(mapAudit);
  }

  async updateStatus(
    scope: TenantScope,
    taskId: string,
    nextStatus: DepartmentRoutineTaskStatus,
    note?: string,
  ): Promise<DepartmentRoutineTaskRecord> {
    const task = await this.getTask(scope, taskId);
    if (!task) {
      throw new DepartmentRoutineTaskError('NOT_FOUND', 'Task not found');
    }
    if (!canMutateDepartmentTasks(scope.permissions, task.departmentId)) {
      throw new DepartmentRoutineTaskError('FORBIDDEN', 'Cannot update department tasks');
    }

    const [updated] = await this.db
      .update(departmentRoutineTasks)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(departmentRoutineTasks.id, taskId))
      .returning();

    await this.writeAudit(scope.companyId, taskId, {
      eventType: 'status_changed',
      fromStatus: task.status,
      toStatus: nextStatus,
      message: note ?? `Status changed to ${nextStatus}`,
      userId: scope.userId,
      metadata: {},
    });

    return mapTask(updated!);
  }

  async completeTask(scope: TenantScope, taskId: string): Promise<DepartmentRoutineTaskRecord> {
    const task = await this.getTask(scope, taskId);
    if (!task) {
      throw new DepartmentRoutineTaskError('NOT_FOUND', 'Task not found');
    }
    if (!canMutateDepartmentTasks(scope.permissions, task.departmentId)) {
      throw new DepartmentRoutineTaskError('FORBIDDEN', 'Cannot complete department tasks');
    }
    if (task.requiresApproval && task.status === 'awaiting_approval') {
      throw new DepartmentRoutineTaskError(
        'APPROVAL_REQUIRED',
        'Task requires approval before completion',
      );
    }

    const now = new Date();
    const [updated] = await this.db
      .update(departmentRoutineTasks)
      .set({
        status: 'completed',
        completedAt: now,
        completedByUserId: scope.userId,
        updatedAt: now,
      })
      .where(eq(departmentRoutineTasks.id, taskId))
      .returning();

    await this.writeAudit(scope.companyId, taskId, {
      eventType: 'completed',
      fromStatus: task.status,
      toStatus: 'completed',
      message: 'Routine task marked complete',
      userId: scope.userId,
      metadata: {},
    });

    return mapTask(updated!);
  }

  async skipTask(scope: TenantScope, taskId: string, reason?: string): Promise<DepartmentRoutineTaskRecord> {
    const task = await this.getTask(scope, taskId);
    if (!task) {
      throw new DepartmentRoutineTaskError('NOT_FOUND', 'Task not found');
    }
    if (!canMutateDepartmentTasks(scope.permissions, task.departmentId)) {
      throw new DepartmentRoutineTaskError('FORBIDDEN', 'Cannot skip department tasks');
    }

    const now = new Date();
    const [updated] = await this.db
      .update(departmentRoutineTasks)
      .set({
        status: 'skipped',
        skippedAt: now,
        updatedAt: now,
      })
      .where(eq(departmentRoutineTasks.id, taskId))
      .returning();

    await this.writeAudit(scope.companyId, taskId, {
      eventType: 'skipped',
      fromStatus: task.status,
      toStatus: 'skipped',
      message: reason ?? 'Routine task skipped for this period',
      userId: scope.userId,
      metadata: {},
    });

    return mapTask(updated!);
  }

  async approveTask(scope: TenantScope, taskId: string): Promise<DepartmentRoutineTaskRecord> {
    const task = await this.getTask(scope, taskId);
    if (!task) {
      throw new DepartmentRoutineTaskError('NOT_FOUND', 'Task not found');
    }
    if (!scope.permissions.includes('*') && !scope.permissions.includes('executive:read')) {
      throw new DepartmentRoutineTaskError('FORBIDDEN', 'Owner approval required');
    }
    if (!task.requiresApproval) {
      throw new DepartmentRoutineTaskError('VALIDATION_ERROR', 'Task does not require approval');
    }

    const [updated] = await this.db
      .update(departmentRoutineTasks)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(departmentRoutineTasks.id, taskId))
      .returning();

    await this.writeAudit(scope.companyId, taskId, {
      eventType: 'approved',
      fromStatus: task.status,
      toStatus: 'pending',
      message: 'Approval gate cleared — task ready for execution',
      userId: scope.userId,
      metadata: { approvalGateId: task.approvalGateId },
    });

    return mapTask(updated!);
  }

  async handoffTask(
    scope: TenantScope,
    taskId: string,
    note?: string,
  ): Promise<DepartmentRoutineTaskRecord> {
    const task = await this.getTask(scope, taskId);
    if (!task) {
      throw new DepartmentRoutineTaskError('NOT_FOUND', 'Task not found');
    }
    if (!canMutateDepartmentTasks(scope.permissions, task.departmentId)) {
      throw new DepartmentRoutineTaskError('FORBIDDEN', 'Cannot hand off department tasks');
    }
    if (!task.handoffToDepartmentId) {
      throw new DepartmentRoutineTaskError('VALIDATION_ERROR', 'Task has no handoff target');
    }

    const [updated] = await this.db
      .update(departmentRoutineTasks)
      .set({ handoffStatus: 'completed', updatedAt: new Date() })
      .where(eq(departmentRoutineTasks.id, taskId))
      .returning();

    await this.writeAudit(scope.companyId, taskId, {
      eventType: 'handoff',
      fromStatus: task.status,
      toStatus: task.status,
      message:
        note ??
        `Handed off to ${task.handoffToDepartmentId.replace(/_/g, ' ')} per department matrix`,
      userId: scope.userId,
      metadata: { toDepartmentId: task.handoffToDepartmentId },
    });

    return mapTask(updated!);
  }

  toTodayQueueItem(task: DepartmentRoutineTaskRecord): {
    id: string;
    title: string;
    description: string;
    count: null;
    href: string;
    priority: 'critical' | 'high' | 'normal';
    source: 'department_routine_task';
    taskId: string;
    taskStatus: DepartmentRoutineTaskStatus;
    dueDate: string;
    accountableOwner: DepartmentRoutineTaskRecord['accountableOwner'];
    cadence: DepartmentRoutineTaskRecord['cadence'];
    requiresApproval: boolean;
  } {
    const effectiveStatus = isTaskOverdue(task.status, task.dueDate)
      ? 'overdue'
      : task.status;

    return {
      id: `routine-${task.id}`,
      title: task.title,
      description: `${task.cadence} routine · due ${task.dueDate} · ${task.accountableOwner}`,
      count: null,
      href: task.href,
      priority: taskPriority(effectiveStatus, task.dueDate),
      source: 'department_routine_task',
      taskId: task.id,
      taskStatus: effectiveStatus,
      dueDate: task.dueDate,
      accountableOwner: task.accountableOwner,
      cadence: task.cadence,
      requiresApproval: task.requiresApproval,
    };
  }

  private async writeAudit(
    companyId: string,
    taskId: string,
    input: {
      eventType: DepartmentRoutineTaskAuditRecord['eventType'];
      fromStatus: DepartmentRoutineTaskStatus | null;
      toStatus: DepartmentRoutineTaskStatus | null;
      message: string;
      userId: string | null;
      metadata: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.db.insert(departmentRoutineTaskAuditLogs).values({
      companyId,
      taskId,
      eventType: input.eventType,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      message: input.message,
      userId: input.userId,
      metadata: input.metadata,
    });
  }
}
