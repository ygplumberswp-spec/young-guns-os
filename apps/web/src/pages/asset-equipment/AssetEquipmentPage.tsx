import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Input, PageHeader, Panel, StatCard } from '@titan/ui';
import { formatMoney, type AssetEquipmentSummary, type AssetExecutiveDashboard } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import {
  AssetEquipmentApiClientError,
  createAssetAction,
  createAssetEquipment,
  fetchAssetActions,
  fetchAssetEquipmentDashboard,
  fetchAssetInspections,
  fetchAssetMaintenanceRecords,
  fetchAssetMaintenanceSchedules,
  fetchAssetRegister,
} from '../../lib/asset-equipment-api-client';

type AssetTab = 'dashboard' | 'register' | 'maintenance' | 'schedules' | 'inspections' | 'actions';

function canAccess(permissions: string[]) {
  return (
    permissions.includes('asset_equipment:read') ||
    permissions.includes('asset_equipment:write') ||
    permissions.includes('fleet:read') ||
    permissions.includes('*')
  );
}

function canWrite(permissions: string[]) {
  return (
    permissions.includes('asset_equipment:write') ||
    permissions.includes('fleet:write') ||
    permissions.includes('*')
  );
}

export function AssetEquipmentPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<AssetTab>('dashboard');
  const [dashboard, setDashboard] = useState<AssetExecutiveDashboard | null>(null);
  const [assets, setAssets] = useState<AssetEquipmentSummary[]>([]);
  const [records, setRecords] = useState<Awaited<ReturnType<typeof fetchAssetMaintenanceRecords>>>([]);
  const [schedules, setSchedules] = useState<Awaited<ReturnType<typeof fetchAssetMaintenanceSchedules>>>([]);
  const [inspections, setInspections] = useState<Awaited<ReturnType<typeof fetchAssetInspections>>>([]);
  const [actions, setActions] = useState<Awaited<ReturnType<typeof fetchAssetActions>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [assetName, setAssetName] = useState('');
  const [actionSubject, setActionSubject] = useState('');
  const [actionRecommendation, setActionRecommendation] = useState('');

  const canView = useMemo(() => (user ? canAccess(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canWrite(user.permissions) : false), [user]);

  async function loadPage() {
    if (!accessToken) return;
    const [dashboardData, assetRows, recordRows, scheduleRows, inspectionRows, actionRows] = await Promise.all([
      fetchAssetEquipmentDashboard(accessToken),
      fetchAssetRegister(accessToken),
      fetchAssetMaintenanceRecords(accessToken),
      fetchAssetMaintenanceSchedules(accessToken),
      fetchAssetInspections(accessToken),
      fetchAssetActions(accessToken),
    ]);
    setDashboard(dashboardData);
    setAssets(assetRows);
    setRecords(recordRows);
    setSchedules(scheduleRows);
    setInspections(inspectionRows);
    setActions(actionRows);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        await loadPage();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof AssetEquipmentApiClientError ? err.message : 'Unable to load asset data');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function handleCreateAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage || !assetName.trim()) return;

    setError(null);
    setSuccess(null);

    try {
      await createAssetEquipment(accessToken, {
        assetType: 'equipment',
        name: assetName.trim(),
      });
      setAssetName('');
      setSuccess('Asset registered.');
      await loadPage();
    } catch (err) {
      setError(err instanceof AssetEquipmentApiClientError ? err.message : 'Unable to create asset');
    }
  }

  async function handleCreateAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage || !actionSubject.trim() || !actionRecommendation.trim()) return;

    setError(null);
    setSuccess(null);

    try {
      await createAssetAction(accessToken, {
        actionType: 'maintenance_action',
        subject: actionSubject.trim(),
        recommendation: actionRecommendation.trim(),
      });
      setActionSubject('');
      setActionRecommendation('');
      setSuccess('Maintenance action drafted for approval.');
      await loadPage();
    } catch (err) {
      setError(err instanceof AssetEquipmentApiClientError ? err.message : 'Unable to create action');
    }
  }

  if (!canView) {
    return (
      <EmptyState
        title="Asset access required"
        description="You need asset equipment permissions to view this department."
      />
    );
  }

  if (isLoading) return <p className="page-muted">Loading asset intelligence…</p>;

  const analytics = dashboard?.analytics;
  const tabs: Array<{ id: AssetTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'register', label: 'Register' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'schedules', label: 'Schedules' },
    { id: 'inspections', label: 'Inspections' },
    { id: 'actions', label: 'Actions' },
  ];

  return (
    <div className="portal-page">
      <PageHeader
        title="Asset & Equipment Intelligence"
        description="Asset register, maintenance, inspections, and lifecycle intelligence from real tenant data."
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="tab-row">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'dashboard' && analytics ? (
        <>
          <div className="stat-grid">
            <StatCard label="Total assets" value={String(analytics.totalAssets)} />
            <StatCard label="Active assets" value={String(analytics.activeAssetCount)} />
            <StatCard label="In maintenance" value={String(analytics.maintenanceAssetCount)} />
            <StatCard
              label="Maintenance cost"
              value={formatMoney(analytics.totalMaintenanceCostCents, analytics.currency)}
            />
            <StatCard label="Total downtime (hrs)" value={String(analytics.totalDowntimeHours)} />
            <StatCard
              label="Average asset age"
              value={analytics.averageAssetAgeYears != null ? `${analytics.averageAssetAgeYears} yrs` : 'N/A'}
            />
          </div>

          <div className="portal-grid">
            <Panel title="Replacement recommendations">
              {analytics.replacementRecommendations.length === 0 ? (
                <p className="page-muted">No replacement recommendations yet.</p>
              ) : (
                <ul className="portal-list">
                  {analytics.replacementRecommendations.map((row) => (
                    <li key={row.assetId}>
                      <strong>{row.name}</strong>
                      <span>{row.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Upcoming maintenance">
              {dashboard.upcomingMaintenance.length === 0 ? (
                <p className="page-muted">No scheduled maintenance due.</p>
              ) : (
                <ul className="portal-list">
                  {dashboard.upcomingMaintenance.map((row) => (
                    <li key={row.id}>
                      <strong>{row.title}</strong>
                      <span>
                        {row.assetName ?? 'Unknown asset'} · due {row.nextDueAt ?? 'TBD'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      ) : null}

      {activeTab === 'register' ? (
        <>
          {canManage ? (
            <Panel title="Register asset" description="Links to real fleet vehicles optionally — no demo records.">
              <form className="form-grid" onSubmit={(event) => void handleCreateAsset(event)}>
                <Input
                  label="Asset name"
                  value={assetName}
                  onChange={(event) => setAssetName(event.target.value)}
                  required
                />
                <Button type="submit">Register asset</Button>
              </form>
            </Panel>
          ) : null}

          <Panel title="Asset register">
            {assets.length === 0 ? (
              <EmptyState title="No assets" description="Assets appear when registered against real records." />
            ) : (
              <ul className="portal-list">
                {assets.map((asset) => (
                  <li key={asset.id}>
                    <strong>{asset.name}</strong>
                    <span>
                      {asset.assetType} · {asset.status} · {asset.condition}
                      {asset.assignedTechnicianName ? ` · ${asset.assignedTechnicianName}` : ''}
                    </span>
                    <span>{asset.locationText ?? asset.branchKey ?? 'No location'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {activeTab === 'maintenance' ? (
        <Panel title="Maintenance records">
          {records.length === 0 ? (
            <EmptyState title="No maintenance records" description="Records require approval before execution." />
          ) : (
            <ul className="portal-list">
              {records.map((record) => (
                <li key={record.id}>
                  <strong>{record.title}</strong>
                  <span>
                    {record.assetName ?? 'Unknown asset'} · {record.maintenanceType} · {record.status}
                  </span>
                  <span>{record.description ?? 'No description'}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'schedules' ? (
        <Panel title="Preventative maintenance schedules">
          {schedules.length === 0 ? (
            <EmptyState title="No schedules" description="Schedules generate recommendations only." />
          ) : (
            <ul className="portal-list">
              {schedules.map((schedule) => (
                <li key={schedule.id}>
                  <strong>{schedule.title}</strong>
                  <span>
                    {schedule.assetName ?? 'Unknown asset'} · {schedule.scheduleType} · due{' '}
                    {schedule.nextDueAt ?? 'TBD'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'inspections' ? (
        <Panel title="Inspection history">
          {inspections.length === 0 ? (
            <EmptyState title="No inspections" description="Inspections appear when recorded against real assets." />
          ) : (
            <ul className="portal-list">
              {inspections.map((inspection) => (
                <li key={inspection.id}>
                  <strong>{inspection.inspectionType}</strong>
                  <span>
                    {inspection.assetName ?? 'Unknown asset'} · {inspection.status}
                    {inspection.inspectorName ? ` · ${inspection.inspectorName}` : ''}
                  </span>
                  <span>{inspection.findings ?? 'No findings recorded'}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'actions' ? (
        <>
          {canManage ? (
            <Panel title="Draft maintenance action" description="Draft → Approval → Execution. No automatic scheduling.">
              <form className="form-grid" onSubmit={(event) => void handleCreateAction(event)}>
                <Input
                  label="Subject"
                  value={actionSubject}
                  onChange={(event) => setActionSubject(event.target.value)}
                  required
                />
                <Input
                  label="Recommendation"
                  value={actionRecommendation}
                  onChange={(event) => setActionRecommendation(event.target.value)}
                  required
                />
                <Button type="submit">Draft action</Button>
              </form>
            </Panel>
          ) : null}

          <Panel title="Pending and historical actions">
            {actions.length === 0 ? (
              <EmptyState title="No actions" description="Asset actions are drafted for manager approval." />
            ) : (
              <ul className="portal-list">
                {actions.map((action) => (
                  <li key={action.id}>
                    <strong>{action.subject}</strong>
                    <span>
                      {action.actionType} · {action.status}
                      {action.assetName ? ` · ${action.assetName}` : ''}
                    </span>
                    <span>{action.recommendation}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
