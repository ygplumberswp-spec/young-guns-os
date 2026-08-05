import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { FleetExecutiveDashboard } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import { useCompanyLocale } from '../../lib/company-locale-context';
import {
  FleetIntelligenceApiClientError,
  analyzeDriverBehaviour,
  createFleetAction,
  createOperatingCost,
  fetchDriverBehaviour,
  fetchFleetActions,
  fetchFleetCosts,
  fetchFleetDashboard,
  fetchFleetPerformance,
  fetchFleetRecommendations,
  fetchMonthlyReports,
  fetchTripHistory,
  fetchVehicleUtilization,
  generateFleetRecommendations,
  generateMonthlyReport,
} from '../../lib/fleet-intelligence-api-client';
import {
  CARTRACK_UI_POLL_MS,
  useCartrackLivePositions,
} from '../../features/dispatch/useCartrackLivePositions';
import { FollowVehiclePanel } from '../../features/fleet/FollowVehiclePanel';
import {
  FleetOverviewVehicleRow,
  buildPositionCardModel,
} from '../../features/fleet/FleetVehicleCards';
import { ExtendedReportExportActions } from '../../features/reports/ExtendedReportExportActions';

type FleetTab =
  | 'dashboard'
  | 'live-map'
  | 'trips'
  | 'reports'
  | 'behaviour'
  | 'utilization'
  | 'costs'
  | 'performance'
  | 'recommendations'
  | 'actions';

function canAccess(permissions: string[]) {
  return (
    permissions.includes('fleet_intelligence:read') ||
    permissions.includes('fleet_intelligence:write') ||
    permissions.includes('fleet:read') ||
    permissions.includes('integrations:read') ||
    permissions.includes('agents:read') ||
    permissions.includes('*')
  );
}

function canWrite(permissions: string[]) {
  return (
    permissions.includes('fleet_intelligence:write') ||
    permissions.includes('fleet:write') ||
    permissions.includes('*')
  );
}

export function FleetIntelligencePage() {
  const { accessToken, user } = useAuth();
  const { formatMoney } = useCompanyLocale();
  const [activeTab, setActiveTab] = useState<FleetTab>('dashboard');
  const [followPlate, setFollowPlate] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<FleetExecutiveDashboard | null>(null);
  const { tracking, lastFetchedAt } = useCartrackLivePositions({
    accessToken,
    enabled: Boolean(accessToken),
  });
  const [trips, setTrips] = useState<Awaited<ReturnType<typeof fetchTripHistory>>>([]);
  const [reports, setReports] = useState<Awaited<ReturnType<typeof fetchMonthlyReports>>>([]);
  const [behaviourEvents, setBehaviourEvents] = useState<
    Awaited<ReturnType<typeof fetchDriverBehaviour>>
  >([]);
  const [utilization, setUtilization] = useState<
    Awaited<ReturnType<typeof fetchVehicleUtilization>>
  >([]);
  const [costs, setCosts] = useState<Awaited<ReturnType<typeof fetchFleetCosts>> | null>(null);
  const [performance, setPerformance] = useState<Awaited<
    ReturnType<typeof fetchFleetPerformance>
  > | null>(null);
  const [recommendations, setRecommendations] = useState<
    Awaited<ReturnType<typeof fetchFleetRecommendations>>
  >([]);
  const [actions, setActions] = useState<Awaited<ReturnType<typeof fetchFleetActions>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [reportMonth, setReportMonth] = useState(String(new Date().getMonth() + 1));
  const [costAmount, setCostAmount] = useState('');
  const [costType, setCostType] = useState<'fuel' | 'maintenance' | 'repair'>('fuel');
  const [actionSubject, setActionSubject] = useState('');
  const [actionRecommendation, setActionRecommendation] = useState('');

  const canView = useMemo(() => (user ? canAccess(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canWrite(user.permissions) : false), [user]);

  async function loadPage() {
    if (!accessToken) return;
    const [
      dashboardData,
      tripRows,
      reportRows,
      behaviourRows,
      utilizationRows,
      costData,
      performanceData,
      recommendationRows,
      actionRows,
    ] = await Promise.all([
      fetchFleetDashboard(accessToken),
      fetchTripHistory(accessToken),
      fetchMonthlyReports(accessToken),
      fetchDriverBehaviour(accessToken),
      fetchVehicleUtilization(accessToken),
      fetchFleetCosts(accessToken),
      fetchFleetPerformance(accessToken),
      fetchFleetRecommendations(accessToken),
      fetchFleetActions(accessToken),
    ]);
    setDashboard(dashboardData);
    setTrips(tripRows);
    setReports(reportRows);
    setBehaviourEvents(behaviourRows);
    setUtilization(utilizationRows);
    setCosts(costData);
    setPerformance(performanceData);
    setRecommendations(recommendationRows);
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
          setError(
            err instanceof FleetIntelligenceApiClientError
              ? err.message
              : 'Unable to load fleet intelligence',
          );
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

  async function handleGenerateReport(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await generateMonthlyReport(accessToken, {
        periodYear: Number(reportYear),
        periodMonth: Number(reportMonth),
      });
      setSuccess('Monthly trip report generated.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FleetIntelligenceApiClientError ? err.message : 'Unable to generate report',
      );
    }
  }

  async function handleAnalyzeBehaviour() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await analyzeDriverBehaviour(accessToken);
      setSuccess('Driver behaviour analysis complete.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FleetIntelligenceApiClientError
          ? err.message
          : 'Unable to analyze behaviour',
      );
    }
  }

  async function handleCreateCost(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await createOperatingCost(accessToken, {
        costType,
        amountCents: Math.round(Number(costAmount) * 100),
      });
      setCostAmount('');
      setSuccess('Operating cost recorded.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FleetIntelligenceApiClientError ? err.message : 'Unable to record cost',
      );
    }
  }

  async function handleCreateAction(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await createFleetAction(accessToken, {
        actionType: 'fleet_action',
        subject: actionSubject,
        recommendation: actionRecommendation,
      });
      setActionSubject('');
      setActionRecommendation('');
      setSuccess('Fleet action drafted for approval.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FleetIntelligenceApiClientError ? err.message : 'Unable to create action',
      );
    }
  }

  async function handleGenerateRecommendations() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await generateFleetRecommendations(accessToken);
      setSuccess('Fleet recommendations generated.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FleetIntelligenceApiClientError
          ? err.message
          : 'Unable to generate recommendations',
      );
    }
  }

  if (!canView) {
    return (
      <div className="page">
        <PageHeader
          title="Fleet Intelligence"
          description="GPS analytics and fleet performance intelligence."
        />
        <EmptyState
          title="Access Restricted"
          description="You do not have permission to view fleet intelligence."
        />
      </div>
    );
  }

  // Same polled tracking context the dispatch surfaces use, so Fleet Overview and the
  // live map can never disagree about a vehicle.
  const trackedVehicles = useMemo(() => {
    const connected = Boolean(tracking?.cartrackConnected);
    return (tracking?.latestPositions ?? [])
      .filter(
        (position) =>
          Number.isFinite(position.latitude) && Number.isFinite(position.longitude),
      )
      .map((position) => ({
        markerId: `vehicle-${position.externalVehicleId}`,
        model: buildPositionCardModel(position, connected),
      }))
      .sort((a, b) => a.model.plate.localeCompare(b.model.plate));
  }, [tracking?.cartrackConnected, tracking?.latestPositions]);

  const tabs: Array<{ id: FleetTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'live-map', label: 'Live Map' },
    { id: 'trips', label: 'Trips' },
    { id: 'reports', label: 'Reports' },
    { id: 'behaviour', label: 'Behaviour' },
    { id: 'utilization', label: 'Utilization' },
    { id: 'costs', label: 'Costs' },
    { id: 'performance', label: 'Performance' },
    { id: 'recommendations', label: 'Recommendations' },
    { id: 'actions', label: 'Actions' },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Fleet Intelligence"
        description="GPS trip intelligence, utilization analytics, and fleet recommendations from real Cartrack data."
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="tab-row">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'primary' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {isLoading ? <p>Loading fleet intelligence…</p> : null}

      {!isLoading && activeTab === 'dashboard' && dashboard ? (
        <div className="stack">
          <div className="stat-grid">
            <StatCard label="Total Vehicles" value={String(dashboard.totalVehicles)} />
            <StatCard label="Active Vehicles" value={String(dashboard.activeVehicles)} />
            <StatCard label="In Service" value={String(dashboard.inServiceVehicles)} />
            <StatCard label="Fleet Km" value={String(dashboard.totalKilometres)} />
            <StatCard label="Health Score" value={dashboard.fleetHealthScore?.toString() ?? '—'} />
            <StatCard label="GPS Positions" value={String(dashboard.gpsPositionCount)} />
            <StatCard
              label="Cartrack"
              value={dashboard.cartrackConnected ? 'Connected' : 'Disconnected'}
            />
            <StatCard label="Pending Actions" value={String(dashboard.pendingActionCount)} />
          </div>
          <Panel title="Fleet Overview">
            {trackedVehicles.length > 0 ? (
              <ul className="fleet-overview-list">
                {trackedVehicles.map((entry) => (
                  <FleetOverviewVehicleRow
                    key={entry.markerId}
                    model={entry.model}
                    onSelect={() => {
                      setFollowPlate(entry.model.plate);
                      setActiveTab('live-map');
                    }}
                  />
                ))}
              </ul>
            ) : (
              <p className="page-muted">
                No stored Cartrack positions yet. TITAN shows no vehicle status it cannot
                source from the provider.
              </p>
            )}
            <p className="page-muted">{dashboard.summary}</p>
            <p className="page-muted">
              Maintenance due: {dashboard.maintenanceDueCount} · Inspections due:{' '}
              {dashboard.inspectionsDueCount} · Utilization: {dashboard.utilizationPercent ?? '—'}%
              · Downtime: {dashboard.downtimePercent ?? '—'}%
            </p>
          </Panel>
          <Panel title="Geofences">
            <p className="page-muted">
              Cartrack geofence records are not available in this release. TITAN will not invent
              geofence events. Trip history and behaviour events below use existing GPS-derived
              paths only.
            </p>
          </Panel>
        </div>
      ) : null}

      {activeTab === 'live-map' ? (
        <div className="stack">
          <Panel
            title="Live map & Follow Vehicle"
            description="Vehicle positions polled from Cartrack. Follow Vehicle keeps the selected vehicle centred, pauses when you move the map, and holds the last known position when a tracker goes quiet."
          >
            <FollowVehiclePanel
              accessToken={accessToken}
              tracking={tracking}
              uiRefreshIntervalMs={CARTRACK_UI_POLL_MS}
              lastFetchedAt={lastFetchedAt}
              initialPlate={followPlate}
            />
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'trips' ? (
        <Panel title="GPS Trip History">
          {trips.length === 0 ? (
            <EmptyState
              title="No Trips Available"
              description="Trip history is derived from real Cartrack GPS positions. Sync Cartrack to populate data."
            />
          ) : (
            <ul className="list">
              {trips.slice(0, 50).map((trip, index) => (
                <li key={`${trip.startedAt}-${index}`}>
                  {trip.vehicleName ?? 'Unmapped vehicle'} · {trip.distanceKm} km ·{' '}
                  {trip.durationMinutes} min · {new Date(trip.startedAt).toLocaleString()} →{' '}
                  {new Date(trip.endedAt).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'reports' ? (
        <div className="stack">
          {canManage ? (
            <Panel title="Generate Monthly Report">
              <form className="form-row" onSubmit={handleGenerateReport}>
                <Input
                  label="Year"
                  value={reportYear}
                  onChange={(event) => setReportYear(event.target.value)}
                />
                <Input
                  label="Month"
                  value={reportMonth}
                  onChange={(event) => setReportMonth(event.target.value)}
                />
                <Button type="submit">Generate Report</Button>
              </form>
            </Panel>
          ) : null}
          <Panel title="Monthly Trip Reports">
            {reports.length === 0 ? (
              <EmptyState
                title="No Reports Yet"
                description="Generate a monthly report from real GPS data."
              />
            ) : (
              <ul className="list">
                {reports.map((report) => (
                  <li key={report.id}>
                    {report.periodYear}-{String(report.periodMonth).padStart(2, '0')}:{' '}
                    {report.totalKilometres} km, {report.totalTrips} trips, {report.drivingHours}h
                    driving
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {accessToken && canView ? (
            <Panel title="Fleet PDF exports">
              <ExtendedReportExportActions
                accessToken={accessToken}
                kind="fleet_operations"
                target={{ scope: 'tenant' }}
              />
              {utilization[0]?.vehicleId ? (
                <ExtendedReportExportActions
                  accessToken={accessToken}
                  kind="fleet_vehicle_activity"
                  target={{ scope: 'vehicle', vehicleId: utilization[0].vehicleId }}
                />
              ) : null}
            </Panel>
          ) : null}
        </div>
      ) : null}

      {!isLoading && activeTab === 'behaviour' ? (
        <div className="stack">
          {canManage ? (
            <Panel title="Analyze Driver Behaviour">
              <p>
                Analyze speeding, harsh braking, acceleration, and idling from existing GPS
                telemetry.
              </p>
              <Button onClick={() => void handleAnalyzeBehaviour()}>Run Analysis</Button>
            </Panel>
          ) : null}
          <Panel title="Behaviour Events">
            {behaviourEvents.length === 0 ? (
              <EmptyState
                title="No Behaviour Events"
                description="Run analysis after GPS data is available."
              />
            ) : (
              <ul className="list">
                {behaviourEvents.slice(0, 50).map((event) => (
                  <li key={event.id}>
                    {event.vehicleName ?? 'Vehicle'} · {event.eventType} · severity {event.severity}{' '}
                    · {new Date(event.occurredAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'utilization' ? (
        <Panel title="Vehicle Utilization">
          {utilization.length === 0 ? (
            <EmptyState
              title="No Vehicles"
              description="Add vehicles to the fleet register to track utilization."
            />
          ) : (
            <ul className="list">
              {utilization.map((row) => (
                <li key={row.vehicleId}>
                  {row.vehicleName} ({row.licensePlate}) · {row.utilizationPercent ?? '—'}%
                  utilization · {row.kilometresPerDay ?? '—'} km/day · {row.jobsCompleted} jobs ·{' '}
                  {row.gpsPointCount} GPS points
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'costs' ? (
        <div className="stack">
          {canManage ? (
            <Panel title="Record Operating Cost">
              <form className="form-row" onSubmit={handleCreateCost}>
                <Input
                  label="Amount"
                  value={costAmount}
                  onChange={(event) => setCostAmount(event.target.value)}
                />
                <label>
                  Type
                  <select
                    value={costType}
                    onChange={(event) => setCostType(event.target.value as typeof costType)}
                  >
                    <option value="fuel">Fuel</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="repair">Repair</option>
                  </select>
                </label>
                <Button type="submit">Record Cost</Button>
              </form>
            </Panel>
          ) : null}
          <Panel title="Operating Costs">
            {costs && costs.costs.length === 0 ? (
              <EmptyState
                title="No Costs Recorded"
                description="Record real operating costs — values are never fabricated."
              />
            ) : (
              <>
                <p>
                  Total: {formatMoney(costs?.analytics.totalOperatingCostCents ?? 0)} · Cost/km:{' '}
                  {costs?.analytics.costPerKilometreCents != null
                    ? formatMoney(costs.analytics.costPerKilometreCents)
                    : '—'}
                </p>
                <ul className="list">
                  {costs?.costs.slice(0, 50).map((cost) => (
                    <li key={cost.id}>
                      {cost.vehicleName ?? 'Fleet-wide'} · {cost.costType} ·{' '}
                      {formatMoney(cost.amountCents, cost.currency)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'performance' && performance ? (
        <Panel title="Fleet Performance">
          <ul className="list">
            <li>Best performing vehicle: {performance.bestPerformingVehicle ?? '—'}</li>
            <li>Lowest utilization: {performance.lowestUtilizationVehicle ?? '—'}</li>
            <li>Highest operating cost: {performance.highestOperatingCostVehicle ?? '—'}</li>
            <li>Travel efficiency score: {performance.travelEfficiencyScore ?? '—'}</li>
            <li>Maintenance due: {performance.maintenanceDueCount}</li>
            <li>Inspections due: {performance.inspectionsDueCount}</li>
          </ul>
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'recommendations' ? (
        <div className="stack">
          {canManage ? (
            <Panel title="Generate Recommendations">
              <Button onClick={() => void handleGenerateRecommendations()}>
                Generate fleet recommendations
              </Button>
            </Panel>
          ) : null}
          <Panel title="Fleet Recommendations">
            {recommendations.length === 0 ? (
              <EmptyState
                title="No Recommendations"
                description="Generate recommendations via explicit API action."
              />
            ) : (
              <ul className="list">
                {recommendations.map((item) => (
                  <li key={item.id}>
                    <strong>{item.subject}</strong> — {item.recommendation}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'actions' ? (
        <div className="stack">
          {canManage ? (
            <Panel title="Draft Fleet Action">
              <form className="stack" onSubmit={handleCreateAction}>
                <Input
                  label="Subject"
                  value={actionSubject}
                  onChange={(event) => setActionSubject(event.target.value)}
                />
                <Input
                  label="Recommendation"
                  value={actionRecommendation}
                  onChange={(event) => setActionRecommendation(event.target.value)}
                />
                <Button type="submit">Draft For Approval</Button>
              </form>
            </Panel>
          ) : null}
          <Panel title="Pending Fleet Actions">
            {actions.length === 0 ? (
              <EmptyState
                title="No Fleet Actions"
                description="Draft fleet actions require approval before execution."
              />
            ) : (
              <ul className="list">
                {actions.map((action) => (
                  <li key={action.id}>
                    {action.subject} · {action.status} · {action.recommendation}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
