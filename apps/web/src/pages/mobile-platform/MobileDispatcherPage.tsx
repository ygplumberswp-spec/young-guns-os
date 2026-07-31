import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type { MobileDispatcherWorkspace } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchMobileDispatcherWorkspace } from '../../lib/enterprise-mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { canAccessMobilePlatform, formatDeviceStatus } from '../../features/mobile-platform/utils';

export function MobileDispatcherPage() {
  const { accessToken, user } = useAuth();
  const [workspace, setWorkspace] = useState<MobileDispatcherWorkspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(
    () =>
      user
        ? canAccessMobilePlatform(user.permissions) ||
          user.permissions.includes('dispatch:read') ||
          user.permissions.includes('*')
        : false,
    [user],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await fetchMobileDispatcherWorkspace(accessToken);
        if (!cancelled) setWorkspace(data);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load dispatcher workspace',
          );
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
          title="Dispatcher Workspace"
          description="You do not have permission to view the dispatcher workspace."
        />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="Dispatcher Workspace"
        description="Live technician status, dispatch overview, fleet tracking, and AI recommendations from real data."
        actions={
          <Link href="/mobile-platform">
            <Button variant="secondary">Mobile Platform Admin</Button>
          </Link>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}

      {isLoading ? (
        <Panel title="Loading">Loading dispatcher workspace…</Panel>
      ) : !workspace ? (
        <EmptyState title="No data" description="Dispatcher workspace is unavailable." />
      ) : (
        <>
          <Panel title="Dispatch Summary">
            <p>{workspace.summary}</p>
          </Panel>

          <div className="stat-grid">
            <StatCard label="Pending Dispatch" value={String(workspace.pendingDispatchCount)} />
            <StatCard label="Fleet Vehicles" value={String(workspace.fleetVehicleCount)} />
            <StatCard label="Incident Alerts" value={String(workspace.incidentAlertCount)} />
            <StatCard
              label="Tracking Provider"
              value={workspace.activeTrackingProvider?.replace(/_/g, ' ') ?? 'None active'}
            />
          </div>

          <Panel title="Technician Status">
            {workspace.technicianStatuses.length === 0 ? (
              <EmptyState
                title="No technicians"
                description="Technician status appears when team members are registered."
              />
            ) : (
              <div className="data-list">
                {workspace.technicianStatuses.map((tech) => (
                  <div key={tech.userId} className="data-list-item">
                    <strong>{tech.userName}</strong>
                    <span className="status-pill">{tech.assignedJobCount} job(s)</span>
                    <p>
                      Device: {tech.deviceStatus ? formatDeviceStatus(tech.deviceStatus) : 'none'} ·
                      Last sync: {tech.lastSyncAt ?? 'never'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {workspace.recommendations.length > 0 ? (
            <Panel title="AI Recommendations">
              <ul className="portal-list">
                {workspace.recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
