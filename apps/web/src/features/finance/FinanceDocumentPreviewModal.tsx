import { Button } from '@titan/ui';
import type { FinanceDocumentPdfPreview } from '../../lib/finance-api';
import '../../styles/finance-document-preview.css';

export type FinancePreviewSaveHandlers = {
  onSave?: () => Promise<void>;
  onSaveDraft?: () => Promise<void>;
  isSaving?: boolean;
  saveError?: string | null;
  saveNotice?: string | null;
  canSave?: boolean;
};

type FinanceDocumentPreviewModalProps = {
  preview: FinanceDocumentPdfPreview | null;
  pdfUrl: string | null;
  documentLabel: string | null;
  documentNumber: string | null;
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
  saveHandlers?: FinancePreviewSaveHandlers;
};

export function FinanceDocumentPreviewModal({
  preview,
  pdfUrl,
  documentLabel,
  documentNumber,
  isLoading,
  error,
  onClose,
  saveHandlers,
}: FinanceDocumentPreviewModalProps) {
  const handleDownload = () => {
    if (!preview) return;
    const url = URL.createObjectURL(preview.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = preview.filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  if (!preview && !pdfUrl && !isLoading && !error) return null;

  const saving = saveHandlers?.isSaving ?? false;
  const canSave = saveHandlers?.canSave ?? false;

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
            {saveHandlers?.onSave ? (
              <Button type="button" disabled={!canSave || saving || isLoading} onClick={() => void saveHandlers.onSave?.()}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            ) : null}
            {saveHandlers?.onSaveDraft ? (
              <Button type="button" variant="secondary" disabled={!canSave || saving || isLoading} onClick={() => void saveHandlers.onSaveDraft?.()}>
                Save Draft
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button type="button" disabled={!preview || isLoading} onClick={handleDownload}>
              Download PDF
            </Button>
          </div>
        </header>

        {error ? <p className="form-error finance-document-preview__error">{error}</p> : null}
        {saveHandlers?.saveError ? <p className="form-error finance-document-preview__error">{saveHandlers.saveError}</p> : null}
        {saveHandlers?.saveNotice ? <p className="finance-document-preview__notice">{saveHandlers.saveNotice}</p> : null}
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
