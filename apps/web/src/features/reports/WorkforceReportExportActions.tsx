import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import {
  defaultWorkforcePeriod,
  fetchWorkforceReportPdf,
  workforceReportKindLabel,
  type WorkforceReportExportKind,
  type WorkforceReportExportTarget,
  type WorkforceReportPdfPreview,
} from '../../lib/workforce-report-export-api';
import { FinanceDocumentPreviewModal } from '../finance/FinanceDocumentPreviewModal';

type WorkforceReportExportActionsProps = {
  accessToken: string;
  kind: WorkforceReportExportKind;
  target: WorkforceReportExportTarget;
  disabled?: boolean;
};

export function WorkforceReportExportActions({
  accessToken,
  kind,
  target,
  disabled,
}: WorkforceReportExportActionsProps) {
  const initialPeriod = useMemo(() => defaultWorkforcePeriod(), []);
  const [periodStart, setPeriodStart] = useState(initialPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.periodEnd);
  const [preview, setPreview] = useState<WorkforceReportPdfPreview | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportLabel = workforceReportKindLabel(kind);

  const loadPdf = useCallback(async () => {
    if (!accessToken) return null;
    setIsLoading(true);
    setError(null);
    try {
      return await fetchWorkforceReportPdf(accessToken, kind, target, {
        periodStart,
        periodEnd,
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 403) {
          setError('You do not have permission to export this workforce report.');
        } else if (err.status === 404) {
          setError('Report unavailable.');
        } else if (err.status === 400) {
          setError(err.message || 'Invalid reporting period.');
        } else if (err.status === 503) {
          setError('PDF renderer is unavailable. Try again later.');
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Unable to export report');
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, kind, periodEnd, periodStart, target]);

  useEffect(() => {
    if (!preview?.blob) {
      setPdfUrl(null);
      return;
    }
    const url = URL.createObjectURL(preview.blob);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);

  async function handlePreview() {
    const result = await loadPdf();
    if (result) setPreview(result);
  }

  async function handleDownload() {
    const result = preview ?? (await loadPdf());
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function closePreview() {
    setPreview(null);
    setError(null);
  }

  return (
    <div className="workforce-report-export-actions">
      <div className="workforce-report-export-actions__period">
        <label htmlFor={`wf-period-start-${kind}`}>Period start</label>
        <input
          id={`wf-period-start-${kind}`}
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          disabled={disabled || isLoading}
        />
        <label htmlFor={`wf-period-end-${kind}`}>Period end</label>
        <input
          id={`wf-period-end-${kind}`}
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          disabled={disabled || isLoading}
        />
      </div>
      <div className="workforce-report-export-actions__buttons">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || isLoading}
          onClick={() => void handlePreview()}
        >
          {isLoading ? 'Loading…' : `Preview ${reportLabel}`}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || isLoading}
          onClick={() => void handleDownload()}
        >
          Download PDF
        </Button>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <FinanceDocumentPreviewModal
        preview={preview}
        pdfUrl={pdfUrl}
        documentLabel={reportLabel}
        documentNumber={null}
        isLoading={isLoading}
        error={error}
        onClose={closePreview}
      />
    </div>
  );
}
