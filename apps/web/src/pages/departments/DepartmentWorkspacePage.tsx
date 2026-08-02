import { PageHeader, SummaryCardGrid } from '../../components/ux';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  CorporateDepartmentId,
  DepartmentRoutineTaskAuditRecord,
  DepartmentRoutineTaskRecord,
  DepartmentTodayQueueItem,
} from '@titan/shared';
import { getCorporateDepartmentById } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  approveDepartmentTask,
  completeDepartmentTask,
  fetchCorporateDepartmentDetail,
  fetchDepartmentRoutineTasks,
  fetchDepartmentTaskAudit,
  handoffDepartmentTask,
  skipDepartmentTask,
  updateDepartmentTaskStatus,
} from '../../lib/corporate-departments-api';
import { useAuth } from '../../lib/auth-context';

function canAccessDepartments(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('executive:read') ||
    permissions.includes('analytics:read') ||
    permissions.includes('ops:read')
  );
}

function canMutateTasks(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('executive:read') ||
    permissions.includes('ops:write')
  );
}

function formatPriority(priority: string): string {
  return priority.replace(/_/g, ' ');
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

function isRoutineTask(item: DepartmentTodayQueueItem): boolean {
  return item.source === 'department_routine_task' && Boolean(item.taskId);
}

export function DepartmentWorkspacePage() {
  const [, params] = useRoute('/departments/:departmentId');
  const departmentId = (params?.departmentId ?? '') as CorporateDepartmentId;
  const definition = getCorporateDepartmentById(departmentId);

  const { accessToken, user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<
    ReturnType<typeof fetchCorporateDepartmentDetail>
  > | null>(null);
  const [routineTasks, setRoutineTasks] = useState<DepartmentRoutineTaskRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskAudit, setTaskAudit] = useState<DepartmentRoutineTaskAuditRecord[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const canView = useMemo(
    () => (user ? canAccessDepartments(user.permissions) : false),
    [user],
  );
  const canAct = useMemo(
    () => (user ? canMutateTasks(user.permissions) : false),
    [user],
  );
  const canApprove = useMemo(
    () => user?.permissions.includes('*') || user?.permissions.includes('executive:read'),
    [user],
  );

  const reload = useCallback(async () => {
    if (!accessToken || !canView || !definition) return;
    setIsLoading(true);
    setError(null);
    try {
      const [deptDetail, tasksResponse] = await Promise.all([
        fetchCorporateDepartmentDetail(accessToken, departmentId),
        fetchDepartmentRoutineTasks(accessToken, departmentId),
      ]);
      setDetail(deptDetail);
      setRoutineTasks(tasksResponse.tasks);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load department');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, canView, definition, departmentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadAudit = useCallback(
    async (taskId: string) => {
      if (!accessToken) return;
      setSelectedTaskId(taskId);
      try {
        const audit = await fetchDepartmentTaskAudit(accessToken, taskId);
        setTaskAudit(audit);
      } catch {
        setTaskAudit([]);
      }
    },
    [accessToken],
  );

  const runAction = useCallback(
    async (action: () => Promise<void>) => {
      setActionBusy(true);
      setActionError(null);
      try {
        await action();
        await reload();
        if (selectedTaskId) {
          await loadAudit(selectedTaskId);
        }
      } catch (err) {
        setActionError(err instanceof ApiClientError ? err.message : 'Action failed');
      } finally {
        setActionBusy(false);
      }
    },
    [loadAudit, reload, selectedTaskId],
  );

  if (!definition) {
    return (
      <div className="automation-page">
        <PageHeader title="Department not found" description="Unknown department identifier." />
        <Link href="/departments">
          <Button variant="secondary">Back to departments</Button>
        </Link>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title={definition.label}
          description="You do not have permission to view this department workspace."
        />
      </div>
    );
  }

  const pendingRoutineCount = routineTasks.filter(
    (task) => task.status !== 'completed' && task.status !== 'skipped',
  ).length;

  return (
    <div className="automation-page department-workspace-page">
      <PageHeader
        title={definition.label}
        description={definition.mandate}
        actions={
          <div className="page-header-actions">
            <Link href="/departments">
              <Button variant="secondary">All departments</Button>
            </Link>
            {definition.manageRoutes[0] ? (
              <Link href={definition.manageRoutes[0]}>
                <Button variant="primary">Open manage view</Button>
              </Link>
            ) : null}
          </div>
        }
      />

      {isLoading ? <p>Loading department workspace...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {actionError ? <p className="form-error">{actionError}</p> : null}

      {detail ? (
        <>
          <SummaryCardGrid>
            <StatCard label="Accountable owner" value={detail.accountableOwner} />
            <StatCard label="Today queue" value={String(detail.todayQueue.length)} />
            <StatCard label="Routine tasks (period)" value={String(pendingRoutineCount)} />
            <StatCard label="Approval gates" value={String(detail.approvalGateCount)} />
          </SummaryCardGrid>

          <Panel title="Today queue">
            <p className="department-queue-note">{detail.queueSourceNote}</p>
            {detail.todayQueueEmpty ? (
              <EmptyState
                title="Today queue is empty"
                description="No actionable items from live APIs or routine tasks. Use manage routes below for operational context."
              />
            ) : (
              <ul className="department-today-queue">
                {detail.todayQueue.map((item) => (
                  <li key={item.id} className="department-today-queue__item">
                    <div>
                      <strong>{item.title}</strong>
                      {item.count != null ? ` (${item.count})` : ''}
                      <p>{item.description}</p>
                      <span className="department-today-queue__meta">
                        {formatPriority(item.priority)} · {item.source.replace(/_/g, ' ')}
                        {item.taskStatus ? ` · ${formatStatus(item.taskStatus)}` : ''}
                        {item.dueDate ? ` · due ${item.dueDate}` : ''}
                        {item.accountableOwner ? ` · ${item.accountableOwner}` : ''}
                      </span>
                    </div>
                    <div className="department-today-queue__actions">
                      {isRoutineTask(item) && canAct && item.taskId ? (
                        <>
                          {item.taskStatus === 'awaiting_approval' && canApprove ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={actionBusy}
                              onClick={() =>
                                void runAction(async () => {
                                  await approveDepartmentTask(accessToken!, item.taskId!);
                                })
                              }
                            >
                              Approve
                            </Button>
                          ) : null}
                          {item.taskStatus !== 'completed' &&
                          item.taskStatus !== 'skipped' &&
                          item.taskStatus !== 'awaiting_approval' ? (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={actionBusy}
                                onClick={() =>
                                  void runAction(async () => {
                                    await completeDepartmentTask(accessToken!, item.taskId!);
                                  })
                                }
                              >
                                Complete
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={actionBusy}
                                onClick={() =>
                                  void runAction(async () => {
                                    await updateDepartmentTaskStatus(
                                      accessToken!,
                                      item.taskId!,
                                      'in_progress',
                                    );
                                  })
                                }
                              >
                                Start
                              </Button>
                            </>
                          ) : null}
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={actionBusy}
                            onClick={() => void loadAudit(item.taskId!)}
                          >
                            Audit
                          </Button>
                        </>
                      ) : null}
                      <Link href={item.href}>
                        <Button variant="secondary" size="sm">
                          Open
                        </Button>
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recurring routine tasks (this period)">
            {routineTasks.length === 0 ? (
              <EmptyState
                title="No routine tasks"
                description="Routine instances are generated from documented department schedules."
              />
            ) : (
              <ul className="department-routine-task-list">
                {routineTasks.map((task) => (
                  <li key={task.id} className="department-routine-task-list__item">
                    <div>
                      <strong>{task.title}</strong>
                      <p>
                        {task.cadence} · due {task.dueDate} · {formatStatus(task.status)} ·{' '}
                        {task.accountableOwner}
                      </p>
                      {task.handoffToDepartmentId ? (
                        <span className="department-today-queue__meta">
                          Handoff → {task.handoffToDepartmentId.replace(/_/g, ' ')}
                          {task.handoffStatus ? ` (${task.handoffStatus})` : ''}
                        </span>
                      ) : null}
                    </div>
                    {canAct ? (
                      <div className="department-today-queue__actions">
                        {task.status === 'awaiting_approval' && canApprove ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={actionBusy}
                            onClick={() =>
                              void runAction(async () => {
                                await approveDepartmentTask(accessToken!, task.id);
                              })
                            }
                          >
                            Approve
                          </Button>
                        ) : null}
                        {task.status !== 'completed' && task.status !== 'skipped' ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={actionBusy}
                              onClick={() =>
                                void runAction(async () => {
                                  await completeDepartmentTask(accessToken!, task.id);
                                })
                              }
                            >
                              Complete
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={actionBusy}
                              onClick={() =>
                                void runAction(async () => {
                                  await skipDepartmentTask(accessToken!, task.id);
                                })
                              }
                            >
                              Skip
                            </Button>
                            {task.handoffToDepartmentId && task.handoffStatus !== 'completed' ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={actionBusy}
                                onClick={() =>
                                  void runAction(async () => {
                                    await handoffDepartmentTask(accessToken!, task.id);
                                  })
                                }
                              >
                                Handoff
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={actionBusy}
                          onClick={() => void loadAudit(task.id)}
                        >
                          Audit
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {selectedTaskId && taskAudit.length > 0 ? (
            <Panel title="Task audit history">
              <ul className="department-audit-list">
                {taskAudit.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.eventType.replace(/_/g, ' ')}</strong>
                    <p>{entry.message}</p>
                    <span className="department-today-queue__meta">
                      {entry.createdAt}
                      {entry.fromStatus && entry.toStatus
                        ? ` · ${entry.fromStatus} → ${entry.toStatus}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <div className="department-workspace-grid">
            <Panel title="Weekly routine">
              <ul className="department-routine-list">
                {detail.weeklyRoutine.map((routine) => (
                  <li key={`${routine.href}-${routine.label}`}>
                    <Link href={routine.href}>{routine.label}</Link>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Monthly routine">
              <ul className="department-routine-list">
                {detail.monthlyRoutine.map((routine) => (
                  <li key={`${routine.href}-${routine.label}`}>
                    <Link href={routine.href}>{routine.label}</Link>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Approvals">
              <ul className="department-approval-list">
                {detail.approvals.map((approval) => (
                  <li key={approval.id}>
                    <Link href={approval.href}>
                      <strong>{approval.label}</strong>
                    </Link>
                    <p>{approval.note}</p>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Manage routes">
              <ul className="department-routine-list">
                {detail.manageRoutes.map((href) => (
                  <li key={href}>
                    <Link href={href}>{href}</Link>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="KPIs (real sources)">
              <ul className="department-kpi-list">
                {detail.kpis.map((kpi) => (
                  <li key={kpi.id}>
                    <Link href={kpi.sourceRoute}>
                      <strong>{kpi.label}</strong>
                    </Link>
                    <p>{kpi.sourceNote}</p>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Risks">
              <ul className="department-risk-list">
                {detail.risks.map((risk) => (
                  <li key={risk.id}>
                    <strong>{risk.risk}</strong>
                    <p>{risk.mitigation}</p>
                    <span>Owner: {risk.owner}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel title="Handoffs">
            <ul className="department-handoff-list">
              {detail.handoffs.map((handoff) => {
                const target = getCorporateDepartmentById(handoff.toDepartmentId);
                return (
                  <li key={`${handoff.toDepartmentId}-${handoff.trigger}`}>
                    <strong>To {target?.label ?? handoff.toDepartmentId}</strong>
                    <p>
                      Trigger: {handoff.trigger} — Deliverable: {handoff.deliverable}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Audit notes">
            <ul className="department-audit-list">
              {detail.auditNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
