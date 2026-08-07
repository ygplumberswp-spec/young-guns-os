/** UX-B closure: binary evidence upload/retrieval contracts and offline action flush contracts. */
import type { MobileDocumentationType } from './mobile-workforce.js';
import type { EvidenceAttachmentCategory } from './universal-evidence-upload.js';

export type JobEvidencePhase = 'before' | 'during' | 'after' | 'signature' | 'document';

export type UploadJobEvidenceRequest = {
  documentationType: MobileDocumentationType;
  title: string;
  mimeType: string;
  /** Base64-encoded binary payload, optionally with a data-URL prefix. Never persisted verbatim. */
  dataBase64: string;
  fileName?: string;
  evidencePhase?: JobEvidencePhase;
  /** Universal attachment category (before/after/slip/COC/etc.). */
  attachmentCategory?: EvidenceAttachmentCategory | null;
  /**
   * Client/portal visibility. Defaults false — internal slips/receipts/evidence
   * must never auto-expose to the Client.
   */
  clientVisible?: boolean;
  metadata?: Record<string, unknown>;
  clientActionId?: string;
  signerName?: string;
  signerRole?: string;
  acknowledgement?: boolean;
};

export type JobEvidenceContentResponse = {
  mimeType: string;
  dataBase64: string;
  fileName: string | null;
};

/** Client-originated offline action kinds accepted by the offline flush endpoint. */
export type OfflineActionType =
  | 'transition'
  | 'note'
  | 'time_entry'
  | 'material_line'
  | 'checklist_update'
  | 'evidence_upload';

export type OfflineActionResultStatus = 'synced' | 'failed' | 'duplicate';

export type OfflineActionInput = {
  clientActionId: string;
  actionType: OfflineActionType;
  jobId: string;
  payload: Record<string, unknown>;
};

export type FlushOfflineActionsRequest = {
  actions: OfflineActionInput[];
};

export type OfflineActionResult = {
  clientActionId: string;
  actionType: OfflineActionType;
  status: OfflineActionResultStatus;
  resultId?: string;
  error?: string;
};

export type FlushOfflineActionsResponse = {
  results: OfflineActionResult[];
};
