import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Input, LoadingState, Panel, StatCard } from '@titan/ui';
import {
  formatMoney,
  type QualityActionSummary,
  type QualityComebackSummary,
  type QualityExecutiveDashboard,
  type QualitySupplierIntelligence,
  type QualityTechnicianIntelligence,
  type QualityWarrantyClaimSummary,
} from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import {
  QualityApiClientError,
  createQualityAction,
  createQualityComeback,
  fetchQualityActions,
  fetchQualityComebacks,
  fetchQualityDashboard,
  fetchQualitySupplierIntelligence,
  fetchQualityTechnicianIntelligence,
  fetchQualityWarrantyClaims,
} from '../../lib/quality-api-client';

type QualityTab = 'dashboard' | 'comebacks' | 'warranty' | 'technicians' | 'suppliers' | 'actions';

function canAccessQuality(permissions: string[]) {
  return (
    permissions.includes('quality:read') ||
    permissions.includes('quality:write') ||
    permissions.includes('executive:read') ||
    permissions.includes('*')
  );
}

function canWriteQuality(permissions: string[]) {
  return (
    permissions.includes('quality:write') ||
    permissions.includes('executive:write') ||
    permissions.includes('*')
  );
}

export function QualityPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<QualityTab>('dashboard');
  const [dashboard, setDashboard] = useState<QualityExecutiveDashboard | null>(null);
  const [comebacks, setComebacks] = useState<QualityComebackSummary[]>([]);
  const [warrantyClaims, setWarrantyClaims] = useState<QualityWarrantyClaimSummary[]>([]);
  const [technicianIntel, setTechnicianIntel] = useState<QualityTechnicianIntelligence | null>(
    null,
  );
  const [supplierIntel, setSupplierIntel] = useState<QualitySupplierIntelligence | null>(null);
  const [actions, setActions] = useState<QualityActionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [originalJobId, setOriginalJobId] = useState('');
  const [comebackReason, setComebackReason] = useState('');
  const [actionSubject, setActionSubject] = useState('');
  const [actionRecommendation, setActionRecommendation] = useState('');

  const canView = useMemo(() => (user ? canAccessQuality(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canWriteQuality(user.permissions) : false), [user]);

  async function loadPage() {
    if (!accessToken) return;

    const [dashboardData, comebackRows, warrantyRows, technicianData, supplierData, actionRows] =
      await Promise.all([
        fetchQualityDashboard(accessToken),
        fetchQualityComebacks(accessToken),
        fetchQualityWarrantyClaims(accessToken),
        fetchQualityTechnicianIntelligence(accessToken),
        fetchQualitySupplierIntelligence(accessToken),
        fetchQualityActions(accessToken),
      ]);

    setDashboard(dashboardData);
    setComebacks(comebackRows);
    setWarrantyClaims(warrantyRows);
    setTechnicianIntel(technicianData);
    setSupplierIntel(supplierData);
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
            err instanceof QualityApiClientError ? err.message : 'Unable to load quality data',
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

  async function handleCreateComeback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !originalJobId.trim() || !comebackReason.trim()) return;

    setError(null);
    setSuccess(null);

    try {
      await createQualityComeback(accessToken, {
        comebackType: 'callback',
        originalJobId: originalJobId.trim(),
        reason: comebackReason.trim(),
      });
      setOriginalJobId('');
      setComebackReason('');
      setSuccess('Comeback recorded.');
      await loadPage();
    } catch (err) {
      setError(err instanceof QualityApiClientError ? err.message : 'Unable to create comeback');
    }
  }

  async function handleCreateAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !actionSubject.trim() || !actionRecommendation.trim()) return;

    setError(null);
    setSuccess(null);

    try {
      await createQualityAction(accessToken, {
        actionType: 'coaching',
        subject: actionSubject.trim(),
        recommendation: actionRecommendation.trim(),
      });
      setActionSubject('');
      setActionRecommendation('');
      setSuccess('Quality action drafted for approval.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof QualityApiClientError ? err.message : 'Unable to create quality action',
      );
    }
  }

  if (!canView) {
    return (
      <EmptyState
        title="Quality access required"
        description="You need quality or executive permissions to view this department."
      />
    );
  }

  const tabs: Array<{ id: QualityTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'comebacks', label: 'Comebacks' },
    { id: 'warranty', label: 'Warranty' },
    { id: 'technicians', label: 'Technicians' },
    { id: 'suppliers', label: 'Suppliers' },
    { id: 'actions', label: 'Actions' },
  ];

  return (
    <div className="portal-page">
      <PageHeader
        title="Quality Assurance"
        description="Comeback intelligence, root cause analysis, and technician accountability — all from real tenant data."
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

      {isLoading && !dashboard ? <LoadingState label="Loading quality intelligence…" /> : null}

      {activeTab === 'dashboard' && dashboard ? (
        <>
          <div className="stat-grid">
            <StatCard
              label="Comeback cost"
              value={formatMoney(dashboard.comebackCostCents, dashboard.currency)}
            />
            <StatCard
              label="Warranty cost"
              value={formatMoney(dashboard.warrantyCostCents, dashboard.currency)}
            />
            <StatCard
              label="First-time fix rate"
              value={
                dashboard.firstTimeFixRatePercent != null
                  ? `${dashboard.firstTimeFixRatePercent}%`
                  : 'N/A'
              }
            />
            <StatCard label="Open comebacks" value={String(dashboard.openComebackCount)} />
            <StatCard label="Open warranty claims" value={String(dashboard.openWarrantyCount)} />
            <StatCard
              label="Monthly quality score"
              value={
                dashboard.monthlyQualityScore != null
                  ? String(dashboard.monthlyQualityScore)
                  : 'N/A'
              }
            />
          </div>

          <div className="portal-grid">
            <Panel title="Technician rankings">
              {dashboard.technicianRankings.length === 0 ? (
                <p className="page-muted">No technician quality scores yet.</p>
              ) : (
                <ul className="portal-list">
                  {dashboard.technicianRankings.map((row) => (
                    <li key={row.technicianId}>
                      <strong>{row.name}</strong>
                      <span>Score: {row.qualityScore ?? 'N/A'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Common failure reasons">
              {dashboard.commonFailureReasons.length === 0 ? (
                <p className="page-muted">No root cause classifications recorded.</p>
              ) : (
                <ul className="portal-list">
                  {dashboard.commonFailureReasons.map((row) => (
                    <li key={row.cause}>
                      <strong>{row.cause.replaceAll('_', ' ')}</strong>
                      <span>{row.count} occurrence(s)</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Branch rankings">
              {dashboard.branchRankings.length === 0 ? (
                <p className="page-muted">No branch comeback data yet.</p>
              ) : (
                <ul className="portal-list">
                  {dashboard.branchRankings.map((row) => (
                    <li key={row.branchKey}>
                      <strong>{row.branchKey}</strong>
                      <span>
                        {row.comebackCount} comeback(s) ·{' '}
                        {formatMoney(row.costCents, dashboard.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Supplier rankings">
              {dashboard.supplierRankings.length === 0 ? (
                <p className="page-muted">No supplier defect data yet.</p>
              ) : (
                <ul className="portal-list">
                  {dashboard.supplierRankings.map((row) => (
                    <li key={row.supplierId}>
                      <strong>{row.name}</strong>
                      <span>{row.defectCount} defect(s)</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      ) : null}

      {activeTab === 'comebacks' ? (
        <>
          {canWrite ? (
            <Panel
              title="Record comeback"
              description="Links to a real job — no demo records are created."
            >
              <form className="form-grid" onSubmit={(event) => void handleCreateComeback(event)}>
                <Input
                  label="Original job ID"
                  value={originalJobId}
                  onChange={(event) => setOriginalJobId(event.target.value)}
                  required
                />
                <Input
                  label="Reason"
                  value={comebackReason}
                  onChange={(event) => setComebackReason(event.target.value)}
                  required
                />
                <Button type="submit">Record comeback</Button>
              </form>
            </Panel>
          ) : null}

          <Panel title="Comeback history">
            {comebacks.length === 0 ? (
              <EmptyState
                title="No comebacks"
                description="Comebacks appear when recorded against real jobs."
              />
            ) : (
              <ul className="portal-list">
                {comebacks.map((comeback) => (
                  <li key={comeback.id}>
                    <strong>{comeback.originalJobTitle ?? comeback.originalJobId}</strong>
                    <span>
                      {comeback.comebackType} · {comeback.status} · {comeback.customerName}
                    </span>
                    <span>{comeback.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {activeTab === 'warranty' ? (
        <Panel title="Warranty claims">
          {warrantyClaims.length === 0 ? (
            <EmptyState
              title="No warranty claims"
              description="Warranty claims appear when recorded against real jobs."
            />
          ) : (
            <ul className="portal-list">
              {warrantyClaims.map((claim) => (
                <li key={claim.id}>
                  <strong>{claim.jobTitle ?? claim.jobId}</strong>
                  <span>
                    {claim.status} · {claim.customerName}
                  </span>
                  <span>{claim.description}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'technicians' && technicianIntel ? (
        <Panel title="Technician quality intelligence">
          {technicianIntel.technicians.length === 0 ? (
            <EmptyState
              title="No technician scores"
              description="Scores are calculated from real job and comeback data."
            />
          ) : (
            <ul className="portal-list">
              {technicianIntel.technicians.map((tech) => (
                <li key={tech.technicianId}>
                  <strong>{tech.technicianName}</strong>
                  <span>
                    FTFR: {tech.firstTimeFixRatePercent ?? 'N/A'}% · Comeback rate:{' '}
                    {tech.comebackRatePercent ?? 'N/A'}% · Warranty rate:{' '}
                    {tech.warrantyRatePercent ?? 'N/A'}%
                  </span>
                  <span>
                    Jobs: {tech.completedJobCount} · Comebacks: {tech.comebackCount} · Repeat
                    failures: {tech.repeatFailureCount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'suppliers' && supplierIntel ? (
        <Panel title="Supplier quality intelligence">
          {supplierIntel.defects.length === 0 ? (
            <EmptyState
              title="No supplier defects"
              description="Defect records appear when logged against real inventory."
            />
          ) : (
            <ul className="portal-list">
              {supplierIntel.defects.map((defect) => (
                <li key={defect.id}>
                  <strong>{defect.supplierName ?? 'Unknown supplier'}</strong>
                  <span>
                    {defect.itemName ?? 'Unknown item'} ·{' '}
                    {defect.isRecurring ? 'Recurring' : 'Single'}
                  </span>
                  <span>{defect.defectDescription}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'actions' ? (
        <>
          {canWrite ? (
            <Panel
              title="Draft quality action"
              description="Draft → Approval → Execution. No automatic penalties."
            >
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
              <EmptyState
                title="No quality actions"
                description="Actions are drafted for manager approval."
              />
            ) : (
              <ul className="portal-list">
                {actions.map((action) => (
                  <li key={action.id}>
                    <strong>{action.subject}</strong>
                    <span>
                      {action.actionType} · {action.status}
                      {action.technicianName ? ` · ${action.technicianName}` : ''}
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
