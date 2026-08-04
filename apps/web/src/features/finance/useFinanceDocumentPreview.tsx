import { useCallback, useState } from 'react';
import type { FinanceDocumentPreviewInput, FinanceDocumentPreviewModel } from '@titan/shared';
import { previewFinanceDocument } from '../../lib/finance-api';
import { FinanceDocumentPreviewModal } from './FinanceDocumentPreviewModal';

type UseFinanceDocumentPreviewOptions = {
  accessToken: string | null | undefined;
};

export function useFinanceDocumentPreview({ accessToken }: UseFinanceDocumentPreviewOptions) {
  const [preview, setPreview] = useState<FinanceDocumentPreviewModel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closePreview = useCallback(() => {
    setPreview(null);
    setError(null);
    setIsLoading(false);
  }, []);

  const openPreview = useCallback(
    async (input: FinanceDocumentPreviewInput) => {
      if (!accessToken) {
        setError('Sign in to preview documents');
        return;
      }
      setIsLoading(true);
      setError(null);
      setPreview(null);
      try {
        const model = await previewFinanceDocument(accessToken, input);
        setPreview(model);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to build preview');
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken],
  );

  const previewModal = (
    <FinanceDocumentPreviewModal
      preview={preview}
      isLoading={isLoading}
      error={error}
      onClose={closePreview}
    />
  );

  return { openPreview, closePreview, previewModal, isPreviewOpen: Boolean(preview || isLoading || error) };
}
