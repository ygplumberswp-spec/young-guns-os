import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel } from '@titan/ui';
import type { WiManagerWorkspaceSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  approveLeaveApplication,
  approveTimesheet,
  fetchManagerWorkspace,
} from '../../lib/enterprise-workforce-intelligence-api-client';
import { useAuth } from '../../lib/auth-context';
import { canManageWorkforceIntelligence } from '../../features/workforce-intelligence/utils';

export function ManagerWorkspacePage() {
  const { accessToken, user } = useAuth();
  const [workspace, setWorkspace] = useState<WiManagerWorkspaceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const canManage = useMemo(
    () => (user ? canManageWorkforceIntelligence(user.permissions) : false),
    [user],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canManage) {
        setIsLoading(false);
        return;
      }
      try {
        const data = (await fetchManagerWorkspace(accessToken)) as WiManagerWorkspaceSummary;
        if (!cancelled) setWorkspace(data);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load manager workspace',
          );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canManage]);

  async function reload() {
    if (!accessToken) return;
    const data = (await fetchManagerWorkspace(accessToken)) as WiManagerWorkspaceSummary;
    setWorkspace(data);
  }

  async function runApproval(action: () => Promise<unknown>, message: string) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await reload();
      setSuccess(message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setIsWorking(false);
    }
  }

  if (!canManage) {
    return (
      <div className="automation-page">
        <PageHeader
          title="Manager Workspace"
          description="You do not have permission to access the manager workspace."
        />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="Manager Workspace"
        description="Approve timesheets and leave, review team performance and compliance."
        actions={
          <Link href="/workforce-intelligence">
            <Button variant="secondary">Workforce Intelligence</Button>
          </Link>
        }
      />

      {isLoading ? <p>Loading manager workspace...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {workspace ? (
        <>
          <Panel title="Team Overview" description={`${workspace.teamMemberCount} team member(s)`}>
            <p>Review pending approvals and compliance risks below.</p>
          </Panel>

          <Panel title="Pending Timesheet Approvals">
            {workspace.pendingTimesheetApprovals.length === 0 ? (
              <EmptyState
                title="No pending timesheets"
                description="Submitted timesheets awaiting approval appear here."
              />
            ) : (
              <ul className="simple-list">
                {workspace.pendingTimesheetApprovals.map((ts) => (
                  <li key={ts.id}>
                    {ts.userName}: {ts.periodStart} – {ts.periodEnd}
                    <Button
                      variant="secondary"
                      disabled={isWorking}
                      onClick={() =>
                        void runApproval(
                          () => approveTimesheet(accessToken!, ts.id),
                          'Timesheet approved.',
                        )
                      }
                    >
                      Approve
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Pending Leave Approvals">
            {workspace.pendingLeaveApprovals.length === 0 ? (
              <EmptyState
                title="No pending leave"
                description="Leave requests awaiting approval appear here."
              />
            ) : (
              <ul className="simple-list">
                {workspace.pendingLeaveApprovals.map((leave) => (
                  <li key={leave.id}>
                    {leave.userName}: {leave.categoryName} {leave.startDate} – {leave.endDate}
                    <Button
                      variant="secondary"
                      disabled={isWorking}
                      onClick={() =>
                        void runApproval(
                          () => approveLeaveApplication(accessToken!, leave.id),
                          'Leave approved.',
                        )
                      }
                    >
                      Approve
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Team Performance">
            {workspace.teamPerformance.length === 0 ? (
              <EmptyState
                title="No performance data"
                description="Capture performance from real job completion data."
              />
            ) : (
              <ul className="simple-list">
                {workspace.teamPerformance.map((perf) => (
                  <li key={perf.userId}>{perf.summary}</li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Compliance Risks">
            {workspace.complianceRisks.length === 0 ? (
              <EmptyState
                title="No certification risks"
                description="Expiring certifications appear here."
              />
            ) : (
              <ul className="simple-list">
                {workspace.complianceRisks.map((cert) => (
                  <li key={cert.id}>
                    {cert.name} — expires {cert.expiresAt ?? 'unknown'}
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
