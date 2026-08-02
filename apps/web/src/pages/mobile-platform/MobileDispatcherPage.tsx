import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import { NAV_LABELS } from '@titan/shared';
import type { MobileDispatcherWorkspace } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchMobileDispatcherWorkspace } from '../../lib/enterprise-mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { canAccessMobilePlatform, formatDeviceStatus } from '../../features/mobile-platform/utils';
import { LiveDispatchNav } from '../../features/dispatch/LiveDispatchNav';
import { LiveDispatchMapPanel } from '../../features/dispatch/LiveDispatchMapPanel';
import { LiveDispatchWorkQueues } from '../../features/dispatch/LiveDispatchWorkQueues';
import { PageHeader } from '../../components/ux';

function canAccessLiveDispatch(permissions: string[]): boolean {
  return (
    canAccessMobilePlatform(permissions) ||
    permissions.includes('dispatch:read') ||
    permissions.includes('dispatch_intelligence:read') ||
    permissions.includes('scheduling:read') ||
    permissions.includes('*')
  );
}

export function MobileDispatcherPage() {
  const { accessToken, user } = useAuth();
  const [workspace, setWorkspace] = useState<MobileDispatcherWorkspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(
    () => (user ? canAccessLiveDispatch(user.permissions) : false),
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
      <div className="automation-page live-dispatch-page">
        <PageHeader
          title={NAV_LABELS.liveDispatch}
          description="You do not have permission to view live dispatch."
        />
      </div>
    );
  }

  return (
    <div className="automation-page live-dispatch-page">
      <PageHeader
        title={NAV_LABELS.liveDispatch}
        description="Live map, technician status, work queues, and Cartrack GPS — staff only."
        breadcrumbs={[{ label: NAV_LABELS.liveDispatch }]}
        actions={
          <div className="page-header-actions">
            <Link href="/scheduling">
              <Button variant="secondary">Scheduling</Button>
            </Link>
            <Link href="/mobile-platform">
              <Button variant="ghost">Mobile Platform Admin</Button>
            </Link>
          </div>
        }
      />
      <LiveDispatchNav />

      {error ? <p className="form-error">{error}</p> : null}

      <LiveDispatchMapPanel accessToken={accessToken} enabled={canView} />

      <LiveDispatchWorkQueues accessToken={accessToken} enabled={canView} />

      {isLoading ? (
        <Panel title="Technician workspace">Loading dispatcher workspace…</Panel>
      ) : !workspace ? (
        <EmptyState title="No workspace data" description="Dispatcher workspace is unavailable." />
      ) : (
        <>
          <Panel title="Dispatch summary">
            <p>{workspace.summary}</p>
          </Panel>

          <div className="stat-grid">
            <StatCard label="Pending dispatch" value={String(workspace.pendingDispatchCount)} />
            <StatCard label="Fleet vehicles" value={String(workspace.fleetVehicleCount)} />
            <StatCard label="Incident alerts" value={String(workspace.incidentAlertCount)} />
            <StatCard
              label="Tracking provider"
              value={workspace.activeTrackingProvider?.replace(/_/g, ' ') ?? 'None active'}
            />
          </div>

          <Panel title="Technician status">
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
                    {tech.activeJobTitle ? (
                      <p className="page-muted">Current: {tech.activeJobTitle}</p>
                    ) : null}
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
            <Panel title="AI recommendations">
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
