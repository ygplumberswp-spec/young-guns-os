import { useCallback, useEffect, useState } from 'react';
import { Button } from '@titan/ui';
import type { FinanceDocumentPdfPreview } from '../../lib/finance-api';
import '../../styles/finance-document-preview.css';

type FinanceDocumentPreviewModalProps = {
  preview: FinanceDocumentPdfPreview | null;
  pdfUrl: string | null;
  documentLabel: string | null;
  documentNumber: string | null;
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
};

export function FinanceDocumentPreviewModal({
  preview,
  pdfUrl,
  documentLabel,
  documentNumber,
  isLoading,
  error,
  onClose,
}: FinanceDocumentPreviewModalProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    setDownloadError(null);
  }, [preview]);

  const handleDownload = useCallback(() => {
    if (!preview) return;
    setDownloadError(null);
    try {
      const url = URL.createObjectURL(preview.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = preview.filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Unable to download PDF');
    }
  }, [preview]);

  if (!preview && !pdfUrl && !isLoading && !error) return null;

  return (
    <div className="finance-document-preview" role="dialog" aria-modal="true" aria-label="Document preview">
      <div className="finance-document-preview__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="finance-document-preview__panel">
        <header className="finance-document-preview__toolbar titan-doc__no-print">
          <div>
            <h2 className="finance-document-preview__title">
              {documentLabel ? `${documentLabel} preview` : isLoading ? 'Loading preview…' : 'Document preview'}
            </h2>
            {documentNumber ? (
              <p className="finance-document-preview__subtitle">{documentNumber}</p>
            ) : null}
          </div>
          <div className="finance-document-preview__actions">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button type="button" disabled={!preview || isLoading} onClick={handleDownload}>
              Download PDF
            </Button>
          </div>
        </header>

        {error ? <p className="form-error finance-document-preview__error">{error}</p> : null}
        {downloadError ? <p className="form-error finance-document-preview__error">{downloadError}</p> : null}
        {isLoading ? <p className="page-muted finance-document-preview__loading">Building PDF preview…</p> : null}

        {pdfUrl ? (
          <div className="finance-document-preview__pdf-frame">
            <iframe
              className="finance-document-preview__iframe"
              src={pdfUrl}
              title={documentLabel ? `${documentLabel} PDF preview` : 'PDF preview'}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
