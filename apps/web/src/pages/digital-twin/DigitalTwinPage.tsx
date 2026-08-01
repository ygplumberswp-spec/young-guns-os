import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { EnterpriseDigitalTwinDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureDigitalTwinHeatMaps,
  captureDigitalTwinSnapshot,
  fetchDigitalTwinDashboard,
  generateDigitalTwinRecommendations,
  runDigitalTwinSimulation,
} from '../../lib/digital-twin-api-client';
import { useAuth } from '../../lib/auth-context';
import {
  canAccessDigitalTwin,
  canManageDigitalTwin,
  formatRiskLevel,
  formatSimulationType,
} from '../../features/digital-twin/utils';

type TwinTab =
  'dashboard' | 'scenarios' | 'simulations' | 'heatmaps' | 'recommendations' | 'replay';

export function DigitalTwinPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TwinTab>('dashboard');
  const [dashboard, setDashboard] = useState<EnterpriseDigitalTwinDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessDigitalTwin(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageDigitalTwin(user.permissions) : false), [user]);

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchDigitalTwinDashboard(accessToken);
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
        await loadDashboard();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load digital twin');
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

  async function handleGenerateRecommendations() {
    if (!accessToken || !canWrite) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await generateDigitalTwinRecommendations(accessToken);
      await loadDashboard();
      setSuccess('Recommendations generated from real operational data.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to generate recommendations');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleCaptureSnapshot() {
    if (!accessToken || !canWrite) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await captureDigitalTwinSnapshot(accessToken, 'Manual snapshot');
      await loadDashboard();
      setSuccess('Operational state snapshot captured.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to capture snapshot');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleCaptureHeatMaps() {
    if (!accessToken || !canWrite) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await captureDigitalTwinHeatMaps(accessToken);
      await loadDashboard();
      setSuccess('Heat maps refreshed from live operational data.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to capture heat maps');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRunSimulation(scenarioId: string) {
    if (!accessToken || !canWrite) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await runDigitalTwinSimulation(accessToken, scenarioId);
      await loadDashboard();
      setSuccess('Read-only simulation completed. No production data modified.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to run simulation');
    } finally {
      setIsWorking(false);
    }
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="Digital Twin"
          description="You do not have permission to view the digital twin."
        />
      </div>
    );
  }

  const tabs: Array<{ id: TwinTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'scenarios', label: 'Scenarios' },
    { id: 'simulations', label: 'Simulations' },
    { id: 'heatmaps', label: 'Heat Maps' },
    { id: 'recommendations', label: 'AI Recommendations' },
    { id: 'replay', label: 'Replay' },
  ];

  const capacity = dashboard?.capacityUtilization;
  const risk = dashboard?.riskIndicators;

  return (
    <div className="automation-page">
      <PageHeader
        title="Digital Twin"
        description="Live operational mirror, what-if scenarios, read-only simulations, and decision intelligence."
        actions={
          canWrite ? (
            <Button disabled={isWorking} onClick={() => void handleCaptureSnapshot()}>
              Capture snapshot
            </Button>
          ) : undefined
        }
      />

      <nav className="automation-nav" aria-label="Digital twin sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={
              activeTab === tab.id
                ? 'automation-nav__link automation-nav__link--active'
                : 'automation-nav__link'
            }
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {isLoading ? <p className="page-muted">Loading digital twin…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {dashboard && activeTab === 'dashboard' ? (
        <>
          <section className="stat-grid">
            <StatCard
              label="Health score"
              value={
                dashboard.executiveStats.healthScore != null
                  ? String(dashboard.executiveStats.healthScore)
                  : '—'
              }
            />
            <StatCard label="Active scenarios" value={String(dashboard.activeScenarios.length)} />
            <StatCard
              label="Completed simulations"
              value={String(
                dashboard.recentSimulations.filter((s) => s.status === 'completed').length,
              )}
            />
            <StatCard
              label="Operational risk"
              value={formatRiskLevel(risk?.operationalRiskLevel ?? 'low')}
            />
            <StatCard
              label="Technician utilization"
              value={
                capacity?.technicianUtilizationPercent != null
                  ? `${capacity.technicianUtilizationPercent}%`
                  : '—'
              }
            />
            <StatCard
              label="Fleet utilization"
              value={
                capacity?.fleetUtilizationPercent != null
                  ? `${capacity.fleetUtilizationPercent}%`
                  : '—'
              }
            />
            <StatCard label="Bottlenecks" value={String(risk?.bottleneckCount ?? 0)} />
            <StatCard label="Pending actions" value={String(dashboard.pendingActionCount)} />
          </section>
          <p className="page-muted">{dashboard.summary}</p>
          <Panel title="Capacity utilization">
            <dl className="integrations-stats__grid">
              <div>
                <dt>Inventory pressure</dt>
                <dd>
                  {capacity?.inventoryPressureScore != null
                    ? `${capacity.inventoryPressureScore}%`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Cash flow health</dt>
                <dd>
                  {capacity?.cashFlowHealthScore != null ? `${capacity.cashFlowHealthScore}%` : '—'}
                </dd>
              </div>
              <div>
                <dt>Overdue jobs</dt>
                <dd>{risk?.overdueJobCount ?? 0}</dd>
              </div>
              <div>
                <dt>Low stock items</dt>
                <dd>{risk?.lowStockItemCount ?? 0}</dd>
              </div>
            </dl>
          </Panel>
        </>
      ) : null}

      {dashboard && activeTab === 'scenarios' ? (
        <Panel title="Saved scenarios">
          {dashboard.activeScenarios.length === 0 ? (
            <EmptyState
              title="No scenarios yet"
              description="Create scenarios via the API to run what-if analysis against live operational state."
            />
          ) : (
            <ul className="analytics-page__run-list">
              {dashboard.activeScenarios.map((scenario) => (
                <li key={scenario.id}>
                  <strong>{scenario.name}</strong>
                  <span className="page-muted">
                    {' '}
                    · {formatSimulationType(scenario.simulationType)} · {scenario.status}
                  </span>
                  {canWrite ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isWorking}
                      onClick={() => void handleRunSimulation(scenario.id)}
                    >
                      Run simulation
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'simulations' ? (
        <Panel title="Simulation history">
          {dashboard.recentSimulations.length === 0 ? (
            <EmptyState
              title="No simulations yet"
              description="Run a scenario simulation to see projected outcomes."
            />
          ) : (
            <ul className="analytics-page__run-list">
              {dashboard.recentSimulations.map((sim) => (
                <li key={sim.id}>
                  <strong>{sim.scenarioName ?? 'Scenario'}</strong> — {sim.status}
                  {sim.resultSummary ? <p className="page-muted">{sim.resultSummary}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'heatmaps' ? (
        <>
          {canWrite ? (
            <div className="analytics-page__section-header">
              <span className="page-muted">
                Heat maps derived from live jobs, fleet, inventory, and finance data.
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={isWorking}
                onClick={() => void handleCaptureHeatMaps()}
              >
                Refresh heat maps
              </Button>
            </div>
          ) : null}
          <Panel title="Operational heat maps">
            {dashboard.heatMaps.length === 0 ? (
              <EmptyState
                title="No heat maps yet"
                description="Capture heat maps when operational data is available."
              />
            ) : (
              <ul className="analytics-page__run-list">
                {dashboard.heatMaps.map((map) => (
                  <li key={map.id}>
                    <strong>{formatSimulationType(map.heatMapType)}</strong>
                    <span className="page-muted"> · {map.dataPoints.length} data point(s)</span>
                    {map.summary ? <p className="page-muted">{map.summary}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {dashboard && activeTab === 'recommendations' ? (
        <>
          {canWrite ? (
            <div className="analytics-page__section-header">
              <span className="page-muted">
                Recommendations from real operational patterns. No autonomous changes.
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={isWorking}
                onClick={() => void handleGenerateRecommendations()}
              >
                Generate recommendations
              </Button>
            </div>
          ) : null}
          <Panel title="AI decision support">
            {dashboard.recommendations.length === 0 ? (
              <EmptyState
                title="No recommendations yet"
                description="Generate recommendations when operational data exists."
              />
            ) : (
              <ul className="analytics-page__run-list">
                {dashboard.recommendations.map((item) => (
                  <li key={item.id}>
                    <strong>
                      [{item.priority}] {item.title}
                    </strong>
                    <p className="page-muted">{item.recommendation}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {dashboard && activeTab === 'replay' ? (
        <Panel title="Operational replay">
          {dashboard.recentReplayEvents.length === 0 ? (
            <EmptyState
              title="No replay events yet"
              description="Replay events are synced from real job and operational activity."
            />
          ) : (
            <ul className="analytics-page__run-list">
              {dashboard.recentReplayEvents.map((event) => (
                <li key={event.id}>
                  <strong>{event.title}</strong> — {event.eventType.replace(/_/g, ' ')}
                  <span className="page-muted"> · {new Date(event.eventAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
