import { PageHeader, SummaryCardGrid } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { CorporateDepartmentId } from '@titan/shared';
import { getCorporateDepartmentById } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCorporateDepartmentDetail } from '../../lib/corporate-departments-api';
import { useAuth } from '../../lib/auth-context';

function canAccessDepartments(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('executive:read') ||
    permissions.includes('analytics:read') ||
    permissions.includes('ops:read')
  );
}

function formatPriority(priority: string): string {
  return priority.replace(/_/g, ' ');
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

  const canView = useMemo(
    () => (user ? canAccessDepartments(user.permissions) : false),
    [user],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView || !definition) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchCorporateDepartmentDetail(accessToken, departmentId);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load department');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, definition, departmentId]);

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

      {detail ? (
        <>
          <SummaryCardGrid>
            <StatCard label="Accountable owner" value={detail.accountableOwner} />
            <StatCard label="Today queue" value={String(detail.todayQueue.length)} />
            <StatCard label="Weekly routines" value={String(detail.weeklyRoutineCount)} />
            <StatCard label="Approval gates" value={String(detail.approvalGateCount)} />
          </SummaryCardGrid>

          <Panel title="Today queue">
            <p className="department-queue-note">{detail.queueSourceNote}</p>
            {detail.todayQueueEmpty ? (
              <EmptyState
                title="Today queue is empty"
                description="No actionable items from live APIs. Use manage routes below for operational context."
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
                      </span>
                    </div>
                    <Link href={item.href}>
                      <Button variant="secondary" size="sm">
                        Open
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

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
