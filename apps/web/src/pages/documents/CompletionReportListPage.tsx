import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { LoadingState, Panel } from '@titan/ui';
import type { CompletionReportSummary } from '@titan/shared';
import { COMPLETION_REPORT_STATUS_OPTIONS } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { ApiClientError } from '../../lib/api-client';
import { fetchCompletionReports } from '../../lib/completion-report-api';
import { useAuth } from '../../lib/auth-context';
import { DocumentsNav } from '../../features/documents/DocumentsNav';
import { canAccessDocuments } from '../../features/documents/utils';

function formatStatus(status: CompletionReportSummary['status']): string {
  return COMPLETION_REPORT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function CompletionReportListPage() {
  const { accessToken, user } = useAuth();
  const [reports, setReports] = useState<CompletionReportSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canView = useMemo(() => (user ? canAccessDocuments(user.permissions) : false), [user]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const rows = await fetchCompletionReports(accessToken);
    setReports(rows);
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        await load();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load completion reports',
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
  }, [accessToken, canView, load]);

  if (!canView) {
    return (
      <div className="page">
        <PageHeader title="Completion Reports" />
        <p className="form-error">You do not have permission to view documents.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Completion Reports"
        description="Customer-facing job completion reports linked to Documents, Jobs, and Email Centre."
      />
      <DocumentsNav />
      {error ? <p className="form-error">{error}</p> : null}
      {isLoading ? (
        <LoadingState label="Loading completion reports…" />
      ) : (
        <Panel title="Reports">
          {reports.length === 0 ? (
            <p className="page-muted">
              No completion reports yet. Generate one from a Job 360 Documents tab.
            </p>
          ) : (
            <ul className="documents-list">
              {reports.map((report) => (
                <li key={report.id}>
                  <Link
                    href={`/documents/completion-reports/${report.id}`}
                    className="documents-link"
                  >
                    {report.reportNumber} — {report.title}
                  </Link>
                  <span className="page-muted">
                    {' '}
                    {formatStatus(report.status)}
                    {report.customerName ? ` · ${report.customerName}` : ''}
                    {report.jobTitle ? ` · ${report.jobTitle}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
