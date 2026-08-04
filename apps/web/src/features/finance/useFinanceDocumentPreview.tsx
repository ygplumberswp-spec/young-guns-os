import { useCallback, useEffect, useRef, useState } from 'react';
import { buildFinanceDocumentPreviewModel, type FinanceDocumentPreviewInput } from '@titan/shared';
import { previewFinanceDocumentPdf, type FinanceDocumentPdfPreview } from '../../lib/finance-api';
import { FinanceDocumentPreviewModal } from './FinanceDocumentPreviewModal';

type UseFinanceDocumentPreviewOptions = {
  accessToken: string | null | undefined;
};

export function useFinanceDocumentPreview({ accessToken }: UseFinanceDocumentPreviewOptions) {
  const [preview, setPreview] = useState<FinanceDocumentPdfPreview | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [documentLabel, setDocumentLabel] = useState<string | null>(null);
  const [documentNumber, setDocumentNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setIsLoading(false);
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

  const previewModal = (
    <FinanceDocumentPreviewModal
      preview={preview}
      pdfUrl={pdfUrl}
      documentLabel={documentLabel}
      documentNumber={documentNumber}
      isLoading={isLoading}
      error={error}
      onClose={closePreview}
    />
  );

  return {
    openPreview,
    closePreview,
    previewModal,
    isPreviewOpen: Boolean(preview || pdfUrl || isLoading || error),
  };
}
