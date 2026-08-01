export type JobDocumentPackStatus =
  | 'draft'
  | 'internal_review'
  | 'approved_for_sending'
  | 'sent'
  | 'cancelled';

export type JobDocumentPackDeliveryState = 'not_sent' | 'portal_shared' | 'send_blocked';

export type JobDocumentPackChannel = 'portal' | 'email' | 'whatsapp';

export type JobDocumentPackItemType =
  | 'job_document'
  | 'quotation'
  | 'invoice'
  | 'certificate'
  | 'compliance_report'
  | 'photo_evidence';

export const JOB_DOCUMENT_PACK_STATUS_OPTIONS: Array<{
  value: JobDocumentPackStatus;
  label: string;
}> = [
  { value: 'draft', label: 'Draft' },
  { value: 'internal_review', label: 'Internal review' },
  { value: 'approved_for_sending', label: 'Approved for sending' },
  { value: 'sent', label: 'Sent' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const JOB_DOCUMENT_PACK_CHANNEL_OPTIONS: Array<{
  value: JobDocumentPackChannel;
  label: string;
}> = [
  { value: 'portal', label: 'Customer portal' },
  { value: 'email', label: 'Email (requires provider)' },
  { value: 'whatsapp', label: 'WhatsApp (requires provider)' },
];

export const JOB_DOCUMENT_PACK_DELIVERY_STATE_OPTIONS: Array<{
  value: JobDocumentPackDeliveryState;
  label: string;
}> = [
  { value: 'not_sent', label: 'Not sent' },
  { value: 'portal_shared', label: 'Shared on portal' },
  { value: 'send_blocked', label: 'Send path not available' },
];

export type JobDocumentPackItemInput = {
  documentId: string;
  itemType?: JobDocumentPackItemType;
  label?: string | null;
};

export type JobDocumentPackItemDetail = {
  id: string;
  documentId: string | null;
  itemType: JobDocumentPackItemType;
  label: string;
  position: number;
  fileName: string | null;
  documentTitle: string | null;
};

export type JobDocumentPackSummary = {
  id: string;
  packNumber: string;
  title: string;
  status: JobDocumentPackStatus;
  deliveryChannel: JobDocumentPackChannel;
  deliveryState: JobDocumentPackDeliveryState;
  jobId: string;
  jobTitle: string | null;
  customerId: string;
  customerName: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
};

export type JobDocumentPackDetail = JobDocumentPackSummary & {
  notes: string | null;
  approvedAt: string | null;
  items: JobDocumentPackItemDetail[];
};

export type CreateJobDocumentPackRequest = {
  jobId: string;
  title: string;
  notes?: string | null;
  deliveryChannel?: JobDocumentPackChannel;
  items?: JobDocumentPackItemInput[];
  clientActionId?: string | null;
};

export type UpdateJobDocumentPackRequest = {
  title?: string;
  notes?: string | null;
  deliveryChannel?: JobDocumentPackChannel;
  items?: JobDocumentPackItemInput[];
};

export type SendJobDocumentPackRequest = {
  clientActionId: string;
};

const EDITABLE_PACK_STATUSES = new Set<JobDocumentPackStatus>([
  'draft',
  'internal_review',
  'approved_for_sending',
]);

export function canEditJobDocumentPack(pack: { status: JobDocumentPackStatus }): boolean {
  return EDITABLE_PACK_STATUSES.has(pack.status);
}

export function canSendJobDocumentPack(pack: { status: JobDocumentPackStatus }): boolean {
  return pack.status === 'approved_for_sending';
}

export function nextJobDocumentPackApprovalAction(
  status: JobDocumentPackStatus,
): { label: string; nextStatus: JobDocumentPackStatus } | null {
  if (status === 'draft') {
    return { label: 'Submit for internal review', nextStatus: 'internal_review' };
  }
  if (status === 'internal_review') {
    return { label: 'Approve for sending', nextStatus: 'approved_for_sending' };
  }
  return null;
}

export function formatJobDocumentPackDeliveryState(
  deliveryState: JobDocumentPackDeliveryState,
): string {
  return (
    JOB_DOCUMENT_PACK_DELIVERY_STATE_OPTIONS.find((option) => option.value === deliveryState)
      ?.label ?? deliveryState
  );
}

export function inferPackItemTypeFromDocument(input: {
  title: string;
  fileName: string;
  categoryName?: string | null;
}): JobDocumentPackItemType {
  const haystack = `${input.title} ${input.fileName} ${input.categoryName ?? ''}`.toLowerCase();
  if (haystack.includes('coc') || haystack.includes('certificate') || haystack.includes('compliance')) {
    return haystack.includes('report') ? 'compliance_report' : 'certificate';
  }
  if (haystack.includes('invoice')) return 'invoice';
  if (haystack.includes('quote') || haystack.includes('quotation')) return 'quotation';
  if (haystack.includes('photo') || haystack.includes('jpg') || haystack.includes('png')) {
    return 'photo_evidence';
  }
  return 'job_document';
}

export function portalAccessTypeForPackItem(
  itemType: JobDocumentPackItemType,
): 'invoice' | 'quotation' | 'certificate' | 'compliance_report' | 'job_card' {
  switch (itemType) {
    case 'invoice':
      return 'invoice';
    case 'quotation':
      return 'quotation';
    case 'certificate':
      return 'certificate';
    case 'compliance_report':
      return 'compliance_report';
    default:
      return 'job_card';
  }
}
