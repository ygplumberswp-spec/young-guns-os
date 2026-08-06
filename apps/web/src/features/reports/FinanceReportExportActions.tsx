import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import {
  defaultFinancePeriod,
  fetchFinanceReportPdf,
  financeReportKindLabel,
  type FinanceReportExportChannel,
  type FinanceReportExportKind,
  type FinanceReportExportTarget,
  type FinanceReportPdfPreview,
} from '../../lib/finance-report-export-api';
import { FinanceDocumentPreviewModal } from '../finance/FinanceDocumentPreviewModal';

type FinanceReportExportActionsProps = {
  accessToken: string;
  kind: FinanceReportExportKind;
  target?: FinanceReportExportTarget;
  channel?: FinanceReportExportChannel;
  disabled?: boolean;
  showSnapshotDate?: boolean;
};

export function FinanceReportExportActions({
  accessToken,
  kind,
  target = { scope: 'tenant' },
  channel = 'staff',
  disabled,
  showSnapshotDate = false,
}: FinanceReportExportActionsProps) {
  const initialPeriod = useMemo(() => defaultFinancePeriod(), []);
  const [periodStart, setPeriodStart] = useState(initialPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.periodEnd);
  const [snapshotDate, setSnapshotDate] = useState(initialPeriod.periodEnd);
  const [preview, setPreview] = useState<FinanceReportPdfPreview | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportLabel = financeReportKindLabel(kind);

  const loadPdf = useCallback(async () => {
    if (!accessToken) return null;
    setIsLoading(true);
    setError(null);
    try {
      return await fetchFinanceReportPdf(accessToken, kind, target, {
        channel,
        periodStart,
        periodEnd,
        snapshotDate,
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 403) {
          setError('You do not have permission to export this finance report.');
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
  }, [accessToken, channel, kind, periodEnd, periodStart, snapshotDate, target]);

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
    <div className="finance-report-export-actions">
      <div className="finance-report-export-actions__period">
        {showSnapshotDate ? (
          <>
            <label htmlFor={`fin-snapshot-${kind}`}>Snapshot date</label>
            <input
              id={`fin-snapshot-${kind}`}
              type="date"
              value={snapshotDate}
              onChange={(e) => setSnapshotDate(e.target.value)}
              disabled={disabled || isLoading}
            />
          </>
        ) : (
          <>
            <label htmlFor={`fin-period-start-${kind}`}>Period start</label>
            <input
              id={`fin-period-start-${kind}`}
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              disabled={disabled || isLoading}
            />
            <label htmlFor={`fin-period-end-${kind}`}>Period end</label>
            <input
              id={`fin-period-end-${kind}`}
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              disabled={disabled || isLoading}
            />
          </>
        )}
      </div>
      <div className="finance-report-export-actions__buttons">
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
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
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
