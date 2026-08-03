import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, LoadingState, Panel } from '@titan/ui';
import type { CompletionReportDetail, CompletionReportSectionId } from '@titan/shared';
import {
  COMPLETION_REPORT_SECTION_OPTIONS,
  COMPLETION_REPORT_STATUS_OPTIONS,
  canEditCompletionReport,
  nextCompletionReportAction,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { ApiClientError } from '../../lib/api-client';
import {
  addCompletionReportTimelineNote,
  cancelCompletionReport,
  fetchCompletionReport,
  generateCompletionReport,
  markCompletionReportReady,
  prepareCompletionReportEmail,
  updateCompletionReport,
} from '../../lib/completion-report-api';
import { useAuth } from '../../lib/auth-context';
import { DocumentsNav } from '../../features/documents/DocumentsNav';
import { canAccessDocuments, canManageDocuments } from '../../features/documents/utils';

function formatStatus(status: CompletionReportDetail['status']): string {
  return COMPLETION_REPORT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function CompletionReportDetailPage() {
  const [, params] = useRoute('/documents/completion-reports/:id');
  const reportId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const [report, setReport] = useState<CompletionReportDetail | null>(null);
  const [selected, setSelected] = useState<Set<CompletionReportSectionId>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessDocuments(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageDocuments(user.permissions) : false), [user]);

  const load = useCallback(async () => {
    if (!accessToken || !reportId) return;
    const data = await fetchCompletionReport(accessToken, reportId);
    setReport(data);
    setSelected(new Set(data.includedSections));
  }, [accessToken, reportId]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !reportId || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        await load();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load completion report',
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
  }, [accessToken, canView, load, reportId]);

  const approvalAction = report ? nextCompletionReportAction(report.status) : null;
  const editable = report ? canEditCompletionReport(report) : false;

  async function runAction(action: () => Promise<unknown>, okMessage: string) {
    if (!accessToken || !report) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await load();
      setSuccess(okMessage);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setIsWorking(false);
    }
  }

  function toggleSection(sectionId: CompletionReportSectionId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  if (!canView) {
    return (
      <div className="page">
        <PageHeader title="Completion Report" />
        <p className="form-error">You do not have permission to view documents.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page">
        <PageHeader title="Completion Report" />
        <LoadingState label="Loading completion report…" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="page">
        <PageHeader title="Completion Report" />
        <DocumentsNav />
        <p className="form-error">{error ?? 'Completion report not found'}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={report.title}
        description={`${report.reportNumber} · ${formatStatus(report.status)}`}
      />
      <DocumentsNav />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Links">
        <ul className="documents-list">
          <li>
            Job:{' '}
            <Link href={`/jobs/${report.jobId}`} className="documents-link">
              {report.jobTitle ?? report.jobId}
            </Link>
          </li>
          <li>
            Customer:{' '}
            <Link href={`/crm/${report.customerId}`} className="documents-link">
              {report.customerName ?? report.customerId}
            </Link>
          </li>
          {report.invoiceId ? (
            <li>
              Invoice:{' '}
              <Link href={`/finance/invoices/${report.invoiceId}`} className="documents-link">
                {report.invoiceId}
              </Link>
            </li>
          ) : null}
          {report.documentId ? (
            <li>
              Document:{' '}
              <Link href={`/documents/${report.documentId}`} className="documents-link">
                {report.documentId}
              </Link>
            </li>
          ) : null}
          {report.emailDraftId ? (
            <li>
              Email draft: <Link href="/email-centre">Email Centre</Link> ({report.emailDraftId})
            </li>
          ) : null}
        </ul>
        <p className="page-muted">{report.deliveryNote}</p>
        <p className="page-muted">
          Map: {report.mapAvailability.replace(/_/g, ' ')}
          {report.mapPlaceUrl ? (
            <>
              {' '}
              ·{' '}
              <a href={report.mapPlaceUrl} target="_blank" rel="noreferrer">
                Open Google Maps
              </a>
            </>
          ) : null}
        </p>
      </Panel>

      <Panel title="Sections">
        <ul className="jobs-doc-list">
          {COMPLETION_REPORT_SECTION_OPTIONS.map((option) => (
            <li key={option.value}>
              <label>
                <input
                  type="checkbox"
                  disabled={!canWrite || !editable}
                  checked={selected.has(option.value)}
                  onChange={() => toggleSection(option.value)}
                />{' '}
                {option.label}
              </label>
            </li>
          ))}
        </ul>
        {canWrite && editable ? (
          <div className="jobs-form__actions">
            <Button
              variant="secondary"
              disabled={isWorking || selected.size === 0}
              onClick={() =>
                void runAction(
                  () =>
                    updateCompletionReport(accessToken!, report.id, {
                      includedSections: [...selected],
                    }),
                  'Sections updated — regenerate to refresh HTML/document.',
                )
              }
            >
              Save sections
            </Button>
          </div>
        ) : null}
      </Panel>

      {report.htmlBody ? (
        <Panel title="Preview">
          <iframe
            title="Completion report preview"
            className="completion-report-preview"
            srcDoc={report.htmlBody}
            style={{ width: '100%', minHeight: 480, border: '1px solid #ccc', background: '#fff' }}
          />
        </Panel>
      ) : null}

      {canWrite ? (
        <Panel title="Actions">
          <div className="jobs-form__actions">
            {approvalAction?.nextStatus === 'generated' || report.status === 'draft' ? (
              <Button
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => generateCompletionReport(accessToken!, report.id),
                    'Report generated and Documents record updated.',
                  )
                }
              >
                Generate
              </Button>
            ) : null}
            {report.status === 'generated' ? (
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => markCompletionReportReady(accessToken!, report.id),
                    'Marked ready to send.',
                  )
                }
              >
                Mark ready to send
              </Button>
            ) : null}
            {report.documentId ? (
              <>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => prepareCompletionReportEmail(accessToken!, report.id),
                      'Email Centre draft prepared (approve → execute). Not auto-sent.',
                    )
                  }
                >
                  Prepare Email Centre draft
                </Button>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => addCompletionReportTimelineNote(accessToken!, report.id),
                      'Communication Timeline note added with report attachment link.',
                    )
                  }
                >
                  Add timeline note
                </Button>
              </>
            ) : null}
            {report.status !== 'cancelled' && report.status !== 'sent' ? (
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => cancelCompletionReport(accessToken!, report.id),
                    'Report cancelled.',
                  )
                }
              >
                Cancel
              </Button>
            ) : null}
          </div>
          <p className="page-muted">
            Outbound email uses Email Centre Gmail draft → approve → execute. Resend stays
            transactional-only. If Gmail is not configured, prepare-email returns an honest error.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
