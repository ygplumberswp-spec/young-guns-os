import { PageHeader, SummaryCardGrid } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { DepartmentHubEntry } from '@titan/shared';
import { EXPECTED_CORPORATE_DEPARTMENT_COUNT } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCorporateDepartmentHub } from '../../lib/corporate-departments-api';
import { useAuth } from '../../lib/auth-context';

function canAccessDepartments(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('executive:read') ||
    permissions.includes('analytics:read') ||
    permissions.includes('ops:read')
  );
}

function DepartmentCard({ department }: { department: DepartmentHubEntry }) {
  const queueCount = department.todayQueue.length;
  const queueLabel =
    queueCount === 0
      ? 'Today queue empty'
      : `${queueCount} item${queueCount === 1 ? '' : 's'} in Today queue`;

  return (
    <Panel title={department.label} className="department-hub-card">
      <p className="department-hub-card__mandate">{department.mandate}</p>
      <dl className="department-hub-card__meta">
        <div>
          <dt>Accountable owner</dt>
          <dd>{department.accountableOwner}</dd>
        </div>
        <div>
          <dt>Today queue</dt>
          <dd>{queueLabel}</dd>
        </div>
        {department.moduleHealthStatus ? (
          <div>
            <dt>Module health</dt>
            <dd>{department.moduleHealthStatus.replace(/_/g, ' ')}</dd>
          </div>
        ) : null}
      </dl>
      <div className="department-hub-card__actions">
        <Link href={department.workspaceHref}>
          <Button variant="primary" size="sm">
            Open workspace
          </Button>
        </Link>
        {department.manageRoutes[0] ? (
          <Link href={department.manageRoutes[0]}>
            <Button variant="secondary" size="sm">
              Manage
            </Button>
          </Link>
        ) : null}
      </div>
    </Panel>
  );
}

export function DepartmentsHubPage() {
  const { accessToken, user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hub, setHub] = useState<Awaited<ReturnType<typeof fetchCorporateDepartmentHub>> | null>(
    null,
  );

  const canView = useMemo(
    () => (user ? canAccessDepartments(user.permissions) : false),
    [user],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchCorporateDepartmentHub(accessToken);
        if (!cancelled) setHub(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load department hub');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="Departments"
          description="You do not have permission to view the corporate department operating model."
        />
      </div>
    );
  }

  return (
    <div className="automation-page departments-hub-page">
      <PageHeader
        title="Departments"
        description="Corporate operating model for Young Guns Plumbing — 19 departments with real Today queues from live tenant data."
        actions={
          <div className="page-header-actions">
            <Link href="/mission-control">
              <Button variant="secondary">Company Health</Button>
            </Link>
            <Link href="/">
              <Button variant="secondary">Owner dashboard</Button>
            </Link>
          </div>
        }
      />

      {isLoading ? <p>Loading department hub...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {hub ? (
        <>
          <SummaryCardGrid>
            <StatCard label="Departments" value={String(hub.departmentCount)} />
            <StatCard label="Owner action queue" value={String(hub.actionQueueTotal)} />
            <StatCard
              label="Expected model"
              value={String(EXPECTED_CORPORATE_DEPARTMENT_COUNT)}
            />
          </SummaryCardGrid>

          <p className="department-hub-disclaimer">{hub.disclaimer}</p>

          {hub.departments.length === 0 ? (
            <EmptyState
              title="No departments configured"
              description="Corporate department model should expose 19 departments."
            />
          ) : (
            <div className="department-hub-grid" role="list">
              {hub.departments.map((department) => (
                <DepartmentCard key={department.id} department={department} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
