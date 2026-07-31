import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Input, PageHeader, Panel, StatCard } from '@titan/ui';
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

type FleetTab =
  | 'dashboard'
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
  const [dashboard, setDashboard] = useState<FleetExecutiveDashboard | null>(null);
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
          title="Access restricted"
          description="You do not have permission to view fleet intelligence."
        />
      </div>
    );
  }

  const tabs: Array<{ id: FleetTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
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
            <StatCard label="Total vehicles" value={String(dashboard.totalVehicles)} />
            <StatCard label="Active vehicles" value={String(dashboard.activeVehicles)} />
            <StatCard label="In service" value={String(dashboard.inServiceVehicles)} />
            <StatCard label="Fleet km" value={String(dashboard.totalKilometres)} />
            <StatCard label="Health score" value={dashboard.fleetHealthScore?.toString() ?? '—'} />
            <StatCard label="GPS positions" value={String(dashboard.gpsPositionCount)} />
            <StatCard
              label="Cartrack"
              value={dashboard.cartrackConnected ? 'Connected' : 'Disconnected'}
            />
            <StatCard label="Pending actions" value={String(dashboard.pendingActionCount)} />
          </div>
          <Panel title="Fleet overview">
            <p>{dashboard.summary}</p>
            <p>
              Maintenance due: {dashboard.maintenanceDueCount} · Inspections due:{' '}
              {dashboard.inspectionsDueCount} · Utilization: {dashboard.utilizationPercent ?? '—'}%
              · Downtime: {dashboard.downtimePercent ?? '—'}%
            </p>
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'trips' ? (
        <Panel title="GPS trip history">
          {trips.length === 0 ? (
            <EmptyState
              title="No trips available"
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
            <Panel title="Generate monthly report">
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
                <Button type="submit">Generate report</Button>
              </form>
            </Panel>
          ) : null}
          <Panel title="Monthly trip reports">
            {reports.length === 0 ? (
              <EmptyState
                title="No reports yet"
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
        </div>
      ) : null}

      {!isLoading && activeTab === 'behaviour' ? (
        <div className="stack">
          {canManage ? (
            <Panel title="Analyze driver behaviour">
              <p>
                Analyze speeding, harsh braking, acceleration, and idling from existing GPS
                telemetry.
              </p>
              <Button onClick={() => void handleAnalyzeBehaviour()}>Run analysis</Button>
            </Panel>
          ) : null}
          <Panel title="Behaviour events">
            {behaviourEvents.length === 0 ? (
              <EmptyState
                title="No behaviour events"
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
        <Panel title="Vehicle utilization">
          {utilization.length === 0 ? (
            <EmptyState
              title="No vehicles"
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
            <Panel title="Record operating cost">
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
                <Button type="submit">Record cost</Button>
              </form>
            </Panel>
          ) : null}
          <Panel title="Operating costs">
            {costs && costs.costs.length === 0 ? (
              <EmptyState
                title="No costs recorded"
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
        <Panel title="Fleet performance">
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
            <Panel title="Generate recommendations">
              <Button onClick={() => void handleGenerateRecommendations()}>
                Generate fleet recommendations
              </Button>
            </Panel>
          ) : null}
          <Panel title="Fleet recommendations">
            {recommendations.length === 0 ? (
              <EmptyState
                title="No recommendations"
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
            <Panel title="Draft fleet action">
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
                <Button type="submit">Draft for approval</Button>
              </form>
            </Panel>
          ) : null}
          <Panel title="Pending fleet actions">
            {actions.length === 0 ? (
              <EmptyState
                title="No fleet actions"
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
