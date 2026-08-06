import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import {
  defaultExtendedPeriod,
  fetchExtendedReportPdf,
  extendedReportKindLabel,
  type ExtendedReportExportChannel,
  type ExtendedReportExportKind,
  type ExtendedReportExportTarget,
  type ExtendedReportPdfPreview,
} from '../../lib/extended-report-export-api';
import { FinanceDocumentPreviewModal } from '../finance/FinanceDocumentPreviewModal';

type ExtendedReportExportActionsProps = {
  accessToken: string;
  kind: ExtendedReportExportKind;
  target: ExtendedReportExportTarget;
  channel?: ExtendedReportExportChannel;
  disabled?: boolean;
  showStatusFilter?: boolean;
};

export function ExtendedReportExportActions({
  accessToken,
  kind,
  target,
  channel = 'staff',
  disabled,
  showStatusFilter = false,
}: ExtendedReportExportActionsProps) {
  const initialPeriod = useMemo(() => defaultExtendedPeriod(), []);
  const [periodStart, setPeriodStart] = useState(initialPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.periodEnd);
  const [statusFilter, setStatusFilter] = useState('');
  const [preview, setPreview] = useState<ExtendedReportPdfPreview | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportLabel = extendedReportKindLabel(kind);
  const needsPeriod = kind !== 'inspection' && kind !== 'compliance_coc_support';

  const loadPdf = useCallback(async () => {
    if (!accessToken) return null;
    setIsLoading(true);
    setError(null);
    try {
      return await fetchExtendedReportPdf(accessToken, kind, target, {
        channel,
        periodStart: needsPeriod ? periodStart : undefined,
        periodEnd: needsPeriod ? periodEnd : undefined,
        statusFilter: showStatusFilter ? statusFilter : undefined,
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 403) {
          setError('You do not have permission to export this report.');
        } else if (err.status === 404) {
          setError('Report unavailable.');
        } else if (err.status === 400) {
          setError(err.message || 'Invalid report parameters.');
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
  }, [accessToken, channel, kind, needsPeriod, periodEnd, periodStart, showStatusFilter, statusFilter, target]);

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
    <div className="extended-report-export-actions">
      {needsPeriod ? (
        <div className="extended-report-export-actions__period">
          <label htmlFor={`ext-period-start-${kind}`}>Period start</label>
          <input
            id={`ext-period-start-${kind}`}
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            disabled={disabled || isLoading}
          />
          <label htmlFor={`ext-period-end-${kind}`}>Period end</label>
          <input
            id={`ext-period-end-${kind}`}
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            disabled={disabled || isLoading}
          />
          {showStatusFilter ? (
            <>
              <label htmlFor={`ext-status-${kind}`}>Status filter</label>
              <input
                id={`ext-status-${kind}`}
                type="text"
                value={statusFilter}
                placeholder="Optional workflow status"
                onChange={(e) => setStatusFilter(e.target.value)}
                disabled={disabled || isLoading}
              />
            </>
          ) : null}
        </div>
      ) : null}
      <div className="extended-report-export-actions__buttons">
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
