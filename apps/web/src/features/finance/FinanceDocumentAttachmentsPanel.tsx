import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react';
import type { FinanceDocumentAttachment, FinanceJobEvidencePickerItem } from '@titan/shared';
import { financeAttachmentIsImage } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { FinanceEditorCard } from './FinanceEditorCard';
import { FinanceAttachmentThumbnail } from './FinanceAttachmentThumbnail';
import {
  deleteFinanceAttachment,
  fetchInvoiceAttachments,
  fetchQuoteAttachments,
  fetchSelectableJobEvidence,
  fetchStagingAttachments,
  linkInvoiceJobEvidence,
  linkQuoteJobEvidence,
  linkStagingJobEvidence,
  reorderInvoiceAttachments,
  reorderQuoteAttachments,
  reorderStagingAttachments,
  replaceFinanceAttachment,
  updateFinanceAttachment,
  uploadInvoiceAttachment,
  uploadQuoteAttachment,
  uploadStagingAttachment,
} from './finance-attachments-api';
import {
  FINANCE_ATTACHMENT_ACCEPT,
  fileToBase64,
  normaliseUploadMimeType,
  validateClientAttachmentFile,
} from './finance-attachment-utils';

export type FinanceAttachmentScope =
  | { mode: 'quote'; quoteId: string }
  | { mode: 'invoice'; invoiceId: string }
  | { mode: 'staging'; draftClientActionId: string };

type UploadState = {
  localId: string;
  fileName: string;
  status: 'uploading' | 'error';
  error?: string;
};

type FinanceDocumentAttachmentsPanelProps = {
  accessToken: string;
  scope: FinanceAttachmentScope;
  jobId?: string;
  disabled?: boolean;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function FinanceDocumentAttachmentsPanel({
  accessToken,
  scope,
  jobId,
  disabled = false,
}: FinanceDocumentAttachmentsPanelProps) {
  const inputId = useId();
  const cameraInputId = useId();
  const replaceInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);

  const [attachments, setAttachments] = useState<FinanceDocumentAttachment[]>([]);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [jobEvidence, setJobEvidence] = useState<FinanceJobEvidencePickerItem[]>([]);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);

  const scopeKey =
    scope.mode === 'quote'
      ? scope.quoteId
      : scope.mode === 'invoice'
        ? scope.invoiceId
        : scope.draftClientActionId;

  const evidenceScope =
    scope.mode === 'quote'
      ? { quoteId: scope.quoteId }
      : scope.mode === 'invoice'
        ? { invoiceId: scope.invoiceId }
        : { draftClientActionId: scope.draftClientActionId };

  const reloadAttachments = useCallback(async () => {
    const items =
      scope.mode === 'quote'
        ? await fetchQuoteAttachments(accessToken, scope.quoteId)
        : scope.mode === 'invoice'
          ? await fetchInvoiceAttachments(accessToken, scope.invoiceId)
          : await fetchStagingAttachments(accessToken, scope.draftClientActionId);
    setAttachments(items);
    return items;
  }, [accessToken, scope]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    void reloadAttachments()
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiClientError ? err.message : 'Unable to load attachments');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadAttachments, scopeKey]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      if (disabled) return;
      const list = Array.from(files);
      if (list.length === 0) return;

      for (const file of list) {
        const localId = newLocalId();
        const validationError = validateClientAttachmentFile(file);
        if (validationError) {
          setUploads((prev) => [
            ...prev,
            { localId, fileName: file.name, status: 'error', error: validationError },
          ]);
          continue;
        }

        setUploads((prev) => [...prev, { localId, fileName: file.name, status: 'uploading' }]);
        try {
          const body = {
            fileName: file.name,
            mimeType: normaliseUploadMimeType(file),
            dataBase64: await fileToBase64(file),
            clientActionId: localId,
          };
          const attachment =
            scope.mode === 'quote'
              ? await uploadQuoteAttachment(accessToken, scope.quoteId, body)
              : scope.mode === 'invoice'
                ? await uploadInvoiceAttachment(accessToken, scope.invoiceId, body)
                : await uploadStagingAttachment(accessToken, scope.draftClientActionId, body);
          setAttachments((prev) => [...prev, attachment]);
        } catch (err) {
          setUploads((prev) =>
            prev.map((item) =>
              item.localId === localId
                ? {
                    ...item,
                    status: 'error',
                    error: err instanceof ApiClientError ? err.message : 'Upload failed',
                  }
                : item,
            ),
          );
          continue;
        }
        setUploads((prev) => prev.filter((item) => item.localId !== localId));
      }
    },
    [accessToken, disabled, scope],
  );

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      void uploadFiles(event.dataTransfer.files);
    },
    [disabled, uploadFiles],
  );

  const persistReorder = useCallback(
    async (next: FinanceDocumentAttachment[]) => {
      const attachmentIds = next.map((item) => item.id);
      const reordered =
        scope.mode === 'quote'
          ? await reorderQuoteAttachments(accessToken, scope.quoteId, { attachmentIds })
          : scope.mode === 'invoice'
            ? await reorderInvoiceAttachments(accessToken, scope.invoiceId, { attachmentIds })
            : await reorderStagingAttachments(accessToken, scope.draftClientActionId, { attachmentIds });
      setAttachments(reordered);
    },
    [accessToken, scope],
  );

  const moveAttachment = useCallback(
    (attachmentId: string, direction: -1 | 1) => {
      const index = attachments.findIndex((item) => item.id === attachmentId);
      if (index < 0) return;
      const target = index + direction;
      if (target < 0 || target >= attachments.length) return;
      const next = [...attachments];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      setAttachments(next);
      void persistReorder(next).catch((err) => {
        setPanelError(err instanceof ApiClientError ? err.message : 'Unable to reorder attachments');
        void reloadAttachments();
      });
    },
    [attachments, persistReorder, reloadAttachments],
  );

  const updateCaption = useCallback(
    async (attachmentId: string, caption: string) => {
      try {
        const updated = await updateFinanceAttachment(accessToken, attachmentId, { caption });
        setAttachments((prev) => prev.map((item) => (item.id === attachmentId ? updated : item)));
      } catch (err) {
        setPanelError(err instanceof ApiClientError ? err.message : 'Unable to update caption');
      }
    },
    [accessToken],
  );

  const toggleIncludeInPdf = useCallback(
    async (attachment: FinanceDocumentAttachment) => {
      try {
        const updated = await updateFinanceAttachment(accessToken, attachment.id, {
          includeInPdf: !attachment.includeInPdf,
        });
        setAttachments((prev) => prev.map((item) => (item.id === attachment.id ? updated : item)));
      } catch (err) {
        setPanelError(err instanceof ApiClientError ? err.message : 'Unable to update PDF inclusion');
      }
    },
    [accessToken],
  );

  const removeAttachment = useCallback(
    async (attachmentId: string) => {
      try {
        await deleteFinanceAttachment(accessToken, attachmentId);
        setAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
      } catch (err) {
        setPanelError(err instanceof ApiClientError ? err.message : 'Unable to remove attachment');
      }
    },
    [accessToken],
  );

  const startReplace = useCallback((attachmentId: string) => {
    replaceTargetRef.current = attachmentId;
    replaceInputRef.current?.click();
  }, []);

  const handleReplaceSelected = useCallback(
    async (file: File) => {
      const attachmentId = replaceTargetRef.current;
      replaceTargetRef.current = null;
      if (!attachmentId || disabled) return;

      const validationError = validateClientAttachmentFile(file);
      if (validationError) {
        setPanelError(validationError);
        return;
      }

      try {
        const updated = await replaceFinanceAttachment(accessToken, attachmentId, {
          fileName: file.name,
          mimeType: normaliseUploadMimeType(file),
          dataBase64: await fileToBase64(file),
        });
        setAttachments((prev) => prev.map((item) => (item.id === attachmentId ? updated : item)));
      } catch (err) {
        setPanelError(err instanceof ApiClientError ? err.message : 'Unable to replace attachment');
      }
    },
    [accessToken, disabled],
  );

  const openJobPicker = useCallback(async () => {
    if (!jobId || disabled) return;
    setShowJobPicker(true);
    setIsLoadingEvidence(true);
    setPanelError(null);
    try {
      const items = await fetchSelectableJobEvidence(accessToken, jobId, evidenceScope);
      setJobEvidence(items);
    } catch (err) {
      setPanelError(err instanceof ApiClientError ? err.message : 'Unable to load job photos');
      setJobEvidence([]);
    } finally {
      setIsLoadingEvidence(false);
    }
  }, [accessToken, disabled, evidenceScope, jobId]);

  const linkEvidence = useCallback(
    async (item: FinanceJobEvidencePickerItem) => {
      if (item.alreadyLinked || disabled) return;
      try {
        const attachment =
          scope.mode === 'quote'
            ? await linkQuoteJobEvidence(accessToken, scope.quoteId, {
                documentationId: item.documentationId,
                caption: item.title,
              })
            : scope.mode === 'invoice'
              ? await linkInvoiceJobEvidence(accessToken, scope.invoiceId, {
                  documentationId: item.documentationId,
                  caption: item.title,
                })
              : await linkStagingJobEvidence(accessToken, scope.draftClientActionId, {
                  documentationId: item.documentationId,
                  caption: item.title,
                });
        setAttachments((prev) => [...prev, attachment]);
        setJobEvidence((prev) =>
          prev.map((entry) =>
            entry.documentationId === item.documentationId ? { ...entry, alreadyLinked: true } : entry,
          ),
        );
      } catch (err) {
        setPanelError(err instanceof ApiClientError ? err.message : 'Unable to link job file');
      }
    },
    [accessToken, disabled, scope],
  );

  return (
    <FinanceEditorCard
      title="Photos & Attachments"
      description="Upload photos and PDFs, link existing job evidence, and choose what appears in the PDF."
      className="finance-editor-card--full finance-editor-card--attachments"
    >
      {loadError ? <p className="form-error">{loadError}</p> : null}
      {panelError ? (
        <p className="finance-attachments__inline-error" role="alert">
          {panelError}
        </p>
      ) : null}

      <div
        className={`finance-attachments__dropzone${isDragging ? ' finance-attachments__dropzone--active' : ''}${disabled ? ' finance-attachments__dropzone--disabled' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        <p className="finance-attachments__dropzone-title">Drag and drop files here</p>
        <p className="finance-attachments__dropzone-hint">JPG, PNG, WebP, HEIC or PDF — up to 8 MB images / 10 MB PDFs</p>
        <div className="finance-attachments__actions">
          <button
            type="button"
            className="titan-btn titan-btn--secondary"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            Choose files
          </button>
          <button
            type="button"
            className="titan-btn titan-btn--secondary"
            disabled={disabled}
            onClick={() => cameraInputRef.current?.click()}
          >
            Take photo
          </button>
          {jobId ? (
            <button type="button" className="titan-btn titan-btn--ghost" disabled={disabled} onClick={() => void openJobPicker()}>
              Link job photos / COC
            </button>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          className="finance-attachments__file-input"
          accept={FINANCE_ATTACHMENT_ACCEPT}
          multiple
          disabled={disabled}
          onChange={(event) => {
            if (event.target.files) void uploadFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <input
          ref={cameraInputRef}
          id={cameraInputId}
          type="file"
          className="finance-attachments__file-input"
          accept="image/jpeg,image/png,image/webp,image/heic,.heic"
          capture="environment"
          disabled={disabled}
          onChange={(event) => {
            if (event.target.files) void uploadFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <input
          ref={replaceInputRef}
          id={replaceInputId}
          type="file"
          className="finance-attachments__file-input"
          accept={FINANCE_ATTACHMENT_ACCEPT}
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleReplaceSelected(file);
            event.target.value = '';
          }}
        />
      </div>

      {isLoading ? <p className="page-muted">Loading attachments…</p> : null}

      {uploads.length > 0 ? (
        <ul className="finance-attachments__upload-list">
          {uploads.map((upload) => (
            <li key={upload.localId} className={`finance-attachments__upload-item finance-attachments__upload-item--${upload.status}`}>
              <span>{upload.fileName}</span>
              {upload.status === 'uploading' ? <span className="finance-attachments__progress">Uploading…</span> : null}
              {upload.status === 'error' ? <span className="form-error">{upload.error}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {attachments.length > 0 ? (
        <ul className="finance-attachments__list">
          {attachments.map((attachment, index) => (
            <li key={attachment.id} className="finance-attachments__item">
              <div className="finance-attachments__thumb-wrap">
                <FinanceAttachmentThumbnail
                  accessToken={accessToken}
                  attachmentId={attachment.id}
                  mimeType={attachment.mimeType}
                  alt={attachment.fileName}
                  className="finance-attachments__thumb"
                />
              </div>
              <div className="finance-attachments__meta">
                <div className="finance-attachments__filename-row">
                  <strong>{attachment.fileName}</strong>
                  <span className="finance-attachments__size">{formatFileSize(attachment.sizeBytes)}</span>
                  {attachment.source === 'job_evidence' ? (
                    <span className="finance-attachments__badge">Job evidence</span>
                  ) : null}
                </div>
                <label className="titan-input-group finance-attachments__caption">
                  <span className="titan-input-label">Caption</span>
                  <input
                    className="titan-input finance-editor-field"
                    defaultValue={attachment.caption ?? ''}
                    disabled={disabled}
                    placeholder="Optional caption for PDF"
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next !== (attachment.caption ?? '')) {
                        void updateCaption(attachment.id, next);
                      }
                    }}
                  />
                </label>
                <label className="finance-attachments__pdf-toggle">
                  <input
                    type="checkbox"
                    checked={attachment.includeInPdf}
                    disabled={disabled}
                    onChange={() => void toggleIncludeInPdf(attachment)}
                  />
                  <span>
                    Include in PDF
                    {!financeAttachmentIsImage(attachment.mimeType) ? ' (listed as attachment)' : ''}
                  </span>
                </label>
              </div>
              <div className="finance-attachments__item-actions">
                <button type="button" className="titan-btn titan-btn--ghost" disabled={disabled || index === 0} onClick={() => moveAttachment(attachment.id, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className="titan-btn titan-btn--ghost"
                  disabled={disabled || index === attachments.length - 1}
                  onClick={() => moveAttachment(attachment.id, 1)}
                >
                  ↓
                </button>
                {attachment.source === 'upload' ? (
                  <button type="button" className="titan-btn titan-btn--ghost" disabled={disabled} onClick={() => startReplace(attachment.id)}>
                    Replace
                  </button>
                ) : null}
                <button type="button" className="titan-btn titan-btn--ghost" disabled={disabled} onClick={() => void removeAttachment(attachment.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : !isLoading ? (
        <p className="finance-editor-muted">No photos or attachments yet.</p>
      ) : null}

      {showJobPicker ? (
        <div className="finance-attachments__picker" role="dialog" aria-label="Link job photos">
          <div className="finance-attachments__picker-header">
            <h3>Job photos & documents</h3>
            <button type="button" className="titan-btn titan-btn--ghost" onClick={() => setShowJobPicker(false)}>
              Close
            </button>
          </div>
          {isLoadingEvidence ? <p className="page-muted">Loading job files…</p> : null}
          {!isLoadingEvidence && jobEvidence.length === 0 ? (
            <p className="finance-editor-muted">No linkable job photos or COC files found.</p>
          ) : null}
          <ul className="finance-attachments__picker-list">
            {jobEvidence.map((item) => (
              <li key={item.documentationId} className="finance-attachments__picker-item">
                <div>
                  <strong>{item.fileName}</strong>
                  <span className="finance-attachments__picker-kind">{item.evidenceKind}</span>
                  {item.alreadyLinked ? <span className="finance-attachments__badge">Already linked</span> : null}
                </div>
                <button
                  type="button"
                  className="titan-btn titan-btn--secondary"
                  disabled={disabled || item.alreadyLinked}
                  onClick={() => void linkEvidence(item)}
                >
                  Link
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </FinanceEditorCard>
  );
}

export function financeAttachmentScopeFromEditor(input: {
  quoteId?: string | null;
  invoiceId?: string | null;
  draftClientActionId?: string | null;
}): FinanceDocumentAttachmentsPanelProps['scope'] | null {
  if (input.quoteId) return { mode: 'quote', quoteId: input.quoteId };
  if (input.invoiceId) return { mode: 'invoice', invoiceId: input.invoiceId };
  if (input.draftClientActionId) return { mode: 'staging', draftClientActionId: input.draftClientActionId };
  return null;
}

export function financePreviewAttachmentScope(scope: FinanceAttachmentScope | null) {
  if (!scope) return null;
  if (scope.mode === 'quote') return { quoteId: scope.quoteId };
  if (scope.mode === 'invoice') return { invoiceId: scope.invoiceId };
  return { draftClientActionId: scope.draftClientActionId };
}
