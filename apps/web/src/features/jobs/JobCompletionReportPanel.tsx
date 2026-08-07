import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import type {
  CompletionReportPreview,
  CompletionReportSectionId,
  CompletionReportSummary,
} from '@titan/shared';
import { COMPLETION_REPORT_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createCompletionReport,
  fetchCompletionReportPreview,
  fetchCompletionReports,
  generateCompletionReport,
} from '../../lib/completion-report-api';
import { newDocumentClientActionId } from '../documents/utils';

type JobCompletionReportPanelProps = {
  accessToken: string;
  jobId: string;
  canWrite: boolean;
};

function formatStatus(status: CompletionReportSummary['status']): string {
  return COMPLETION_REPORT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function JobCompletionReportPanel({
  accessToken,
  jobId,
  canWrite,
}: JobCompletionReportPanelProps) {
  const [reports, setReports] = useState<CompletionReportSummary[]>([]);
  const [preview, setPreview] = useState<CompletionReportPreview | null>(null);
  const [selected, setSelected] = useState<Set<CompletionReportSectionId>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [rows, nextPreview] = await Promise.all([
      fetchCompletionReports(accessToken, { jobId }),
      fetchCompletionReportPreview(accessToken, jobId),
    ]);
    setReports(rows);
    setPreview(nextPreview);
    setSelected(
      new Set(
        nextPreview.sections
          .filter((section) => section.available && section.defaultIncluded)
          .map((section) => section.sectionId),
      ),
    );
  }, [accessToken, jobId]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
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
  }, [load]);

  const availableCount = useMemo(
    () => preview?.sections.filter((section) => section.available).length ?? 0,
    [preview],
  );

  function toggleSection(sectionId: CompletionReportSectionId, available: boolean) {
    if (!available) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  async function handleCreateAndGenerate() {
    if (!preview) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const includedSections = [...selected];
      const report = await createCompletionReport(accessToken, {
        jobId,
        title: preview.suggestedTitle,
        includedSections,
        clientActionId: newDocumentClientActionId('completion-report'),
      });
      const generated = await generateCompletionReport(accessToken, report.id);
      await load();
      setSuccess(
        `${generated.reportNumber} generated and linked to Documents. Open detail to email via Email Centre.`,
      );
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Unable to create completion report',
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <Panel
      title="Client Completion Report"
      description="Assemble a customer-facing completion report from real job data. Map links only when coordinates exist."
    >
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {isLoading ? (
        <p className="page-muted">Loading completion report options…</p>
      ) : (
        <>
          {preview ? (
            <div className="jobs-completion-report">
              <p className="page-muted">
                {availableCount} section(s) available · Map:{' '}
                {preview.mapAvailability === 'place_url'
                  ? 'Google Maps place link ready'
                  : preview.mapAvailability.replace(/_/g, ' ')}
              </p>
              <ul className="jobs-doc-list">
                {preview.sections.map((section) => (
                  <li key={section.sectionId}>
                    <label className={!section.available ? 'page-muted' : undefined}>
                      <input
                        type="checkbox"
                        disabled={!section.available || !canWrite}
                        checked={selected.has(section.sectionId)}
                        onChange={() => toggleSection(section.sectionId, section.available)}
                      />{' '}
                      {section.label}
                      {!section.available && section.reason ? ` — ${section.reason}` : null}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {reports.length === 0 ? (
            <p className="page-muted">No completion reports for this job yet.</p>
          ) : (
            <ul className="jobs-doc-list">
              {reports.map((report) => (
                <li key={report.id}>
                  <Link
                    href={`/documents/completion-reports/${report.id}`}
                    className="jobs-link"
                  >
                    {report.reportNumber} — {report.title}
                  </Link>{' '}
                  <span className="page-muted">{formatStatus(report.status)}</span>
                </li>
              ))}
            </ul>
          )}

          {canWrite ? (
            <div className="jobs-form__actions">
              <Button
                variant="secondary"
                disabled={isWorking || selected.size === 0}
                onClick={() => void handleCreateAndGenerate()}
              >
                {isWorking ? 'Generating…' : 'Generate completion report'}
              </Button>
              <Link href="/documents/completion-reports" className="jobs-link">
                View all reports
              </Link>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
