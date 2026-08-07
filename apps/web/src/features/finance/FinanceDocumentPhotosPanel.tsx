import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react';
import type { DocumentPhoto } from '@titan/shared';
import {
  FINANCE_DIRECT_EVIDENCE_SCOPE,
  addDocumentPhoto,
  legacyFinanceDocumentTitle,
  removeDocumentPhoto,
  reorderDocumentPhoto,
  replaceDocumentPhoto,
  setDocumentPhotoCaption,
  setDocumentPhotoIncludeInPdf,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  ensureFinanceInvoiceDocument,
  ensureFinanceQuoteDocument,
  financeDirectPhotoContentUrl,
  saveTitanDocumentDraft,
  uploadFinanceDocumentPhoto,
  uploadFinanceStagingPhoto,
} from '../../lib/document-engine-api-client';
import { fetchJobExecution, uploadOfficeJobEvidence } from '../../lib/jobs-api';
import { FinanceEditorCard } from './FinanceEditorCard';
import { FinanceDocumentPhotoThumbnail } from './FinanceDocumentPhotoThumbnail';
import {
  FINANCE_PHOTO_ACCEPT,
  fileToBase64,
  normaliseUploadMimeType,
  validateClientPhotoFile,
} from './finance-document-photo-utils';

type UploadState = { localId: string; fileName: string; status: 'uploading' | 'error'; error?: string };

export type FinanceDocumentPhotosPanelProps = {
  accessToken: string;
  documentType: 'quote' | 'invoice';
  quoteId?: string | null;
  invoiceId?: string | null;
  draftClientActionId?: string;
  jobId?: string;
  customerId?: string;
  documentNumber: string;
  customerName?: string;
  photos: DocumentPhoto[];
  onPhotosChange: (photos: DocumentPhoto[]) => void;
  disabled?: boolean;
};

function newPhotoId() { return `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function newLocalId() { return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

export function FinanceDocumentPhotosPanel(props: FinanceDocumentPhotosPanelProps) {
  const {
    accessToken, documentType, quoteId, invoiceId, draftClientActionId, jobId, customerId, documentNumber,
    customerName, photos, onPhotosChange, disabled = false,
  } = props;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const failedFilesRef = useRef<Map<string, File>>(new Map());
  const inputId = useId();
  const cameraInputId = useId();
  const replaceInputId = useId();

  const [documentId, setDocumentId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [jobEvidence, setJobEvidence] = useState<Array<{ id: string; title: string; fileName: string | null; mimeType: string | null }>>([]);

  const financeRecordId = quoteId ?? invoiceId ?? null;
  const canUploadDirect = Boolean(draftClientActionId || documentId);

  useEffect(() => {
    if (!financeRecordId) return;
    let cancelled = false;
    void (async () => {
      try {
        const title = legacyFinanceDocumentTitle(customerName ?? '') || documentType;
        const detail = documentType === 'quote' && quoteId
          ? await ensureFinanceQuoteDocument(accessToken, quoteId, { documentNumber, title, customerId: customerId ?? null, jobId: jobId ?? null })
          : invoiceId
            ? await ensureFinanceInvoiceDocument(accessToken, invoiceId, { documentNumber, title, customerId: customerId ?? null, jobId: jobId ?? null })
            : null;
        if (cancelled || !detail) return;
        setDocumentId(detail.document.id);
        if (detail.photos.length > 0 && photos.length === 0) onPhotosChange(detail.photos);
      } catch (err) {
        if (!cancelled) setPanelError(err instanceof ApiClientError ? err.message : 'Unable to load photos');
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, customerId, customerName, documentNumber, documentType, financeRecordId, invoiceId, jobId, onPhotosChange, photos.length, quoteId]);

  const persistPhotos = useCallback(async (nextPhotos: DocumentPhoto[]) => {
    onPhotosChange(nextPhotos);
    if (!documentId) return;
    try {
      await saveTitanDocumentDraft(accessToken, documentId, { photos: nextPhotos });
    } catch (err) {
      setPanelError(err instanceof ApiClientError ? err.message : 'Unable to save photos');
    }
  }, [accessToken, documentId, onPhotosChange]);

  const uploadDirectFile = useCallback(async (file: File, localId: string) => {
    const mimeType = normaliseUploadMimeType(file);
    const dataBase64 = await fileToBase64(file);
    if (documentId) {
      return uploadFinanceDocumentPhoto(accessToken, documentId, {
        fileName: file.name, mimeType, dataBase64, clientActionId: localId,
      });
    }
    if (!draftClientActionId) {
      throw new Error('Draft correlation id is required before first save');
    }
    return uploadFinanceStagingPhoto(accessToken, draftClientActionId, {
      fileName: file.name, mimeType, dataBase64, clientActionId: localId,
    });
  }, [accessToken, documentId, draftClientActionId]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (disabled) return;
    for (const file of Array.from(files)) {
      const localId = newLocalId();
      failedFilesRef.current.set(localId, file);
      const validationError = validateClientPhotoFile(file);
      if (validationError) {
        setUploads((prev) => [...prev, { localId, fileName: file.name, status: 'error', error: validationError }]);
        continue;
      }
      setUploads((prev) => [...prev, { localId, fileName: file.name, status: 'uploading' }]);
      try {
        const mimeType = normaliseUploadMimeType(file);
        let nextPhotos = photos;

        if (jobId) {
          const documentation = await uploadOfficeJobEvidence(accessToken, jobId, {
            documentationType: mimeType === 'application/pdf' ? 'document' : 'photo',
            title: file.name,
            mimeType,
            dataBase64: await fileToBase64(file),
            fileName: file.name,
            evidencePhase: 'document',
            attachmentCategory: 'other_job_evidence',
            clientVisible: false,
            clientActionId: localId,
            metadata: { uploadSource: 'finance', clientVisible: false },
          });
          nextPhotos = addDocumentPhoto(photos, {
            id: newPhotoId(), documentationId: documentation.id, jobId, role: 'additional', caption: null, fileName: file.name, mimeType,
          });
        } else if (canUploadDirect) {
          const uploaded = await uploadDirectFile(file, localId);
          nextPhotos = addDocumentPhoto(photos, {
            id: newPhotoId(),
            documentationId: uploaded.fileId,
            jobId: FINANCE_DIRECT_EVIDENCE_SCOPE,
            role: 'additional',
            caption: null,
            fileName: uploaded.fileName,
            mimeType: uploaded.mimeType,
            source: 'finance_direct',
            storageKey: uploaded.storageKey,
          });
        } else {
          setPanelError('Save the document draft before uploading files');
          setUploads((prev) => prev.filter((item) => item.localId !== localId));
          continue;
        }

        await persistPhotos(nextPhotos);
        failedFilesRef.current.delete(localId);
      } catch (err) {
        setUploads((prev) => prev.map((item) => item.localId === localId ? { ...item, status: 'error', error: err instanceof ApiClientError ? err.message : 'Upload failed' } : item));
        continue;
      }
      setUploads((prev) => prev.filter((item) => item.localId !== localId));
    }
  }, [accessToken, canUploadDirect, disabled, jobId, persistPhotos, photos, uploadDirectFile]);

  const retryUpload = useCallback((localId: string) => {
    const file = failedFilesRef.current.get(localId);
    if (!file) return;
    setUploads((prev) => prev.filter((item) => item.localId !== localId));
    void uploadFiles([file]);
  }, [uploadFiles]);

  const uploadEnabled = !disabled && (Boolean(jobId) || canUploadDirect);

  return (
    <FinanceEditorCard title="Photos & Attachments" description="Upload directly or link existing job evidence." className="finance-editor-card--full finance-editor-card--attachments">
      {panelError ? <p className="finance-attachments__inline-error">{panelError}</p> : null}
      {!jobId && draftClientActionId ? (
        <p className="finance-editor-muted">Direct uploads are staged until the quote or invoice is saved.</p>
      ) : null}
      <div className={`finance-attachments__dropzone${isDragging ? ' finance-attachments__dropzone--active' : ''}`}
        onDragOver={(e) => e.preventDefault()} onDragEnter={() => setIsDragging(true)} onDragLeave={() => setIsDragging(false)}
        onDrop={(e: DragEvent) => { e.preventDefault(); setIsDragging(false); void uploadFiles(e.dataTransfer.files); }}>
        <div className="finance-attachments__actions">
          <button type="button" className="titan-btn titan-btn--secondary" disabled={!uploadEnabled} onClick={() => fileInputRef.current?.click()}>Choose files</button>
          <button type="button" className="titan-btn titan-btn--secondary" disabled={!uploadEnabled} onClick={() => cameraInputRef.current?.click()}>Take photo</button>
          {jobId ? <button type="button" className="titan-btn titan-btn--ghost" disabled={disabled} onClick={() => { setShowJobPicker(true); void fetchJobExecution(accessToken, jobId).then((execution) => setJobEvidence(execution.evidence.filter((d) => d.hasBinary).map((d) => ({ id: d.id, title: d.title, fileName: null, mimeType: d.mimeType ?? null })))); }}>Link job photos / COC</button> : null}
        </div>
        <input ref={fileInputRef} id={inputId} type="file" className="finance-attachments__file-input" accept={FINANCE_PHOTO_ACCEPT} multiple disabled={!uploadEnabled} onChange={(e) => { if (e.target.files) void uploadFiles(e.target.files); e.target.value = ''; }} />
        <input ref={cameraInputRef} id={cameraInputId} type="file" className="finance-attachments__file-input" accept="image/jpeg,image/png,image/webp,image/heic,.heic" capture="environment" disabled={!uploadEnabled} onChange={(e) => { if (e.target.files) void uploadFiles(e.target.files); e.target.value = ''; }} />
        <input ref={replaceInputRef} id={replaceInputId} type="file" className="finance-attachments__file-input" accept={FINANCE_PHOTO_ACCEPT} disabled={!uploadEnabled} onChange={(e) => {
          const file = e.target.files?.[0]; const photoId = replaceTargetRef.current; replaceTargetRef.current = null; e.target.value = '';
          if (!file || !photoId) return;
          void (async () => {
            const errMsg = validateClientPhotoFile(file); if (errMsg) { setPanelError(errMsg); return; }
            const mimeType = normaliseUploadMimeType(file);
            const target = photos.find((p) => p.id === photoId);
            if (target?.source === 'finance_direct') {
              const uploaded = await uploadDirectFile(file, newLocalId());
              await persistPhotos(replaceDocumentPhoto(photos, photoId, {
                documentationId: uploaded.fileId,
                jobId: FINANCE_DIRECT_EVIDENCE_SCOPE,
                fileName: uploaded.fileName,
                mimeType: uploaded.mimeType,
                source: 'finance_direct',
                storageKey: uploaded.storageKey,
              }));
              return;
            }
            if (!jobId) { setPanelError('Select a linked job to replace job evidence'); return; }
            const documentation = await uploadOfficeJobEvidence(accessToken, jobId, { documentationType: mimeType === 'application/pdf' ? 'document' : 'photo', title: file.name, mimeType, dataBase64: await fileToBase64(file), fileName: file.name });
            await persistPhotos(replaceDocumentPhoto(photos, photoId, { documentationId: documentation.id, jobId, fileName: file.name, mimeType }));
          })().catch((err) => setPanelError(err instanceof ApiClientError ? err.message : 'Replace failed'));
        }} />
      </div>
      {uploads.length > 0 ? (
        <ul className="finance-attachments__upload-list">
          {uploads.map((upload) => (
            <li key={upload.localId}>
              {upload.fileName} — {upload.status}
              {upload.error ? `: ${upload.error}` : ''}
              {upload.status === 'error' ? (
                <button type="button" className="titan-btn titan-btn--ghost" onClick={() => retryUpload(upload.localId)}>Retry</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="finance-attachments__list">
        {photos.map((photo, index) => (
          <li key={photo.id} className="finance-attachments__item">
            <FinanceDocumentPhotoThumbnail accessToken={accessToken} photo={photo} alt={photo.fileName} className="finance-attachments__thumb" />
            <div className="finance-attachments__meta">
              <strong>{photo.fileName}</strong>
              <input className="titan-input finance-editor-field" defaultValue={photo.caption ?? ''} disabled={disabled} onBlur={(e) => { if (e.target.value.trim() !== (photo.caption ?? '')) void persistPhotos(setDocumentPhotoCaption(photos, photo.id, e.target.value.trim())); }} />
              <label><input type="checkbox" checked={photo.includeInPdf !== false} disabled={disabled} onChange={() => void persistPhotos(setDocumentPhotoIncludeInPdf(photos, photo.id, (photo.includeInPdf ?? true) === false))} /> Include in PDF</label>
            </div>
            <div className="finance-attachments__item-actions">
              <button type="button" className="titan-btn titan-btn--ghost" disabled={disabled || index === 0} onClick={() => void persistPhotos(reorderDocumentPhoto(photos, photo.id, index - 1))}>↑</button>
              <button type="button" className="titan-btn titan-btn--ghost" disabled={disabled || index === photos.length - 1} onClick={() => void persistPhotos(reorderDocumentPhoto(photos, photo.id, index + 1))}>↓</button>
              <button type="button" className="titan-btn titan-btn--ghost" disabled={disabled} onClick={() => { replaceTargetRef.current = photo.id; replaceInputRef.current?.click(); }}>Replace</button>
              <button type="button" className="titan-btn titan-btn--ghost" disabled={disabled} onClick={() => void persistPhotos(removeDocumentPhoto(photos, photo.id))}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {showJobPicker ? (
        <div className="finance-attachments__picker">
          {jobEvidence.map((item) => (
            <div key={item.id} className="finance-attachments__picker-item">
              <span>{item.fileName ?? item.title}</span>
              <button type="button" className="titan-btn titan-btn--secondary" disabled={photos.some((p) => p.documentationId === item.id)} onClick={() => jobId && void persistPhotos(addDocumentPhoto(photos, { id: newPhotoId(), documentationId: item.id, jobId, role: 'additional', caption: item.title, fileName: item.fileName ?? item.title, mimeType: item.mimeType ?? 'application/octet-stream' }))}>Link</button>
            </div>
          ))}
          <button type="button" className="titan-btn titan-btn--ghost" onClick={() => setShowJobPicker(false)}>Close</button>
        </div>
      ) : null}
    </FinanceEditorCard>
  );
}

export { financeDirectPhotoContentUrl };
