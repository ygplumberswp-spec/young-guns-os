import { useCallback, useEffect, useState } from 'react';
import { Button } from '@titan/ui';
import type { OperationalReportAudience } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchReportExportPdf,
  type ReportExportKind,
  type ReportPdfPreview,
} from '../../lib/report-export-api';
import { FinanceDocumentPreviewModal } from '../finance/FinanceDocumentPreviewModal';

type ReportExportActionsProps = {
  accessToken: string;
  kind: ReportExportKind;
  resourceId: string;
  audience?: OperationalReportAudience;
  label?: string;
  reportNumber?: string | null;
  disabled?: boolean;
};

export function ReportExportActions({
  accessToken,
  kind,
  resourceId,
  audience = 'internal',
  label,
  reportNumber,
  disabled,
}: ReportExportActionsProps) {
  const [preview, setPreview] = useState<ReportPdfPreview | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportLabel =
    label ??
    (kind === 'job'
      ? 'Job report'
      : kind === 'service'
        ? 'Service report'
        : kind === 'completion'
          ? 'Completion report'
          : 'Maintenance report');

  const loadPdf = useCallback(async () => {
    if (!accessToken || !resourceId) return null;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchReportExportPdf(accessToken, kind, resourceId, audience);
      return result;
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 403) {
          setError('You do not have permission to export this report.');
        } else if (err.status === 404) {
          setError('Report unavailable — job or report data was not found.');
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
  }, [accessToken, audience, kind, resourceId]);

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
    <div className="report-export-actions">
      <div className="report-export-actions__buttons">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || isLoading || !resourceId}
          onClick={() => void handlePreview()}
        >
          {isLoading ? 'Loading…' : 'Preview Report'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || isLoading || !resourceId}
          onClick={() => void handleDownload()}
        >
          Download PDF
        </Button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <FinanceDocumentPreviewModal
        preview={preview}
        pdfUrl={pdfUrl}
        documentLabel={reportLabel}
        documentNumber={reportNumber ?? null}
        isLoading={isLoading}
        error={error}
        onClose={closePreview}
      />
    </div>
  );
}
