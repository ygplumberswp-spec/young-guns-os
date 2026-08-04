import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react';
import type { DocumentPhoto } from '@titan/shared';
import {
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
  saveTitanDocumentDraft,
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
    accessToken, documentType, quoteId, invoiceId, jobId, customerId, documentNumber,
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

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (disabled || !jobId) { setPanelError('Select a linked job before uploading'); return; }
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
        const documentation = await uploadOfficeJobEvidence(accessToken, jobId, {
          documentationType: mimeType === 'application/pdf' ? 'document' : 'photo',
          title: file.name, mimeType, dataBase64: await fileToBase64(file), fileName: file.name, clientActionId: localId,
        });
        await persistPhotos(addDocumentPhoto(photos, {
          id: newPhotoId(), documentationId: documentation.id, jobId, role: 'additional', caption: null, fileName: file.name, mimeType,
        }));
        failedFilesRef.current.delete(localId);
      } catch (err) {
        setUploads((prev) => prev.map((item) => item.localId === localId ? { ...item, status: 'error', error: err instanceof ApiClientError ? err.message : 'Upload failed' } : item));
        continue;
      }
      setUploads((prev) => prev.filter((item) => item.localId !== localId));
    }
  }, [accessToken, disabled, jobId, persistPhotos, photos]);

  const retryUpload = useCallback((localId: string) => {
    const file = failedFilesRef.current.get(localId);
    if (!file) return;
    setUploads((prev) => prev.filter((item) => item.localId !== localId));
    void uploadFiles([file]);
  }, [uploadFiles]);

  return (
    <FinanceEditorCard title="Photos & Attachments" description="Job evidence storage with document-engine photo references." className="finance-editor-card--full finance-editor-card--attachments">
      {panelError ? <p className="finance-attachments__inline-error">{panelError}</p> : null}
      {!jobId ? <p className="finance-editor-muted">Link a job to upload or attach photos and files.</p> : null}
      <div className={`finance-attachments__dropzone${isDragging ? ' finance-attachments__dropzone--active' : ''}`}
        onDragOver={(e) => e.preventDefault()} onDragEnter={() => setIsDragging(true)} onDragLeave={() => setIsDragging(false)}
        onDrop={(e: DragEvent) => { e.preventDefault(); setIsDragging(false); void uploadFiles(e.dataTransfer.files); }}>
        <div className="finance-attachments__actions">
          <button type="button" className="titan-btn titan-btn--secondary" disabled={disabled || !jobId} onClick={() => fileInputRef.current?.click()}>Choose files</button>
          <button type="button" className="titan-btn titan-btn--secondary" disabled={disabled || !jobId} onClick={() => cameraInputRef.current?.click()}>Take photo</button>
          {jobId ? <button type="button" className="titan-btn titan-btn--ghost" disabled={disabled} onClick={() => { setShowJobPicker(true); void fetchJobExecution(accessToken, jobId).then((execution) => setJobEvidence(execution.evidence.filter((d) => d.hasBinary).map((d) => ({ id: d.id, title: d.title, fileName: null, mimeType: d.mimeType ?? null })))); }}>Link job photos / COC</button> : null}
        </div>
        <input ref={fileInputRef} id={inputId} type="file" className="finance-attachments__file-input" accept={FINANCE_PHOTO_ACCEPT} multiple disabled={disabled || !jobId} onChange={(e) => { if (e.target.files) void uploadFiles(e.target.files); e.target.value = ''; }} />
        <input ref={cameraInputRef} id={cameraInputId} type="file" className="finance-attachments__file-input" accept="image/jpeg,image/png,image/webp,image/heic,.heic" capture="environment" disabled={disabled || !jobId} onChange={(e) => { if (e.target.files) void uploadFiles(e.target.files); e.target.value = ''; }} />
        <input ref={replaceInputRef} id={replaceInputId} type="file" className="finance-attachments__file-input" accept={FINANCE_PHOTO_ACCEPT} disabled={disabled || !jobId} onChange={(e) => {
          const file = e.target.files?.[0]; const photoId = replaceTargetRef.current; replaceTargetRef.current = null; e.target.value = '';
          if (!file || !photoId || !jobId) return;
          void (async () => {
            const errMsg = validateClientPhotoFile(file); if (errMsg) { setPanelError(errMsg); return; }
            const mimeType = normaliseUploadMimeType(file);
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
