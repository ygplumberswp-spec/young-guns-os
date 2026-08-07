import { useCallback, useId, useRef, useState, type DragEvent } from 'react';
import type {
  EvidenceAttachmentCategory,
  EvidenceUploadItemStatus,
  EvidenceUploadSource,
  UploadJobEvidenceRequest,
} from '@titan/shared';
import {
  EVIDENCE_ATTACHMENT_CATEGORY_OPTIONS,
  UNIVERSAL_EVIDENCE_ACCEPT,
  evidenceUploadProgressLabel,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { uploadOfficeJobEvidence } from '../../lib/jobs-api';
import { MobileApiClientError, uploadMobileJobEvidence } from '../../lib/mobile-api-client';
import {
  enqueueOfflineAction,
  newOfflineClientActionId,
} from '../../lib/mobile-offline-queue';
import {
  buildEvidenceUploadRequest,
  clampEvidenceBatch,
  evidenceFileToBase64,
  newEvidenceClientActionId,
  validateEvidenceClientFile,
} from './evidence-upload-client';

export type EvidenceUploadRow = {
  localId: string;
  clientActionId: string;
  fileName: string;
  status: EvidenceUploadItemStatus;
  error?: string | null;
  source: EvidenceUploadSource;
};

export type EvidenceAttachmentUploaderProps = {
  accessToken: string;
  jobId: string;
  mode: 'technician' | 'office';
  disabled?: boolean;
  defaultCategory?: EvidenceAttachmentCategory;
  showCategoryPicker?: boolean;
  enableDragDrop?: boolean;
  enableOfflineQueue?: boolean;
  onUploaded?: () => void | Promise<void>;
  onMessage?: (message: string) => void;
  onError?: (message: string) => void;
  onOfflineQueued?: () => void | Promise<void>;
};

export function EvidenceAttachmentUploader(props: EvidenceAttachmentUploaderProps) {
  const {
    accessToken,
    jobId,
    mode,
    disabled = false,
    defaultCategory = 'before_photo',
    showCategoryPicker = true,
    enableDragDrop = mode === 'office',
    enableOfflineQueue = mode === 'technician',
    onUploaded,
    onMessage,
    onError,
    onOfflineQueued,
  } = props;

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const failedFilesRef = useRef<Map<string, { file: File; clientActionId: string; source: EvidenceUploadSource }>>(
    new Map(),
  );

  const cameraInputId = useId();
  const galleryInputId = useId();
  const fileInputId = useId();

  const [category, setCategory] = useState<EvidenceAttachmentCategory>(defaultCategory);
  const [rows, setRows] = useState<EvidenceUploadRow[]>([]);
  const [batchLabel, setBatchLabel] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const updateRow = useCallback((localId: string, patch: Partial<EvidenceUploadRow>) => {
    setRows((prev) => prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  }, []);

  const uploadOne = useCallback(
    async (input: {
      file: File;
      localId: string;
      clientActionId: string;
      source: EvidenceUploadSource;
      attachmentCategory: EvidenceAttachmentCategory;
    }) => {
      const { file, localId, clientActionId, source, attachmentCategory } = input;
      failedFilesRef.current.set(localId, { file, clientActionId, source });

      const validationError = validateEvidenceClientFile(file);
      if (validationError) {
        updateRow(localId, { status: 'failed', error: validationError });
        return { ok: false as const };
      }

      updateRow(localId, { status: 'reading', error: null });
      const dataBase64 = await evidenceFileToBase64(file);
      const payload: UploadJobEvidenceRequest = buildEvidenceUploadRequest({
        file,
        dataBase64,
        category: attachmentCategory,
        clientActionId,
        uploadSource: source,
      });

      if (enableOfflineQueue && !navigator.onLine) {
        await enqueueOfflineAction({
          clientActionId,
          actionType: 'evidence_upload',
          jobId,
          payload: payload as unknown as Record<string, unknown>,
        });
        updateRow(localId, { status: 'pending_sync', error: null });
        failedFilesRef.current.delete(localId);
        await onOfflineQueued?.();
        return { ok: true as const, pendingSync: true };
      }

      updateRow(localId, { status: 'uploading', error: null });
      try {
        if (mode === 'technician') {
          await uploadMobileJobEvidence(accessToken, jobId, payload);
        } else {
          const officeType =
            payload.documentationType === 'photo'
              ? 'photo'
              : payload.documentationType === 'inspection_form'
                ? 'inspection_form'
                : 'document';
          await uploadOfficeJobEvidence(accessToken, jobId, {
            documentationType: officeType,
            title: payload.title,
            mimeType: payload.mimeType,
            dataBase64: payload.dataBase64,
            fileName: payload.fileName,
            evidencePhase: payload.evidencePhase,
            attachmentCategory: payload.attachmentCategory ?? null,
            clientVisible: false,
            clientActionId: payload.clientActionId,
            metadata: payload.metadata,
          });
        }
        updateRow(localId, { status: 'synced', error: null });
        failedFilesRef.current.delete(localId);
        return { ok: true as const, pendingSync: false };
      } catch (err) {
        const message =
          err instanceof MobileApiClientError || err instanceof ApiClientError
            ? err.message
            : 'Upload failed';

        if (enableOfflineQueue) {
          // Reuse the same clientActionId so a later retry cannot create duplicates.
          try {
            await enqueueOfflineAction({
              clientActionId,
              actionType: 'evidence_upload',
              jobId,
              payload: {
                ...(payload as unknown as Record<string, unknown>),
                clientActionId,
                metadata: {
                  ...(payload.metadata ?? {}),
                  failedUpload: true,
                },
              },
            });
            updateRow(localId, { status: 'pending_sync', error: `${message} — queued for retry` });
            await onOfflineQueued?.();
            return { ok: true as const, pendingSync: true };
          } catch {
            // fall through to failed
          }
        }

        updateRow(localId, { status: 'failed', error: message });
        return { ok: false as const };
      }
    },
    [accessToken, enableOfflineQueue, jobId, mode, onOfflineQueued, updateRow],
  );

  const processFiles = useCallback(
    async (fileList: FileList | File[], source: EvidenceUploadSource) => {
      if (disabled || busy) return;
      const { accepted, truncated } = clampEvidenceBatch(Array.from(fileList));
      if (accepted.length === 0) return;
      if (truncated > 0) {
        onError?.(
          `Selection capped at ${accepted.length} files for this batch (${truncated} not started). Run another batch for the rest.`,
        );
      }

      setBusy(true);
      const attachmentCategory = category;
      const staged = accepted.map((file) => {
        const localId = newEvidenceClientActionId('local');
        // Stable id minted once — retries and offline flush reuse it.
        const clientActionId =
          mode === 'technician' ? newOfflineClientActionId(`evidence-${attachmentCategory}`) : newEvidenceClientActionId(`evidence-${attachmentCategory}`);
        return { file, localId, clientActionId, source };
      });

      setRows((prev) => [
        ...prev,
        ...staged.map((item) => ({
          localId: item.localId,
          clientActionId: item.clientActionId,
          fileName: item.file.name,
          status: 'queued' as const,
          source: item.source,
        })),
      ]);

      let completed = 0;
      let pendingSync = 0;
      let failed = 0;
      for (const item of staged) {
        setBatchLabel(
          evidenceUploadProgressLabel({
            completed,
            total: staged.length,
            currentFileName: item.file.name,
          }),
        );
        const result = await uploadOne({
          file: item.file,
          localId: item.localId,
          clientActionId: item.clientActionId,
          source: item.source,
          attachmentCategory,
        });
        completed += 1;
        if (result.ok && 'pendingSync' in result && result.pendingSync) pendingSync += 1;
        if (!result.ok) failed += 1;
        setBatchLabel(
          evidenceUploadProgressLabel({
            completed,
            total: staged.length,
            status: pendingSync > 0 ? 'pending_sync' : undefined,
          }),
        );
      }

      setBusy(false);
      if (pendingSync > 0) {
        onMessage?.(
          `${pendingSync} file(s) PENDING SYNC — will upload when online without duplicating`,
        );
      } else if (failed === 0) {
        onMessage?.(`${staged.length} attachment(s) uploaded`);
      } else if (failed < staged.length) {
        onMessage?.(`${staged.length - failed} uploaded · ${failed} failed`);
      } else {
        onError?.('All uploads failed — retry from the list below');
      }

      if (completed > failed) {
        await onUploaded?.();
      }

      // Clear finished synced rows after a short window; keep failed/pending visible.
      setTimeout(() => {
        setRows((prev) => prev.filter((row) => row.status !== 'synced'));
        setBatchLabel(null);
      }, 1200);
    },
    [busy, category, disabled, mode, onError, onMessage, onUploaded, uploadOne],
  );

  const retryRow = useCallback(
    (localId: string) => {
      const stored = failedFilesRef.current.get(localId);
      if (!stored || busy) return;
      setRows((prev) => prev.filter((row) => row.localId !== localId));
      void (async () => {
        setBusy(true);
        setRows((prev) => [
          ...prev,
          {
            localId,
            clientActionId: stored.clientActionId,
            fileName: stored.file.name,
            status: 'queued',
            source: stored.source,
          },
        ]);
        const result = await uploadOne({
          file: stored.file,
          localId,
          clientActionId: stored.clientActionId,
          source: stored.source,
          attachmentCategory: category,
        });
        setBusy(false);
        if (result.ok) {
          onMessage?.(result.pendingSync ? 'PENDING SYNC — queued for retry' : 'Upload retried successfully');
          await onUploaded?.();
          setTimeout(() => {
            setRows((prev) => prev.filter((row) => row.localId !== localId || row.status !== 'synced'));
          }, 1200);
        } else {
          onError?.('Retry failed');
        }
      })();
    },
    [busy, category, onError, onMessage, onUploaded, uploadOne],
  );

  const uploadEnabled = !disabled && !busy;

  return (
    <div className="evidence-uploader">
      {showCategoryPicker ? (
        <label className="titan-input-group evidence-uploader__category">
          <span className="titan-input-label">Attachment category</span>
          <select
            className="titan-input"
            value={category}
            disabled={!uploadEnabled}
            onChange={(e) => setCategory(e.target.value as EvidenceAttachmentCategory)}
          >
            {EVIDENCE_ATTACHMENT_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <p className="page-muted evidence-uploader__hint">
        Take photo, choose from gallery (multi-select, 50+ supported), or upload files. Internal
        slips/receipts/evidence stay hidden from the Client.
      </p>

      <div
        className={`evidence-uploader__dropzone${isDragging ? ' evidence-uploader__dropzone--active' : ''}`}
        onDragOver={
          enableDragDrop
            ? (e) => {
                e.preventDefault();
              }
            : undefined
        }
        onDragEnter={enableDragDrop ? () => setIsDragging(true) : undefined}
        onDragLeave={enableDragDrop ? () => setIsDragging(false) : undefined}
        onDrop={
          enableDragDrop
            ? (e: DragEvent) => {
                e.preventDefault();
                setIsDragging(false);
                void processFiles(e.dataTransfer.files, 'drag_drop');
              }
            : undefined
        }
      >
        <div className="evidence-uploader__actions">
          <button
            type="button"
            className="mobile-action-btn"
            disabled={!uploadEnabled}
            onClick={() => cameraInputRef.current?.click()}
          >
            Take photo
          </button>
          <button
            type="button"
            className="mobile-action-btn"
            disabled={!uploadEnabled}
            onClick={() => galleryInputRef.current?.click()}
          >
            Choose from gallery
          </button>
          <button
            type="button"
            className="mobile-action-btn"
            disabled={!uploadEnabled}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload file
          </button>
        </div>
        {enableDragDrop ? (
          <p className="page-muted evidence-uploader__drag-hint">Or drag and drop files here</p>
        ) : null}
      </div>

      <input
        ref={cameraInputRef}
        id={cameraInputId}
        type="file"
        className="evidence-uploader__file-input"
        accept="image/jpeg,image/png,image/webp,image/heic,.heic"
        capture="environment"
        disabled={!uploadEnabled}
        onChange={(e) => {
          if (e.target.files) void processFiles(e.target.files, 'camera');
          e.target.value = '';
        }}
      />
      <input
        ref={galleryInputRef}
        id={galleryInputId}
        type="file"
        className="evidence-uploader__file-input"
        accept="image/jpeg,image/png,image/webp,image/heic,.heic,image/*"
        multiple
        disabled={!uploadEnabled}
        onChange={(e) => {
          if (e.target.files) void processFiles(e.target.files, 'gallery');
          e.target.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        className="evidence-uploader__file-input"
        accept={UNIVERSAL_EVIDENCE_ACCEPT}
        multiple
        disabled={!uploadEnabled}
        onChange={(e) => {
          if (e.target.files) void processFiles(e.target.files, 'file');
          e.target.value = '';
        }}
      />

      {batchLabel ? <p className="evidence-uploader__batch">{batchLabel}</p> : null}

      {rows.length > 0 ? (
        <ul className="evidence-uploader__list">
          {rows.map((row) => (
            <li key={row.localId} className={`evidence-uploader__item evidence-uploader__item--${row.status}`}>
              <div>
                <strong>{row.fileName}</strong>
                <span>
                  {row.status === 'pending_sync'
                    ? 'PENDING SYNC'
                    : row.status === 'uploading'
                      ? 'Uploading…'
                      : row.status === 'reading'
                        ? 'Reading…'
                        : row.status === 'synced'
                          ? 'Synced'
                          : row.status === 'failed'
                            ? row.error ?? 'Failed'
                            : 'Queued'}
                </span>
              </div>
              {row.status === 'failed' ? (
                <button type="button" className="titan-btn titan-btn--ghost" onClick={() => retryRow(row.localId)}>
                  Retry
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
