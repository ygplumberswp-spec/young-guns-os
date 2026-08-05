import { PageHeader } from '../../components/ux';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import { EmptyState, LoadingState, Panel } from '@titan/ui';
import type { PortalJobTrackingDetail } from '@titan/shared';
import { PortalApiClientError, fetchPortalJob } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';
import { toPortalNestedHref } from '../../lib/portal-routing';
import { formatPortalWhen } from '../../lib/portal-datetime';
import { ReportExportActions } from '../../features/reports/ReportExportActions';
import { ExtendedReportExportActions } from '../../features/reports/ExtendedReportExportActions';

export function PortalJobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const { accessToken } = usePortalAuth();
  const [detail, setDetail] = useState<PortalJobTrackingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken || !jobId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchPortalJob(accessToken, jobId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof PortalApiClientError ? err.message : 'Unable to load job');
          setDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, jobId]);

  const etaLabel = formatPortalWhen(detail?.liveTracking?.etaAt ?? detail?.job.etaAt ?? null);
  const scheduledLabel = formatPortalWhen(detail?.job.scheduledAt ?? null);

  return (
    <div className="portal-page">
      <PageHeader
        title={detail?.job.title ?? 'Job details'}
        description="Live status, ETA, and updates for this job."
        actions={
          <Link href={toPortalNestedHref('/my/jobs')} className="auth-text-link">
            Back to jobs
          </Link>
        }
      />
      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <LoadingState label="Loading Job…" /> : null}
      {!loading && !error && !detail ? (
        <EmptyState title="Job Not Found" description="This job is not available on your account." />
      ) : null}

      {detail ? (
        <>
          <Panel title="Status">
            <ul className="portal-list">
              <li>
                <strong>Status</strong>
                <span>{detail.job.status.replace(/_/g, ' ')}</span>
              </li>
              {detail.job.jobNumber ? (
                <li>
                  <strong>Job number</strong>
                  <span className="tabular-nums">{detail.job.jobNumber}</span>
                </li>
              ) : null}
              {detail.job.addressDisplay ? (
                <li>
                  <strong>Site</strong>
                  <span>{detail.job.addressDisplay}</span>
                </li>
              ) : null}
              {detail.job.assignedUserName ? (
                <li>
                  <strong>Technician</strong>
                  <span>{detail.job.assignedUserName}</span>
                </li>
              ) : null}
              {scheduledLabel ? (
                <li>
                  <strong>Scheduled</strong>
                  <span className="tabular-nums">{scheduledLabel}</span>
                </li>
              ) : null}
            </ul>
          </Panel>

          <Panel title="Technician ETA">
            {etaLabel ? (
              <div className="portal-eta">
                <p className="portal-eta__value tabular-nums">{etaLabel}</p>
                <p className="portal-eta__hint">
                  {detail.liveTracking
                    ? `${detail.liveTracking.technicianDisplayName} is en route.`
                    : 'Estimated from your scheduled appointment window.'}
                </p>
                {detail.liveTracking?.progressPercent != null ? (
                  <p className="page-muted tabular-nums">
                    Progress {detail.liveTracking.progressPercent}%
                  </p>
                ) : null}
              </div>
            ) : (
              <EmptyState
                className="titan-empty-state--compact"
                title="ETA Not Available Yet"
                description="An ETA appears when your job is scheduled or your technician is en route."
              />
            )}
          </Panel>

          {detail.job.description ? (
            <Panel title="Job Notes">
              <p className="page-muted">{detail.job.description}</p>
            </Panel>
          ) : null}

          <Panel title="Timeline">
            {detail.timeline.length === 0 ? (
              <EmptyState
                className="titan-empty-state--compact"
                title="No Timeline Events"
                description="Status updates for this job will appear here."
              />
            ) : (
              <ul className="portal-list">
                {detail.timeline.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.title}</strong>
                    <span className="tabular-nums">{formatPortalWhen(entry.occurredAt)}</span>
                    {entry.description ? <span>{entry.description}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Reports">
            {accessToken && jobId ? (
              <>
                <ReportExportActions
                  accessToken={accessToken}
                  kind="job"
                  resourceId={jobId}
                  channel="portal"
                  label="Job report"
                  reportNumber={detail.job.jobNumber}
                />
                <ExtendedReportExportActions
                  accessToken={accessToken}
                  kind="inspection"
                  target={{ scope: 'job', jobId }}
                  channel="portal"
                />
                <ExtendedReportExportActions
                  accessToken={accessToken}
                  kind="compliance_coc_support"
                  target={{ scope: 'job', jobId }}
                  channel="portal"
                />
              </>
            ) : null}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
