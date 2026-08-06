import { useCallback, useEffect, useRef, useState } from 'react';
import { buildFinanceDocumentPreviewModel, type FinanceDocumentPreviewInput } from '@titan/shared';
import { previewFinanceDocumentPdf, type FinanceDocumentPdfPreview } from '../../lib/finance-api';
import { FinanceDocumentPreviewModal, type FinancePreviewSaveHandlers } from './FinanceDocumentPreviewModal';

type UseFinanceDocumentPreviewOptions = {
  accessToken: string | null | undefined;
  saveHandlers?: Omit<FinancePreviewSaveHandlers, 'saveError' | 'saveNotice' | 'isSaving'>;
};

export function useFinanceDocumentPreview({ accessToken, saveHandlers }: UseFinanceDocumentPreviewOptions) {
  const [preview, setPreview] = useState<FinanceDocumentPdfPreview | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [documentLabel, setDocumentLabel] = useState<string | null>(null);
  const [documentNumber, setDocumentNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  const revokePdfUrl = useCallback(() => {
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }
    setPdfUrl(null);
  }, []);

  const closePreview = useCallback(() => {
    revokePdfUrl();
    setPreview(null);
    setDocumentLabel(null);
    setDocumentNumber(null);
    setError(null);
    setSaveError(null);
    setSaveNotice(null);
    setIsLoading(false);
    setIsSaving(false);
  }, [revokePdfUrl]);

  useEffect(() => () => revokePdfUrl(), [revokePdfUrl]);

  const openPreview = useCallback(
    async (input: FinanceDocumentPreviewInput) => {
      if (!accessToken) {
        setError('Sign in to preview documents');
        return;
      }

      const model = buildFinanceDocumentPreviewModel(input);
      setDocumentLabel(model.documentType === 'quote' ? 'Quote' : 'Invoice');
      setDocumentNumber(model.documentNumber);
      setIsLoading(true);
      setError(null);
      setSaveError(null);
      setSaveNotice(null);
      setPreview(null);
      revokePdfUrl();

      try {
        const pdfPreview = await previewFinanceDocumentPdf(accessToken, input);
        const url = URL.createObjectURL(pdfPreview.blob);
        pdfUrlRef.current = url;
        setPdfUrl(url);
        setPreview(pdfPreview);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to build PDF preview');
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken, revokePdfUrl],
  );

  const runPreviewSave = useCallback(
    async (handler: (() => Promise<void>) | undefined, notice: string) => {
      if (!handler || isSaving) return;
      setIsSaving(true);
      setSaveError(null);
      setSaveNotice(null);
      try {
        await handler();
        setSaveNotice(notice);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Unable to save document');
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving],
  );

  const previewModal = (
    <FinanceDocumentPreviewModal
      preview={preview}
      pdfUrl={pdfUrl}
      documentLabel={documentLabel}
      documentNumber={documentNumber}
      isLoading={isLoading}
      error={error}
      onClose={closePreview}
      saveHandlers={{
        ...saveHandlers,
        isSaving,
        saveError,
        saveNotice,
        onSave: saveHandlers?.onSave
          ? () => runPreviewSave(saveHandlers.onSave, 'Document saved')
          : undefined,
        onSaveDraft: saveHandlers?.onSaveDraft
          ? () => runPreviewSave(saveHandlers.onSaveDraft, 'Draft saved')
          : undefined,
      }}
    />
  );

  return {
    openPreview,
    closePreview,
    previewModal,
    isPreviewOpen: Boolean(preview || pdfUrl || isLoading || error),
  };
}
