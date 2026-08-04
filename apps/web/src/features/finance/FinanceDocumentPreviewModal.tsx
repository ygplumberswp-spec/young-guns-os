import { useCallback, useRef, useState } from 'react';
import { Button } from '@titan/ui';
import type { FinanceDocumentPreviewModel } from '@titan/shared';
import { TitanDocumentView } from '../../components/documents/TitanDocumentView';
import { downloadFinancePreviewPdf } from './finance-document-preview-pdf';
import '../../styles/finance-document-preview.css';

type FinanceDocumentPreviewModalProps = {
  preview: FinanceDocumentPreviewModel | null;
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
};

export function FinanceDocumentPreviewModal({
  preview,
  isLoading,
  error,
  onClose,
}: FinanceDocumentPreviewModalProps) {
  const documentRef = useRef<HTMLDivElement | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = useCallback(async () => {
    if (!preview || !documentRef.current) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const root = documentRef.current.querySelector('.titan-doc');
      if (!(root instanceof HTMLElement)) {
        throw new Error('Preview document is not ready');
      }
      await downloadFinancePreviewPdf(root, preview.downloadFilename);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Unable to download PDF');
    } finally {
      setIsDownloading(false);
    }
  }, [preview]);

  if (!preview && !isLoading && !error) return null;

  return (
    <div className="finance-document-preview" role="dialog" aria-modal="true" aria-label="Document preview">
      <div className="finance-document-preview__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="finance-document-preview__panel">
        <header className="finance-document-preview__toolbar titan-doc__no-print">
          <div>
            <h2 className="finance-document-preview__title">
              {preview ? `${preview.documentType === 'quote' ? 'Quote' : 'Invoice'} preview` : 'Loading preview…'}
            </h2>
            {preview ? <p className="finance-document-preview__subtitle">{preview.documentNumber}</p> : null}
          </div>
          <div className="finance-document-preview__actions">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              disabled={!preview || isDownloading || isLoading}
              onClick={() => void handleDownload()}
            >
              {isDownloading ? 'Preparing PDF…' : 'Download PDF'}
            </Button>
          </div>
        </header>

        {error ? <p className="form-error finance-document-preview__error">{error}</p> : null}
        {downloadError ? <p className="form-error finance-document-preview__error">{downloadError}</p> : null}
        {isLoading ? <p className="page-muted finance-document-preview__loading">Building preview…</p> : null}

        {preview ? (
          <div className="finance-document-preview__document" ref={documentRef}>
            <TitanDocumentView
              documentType={preview.documentType}
              documentNumber={preview.documentNumber}
              title={preview.title}
              status={preview.status}
              issuedAt={preview.issuedAt}
              dueDate={preview.dueDate}
              sections={preview.sections}
              photos={[]}
              lineItems={preview.lineItems}
              totals={preview.totals}
              customer={preview.customer}
              property={preview.property}
              job={preview.job}
              hideTitle={preview.hideTitle}
              hidePaymentOptions={preview.hidePaymentOptions}
              customerReference={preview.customerReference}
              documentAddresses={preview.documentAddresses}
              vatRateLabel={preview.vatRateLabel}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
