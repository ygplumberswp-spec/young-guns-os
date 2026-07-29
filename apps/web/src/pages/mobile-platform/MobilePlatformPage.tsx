import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type { EnterpriseMobilePlatformDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureMobileFieldIntelligence,
  fetchMobilePlatformDashboard,
  processMobileSync,
  registerMobileDevice,
  revokeMobileDevice,
  updateMobilePlatformConfig,
} from '../../lib/enterprise-mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessMobilePlatform,
  canManageMobilePlatform,
  formatDevicePlatform,
  formatDeviceStatus,
} from '../../features/mobile-platform/utils';

type MobilePlatformTab = 'overview' | 'devices' | 'offline' | 'fleet' | 'intelligence' | 'assistant';

export function MobilePlatformPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<MobilePlatformTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseMobilePlatformDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { agentMessages, isSending, pendingTasks, sendAgentMessage, updateTask, error: assistantError } =
    useAuraChat();

  const canView = useMemo(() => (user ? canAccessMobilePlatform(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageMobilePlatform(user.permissions) : false), [user]);

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchMobilePlatformDashboard(accessToken);
    setDashboard(data);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await fetchMobilePlatformDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : 'Unable to load mobile platform');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function runAction(action: () => Promise<unknown>, message: string) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadDashboard();
      setSuccess(message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setIsWorking(false);
    }
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader title="Mobile Platform" description="You do not have permission to view the mobile platform." />
      </div>
    );
  }

  const tabs: Array<{ id: MobilePlatformTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'devices', label: 'Devices' },
    { id: 'offline', label: 'Offline & Sync' },
    { id: 'fleet', label: 'Fleet Tracking' },
    { id: 'intelligence', label: 'Field Intelligence' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  return (
    <div className="automation-page">
      <PageHeader
        title="Mobile Platform"
        description="Enterprise mobile platform — devices, offline sync, fleet tracking, and field intelligence. Real data only."
        actions={
          <div className="page-header-actions">
            <Link href="/mobile-platform/dispatcher">
              <Button variant="secondary">Dispatcher Workspace</Button>
            </Link>
            <Link href="/mobile">
              <Button variant="secondary">Technician Workspace</Button>
            </Link>
            {canWrite ? (
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => registerMobileDevice(accessToken!, { deviceKey: `web_${Date.now()}`, platform: 'web', deviceName: 'Web Browser' }),
                    'Device registered.',
                  )
                }
              >
                Register Device
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="tab-row">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" className={activeTab === tab.id ? 'tab-button active' : 'tab-button'} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Panel title="Loading">Loading mobile platform…</Panel>
      ) : !dashboard ? (
        <EmptyState title="No data" description="Mobile platform dashboard is unavailable." />
      ) : (
        <>
          <Panel title="Platform Summary">
            <p>{dashboard.summary}</p>
            {dashboard.isPlatformOwner ? (
              <span className="status-pill status-healthy">Platform Owner — global mobile visibility</span>
            ) : null}
          </Panel>

          {activeTab === 'overview' ? (
            <div className="stat-grid">
              <StatCard label="Active Devices" value={String(dashboard.activeDeviceCount)} />
              <StatCard label="Pending Sync" value={String(dashboard.pendingSyncQueueCount)} />
              <StatCard label="Sync Conflicts" value={String(dashboard.pendingConflictCount)} />
              <StatCard label="Fleet Providers" value={String(dashboard.fleetProviders.length)} />
              <StatCard label="Cartrack" value={dashboard.cartrackConnected ? 'Connected' : 'Not connected'} />
              <StatCard label="Offline Retention" value={`${dashboard.platformConfig.offlineRetentionDays} days`} />
              <StatCard label="Sync Frequency" value={`${dashboard.platformConfig.syncFrequencyMinutes} min`} />
              <StatCard label="PWA Enabled" value={dashboard.platformConfig.pwaEnabled ? 'Yes' : 'No'} />
            </div>
          ) : null}

          {activeTab === 'devices' ? (
            <Panel title="Registered Devices">
              {dashboard.devices.length === 0 ? (
                <EmptyState title="No devices" description="Register a device when a technician or dispatcher signs in from mobile." />
              ) : (
                <div className="data-list">
                  {dashboard.devices.map((device) => (
                    <div key={device.id} className="data-list-item">
                      <strong>{device.deviceName ?? device.deviceKey}</strong>
                      <span className="status-pill">{formatDeviceStatus(device.status)}</span>
                      <p>
                        {formatDevicePlatform(device.platform)} · {device.userName ?? 'Unassigned'} · v{device.appVersion ?? '—'}
                      </p>
                      {canWrite && device.status === 'active' ? (
                        <Button
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() => void runAction(() => revokeMobileDevice(accessToken!, device.id), 'Device revoked.')}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'offline' ? (
            <>
              <Panel title="Offline Operations">
                <p>Supported offline resources: {dashboard.offlineResourceTypes.join(', ')}</p>
                {canWrite ? (
                  <Button variant="secondary" disabled={isWorking} onClick={() => void runAction(() => processMobileSync(accessToken!), 'Sync processed.')}>
                    Process Sync Queue
                  </Button>
                ) : null}
              </Panel>
              <Panel title="Sync History">
                {dashboard.syncHistory.length === 0 ? (
                  <EmptyState title="No sync history" description="Sync history appears after manual or background sync runs." />
                ) : (
                  <div className="data-list">
                    {dashboard.syncHistory.map((entry) => (
                      <div key={entry.id} className="data-list-item">
                        <strong>{entry.status}</strong>
                        <p>
                          Processed {entry.processedCount}, failed {entry.failedCount}, conflicts {entry.conflictCount} · {entry.startedAt}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </>
          ) : null}

          {activeTab === 'fleet' ? (
            <Panel title="Fleet Tracking Providers">
              <p>All mobile modules consume the standardized internal Fleet API — not provider-specific APIs.</p>
              {dashboard.fleetProviders.length === 0 ? (
                <EmptyState title="No providers configured" description="Configure a fleet tracking provider for your tenant." />
              ) : (
                <div className="data-list">
                  {dashboard.fleetProviders.map((provider) => (
                    <div key={provider.id} className="data-list-item">
                      <strong>{provider.name}</strong>
                      <span className="status-pill">{provider.isActive ? 'active' : 'inactive'}</span>
                      <p>
                        {provider.providerType.replace(/_/g, ' ')} · {provider.lastTestStatus ?? 'not tested'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'intelligence' ? (
            <Panel title="Field Intelligence">
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() => void runAction(() => captureMobileFieldIntelligence(accessToken!), 'Field intelligence captured.')}
                >
                  Capture Snapshot
                </Button>
              ) : null}
              {!dashboard.fieldIntelligence ? (
                <EmptyState title="No snapshot" description="Capture field intelligence from real job, sync, and device data." />
              ) : (
                <div className="stat-grid">
                  <StatCard label="Productivity" value={String(dashboard.fieldIntelligence.technicianProductivityScore ?? '—')} />
                  <StatCard label="Avg Job Duration" value={String(dashboard.fieldIntelligence.avgJobDurationMinutes ?? '—')} />
                  <StatCard label="Sync Health" value={String(dashboard.fieldIntelligence.syncHealthScore ?? '—')} />
                  <StatCard label="Device Health" value={String(dashboard.fieldIntelligence.deviceHealthScore ?? '—')} />
                  <StatCard label="Fleet Utilization" value={String(dashboard.fieldIntelligence.fleetUtilizationPercent ?? '—')} />
                  <StatCard label="Safety Compliance" value={String(dashboard.fieldIntelligence.safetyComplianceScore ?? '—')} />
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'assistant' ? (
            <Panel title="AURA Mobile Agent">
              <p>Ask about jobs, offline sync, fleet tracking, troubleshooting, and field intelligence. Recommendations only.</p>
              {assistantError ? <p className="form-error">{assistantError}</p> : null}
              <AuraMessageList messages={agentMessages} isSending={isSending} />
              {pendingTasks.map((task) => (
                <AuraTaskApprovalCard key={task.id} task={task} accessToken={accessToken ?? ''} onUpdated={updateTask} />
              ))}
              <AuraComposer
                disabled={isSending}
                onSend={(content) => void sendAgentMessage(content, 'mobile_field')}
                placeholder="Ask about jobs, sync health, fleet tracking, or field intelligence…"
              />
            </Panel>
          ) : null}

          {canWrite && activeTab === 'overview' ? (
            <Panel title="Mobile Policies">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => updateMobilePlatformConfig(accessToken!, { syncFrequencyMinutes: 30 }),
                    'Sync frequency updated to 30 minutes.',
                  )
                }
              >
                Set Sync Frequency (30 min)
              </Button>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
