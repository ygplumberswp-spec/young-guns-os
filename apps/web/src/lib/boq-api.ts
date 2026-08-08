import { request } from './api-client';
import type {
  BoqDocumentDetail,
  BoqDocumentSummary,
  ConvertBoqToQuoteRequest,
  CreateBoqDocumentRequest,
  UpdateBoqDocumentRequest,
} from '@titan/shared';

export async function fetchBoqDocuments(
  accessToken: string,
  query?: { q?: string; status?: string },
): Promise<BoqDocumentSummary[]> {
  const params = new URLSearchParams();
  if (query?.q?.trim()) params.set('q', query.q.trim());
  if (query?.status?.trim()) params.set('status', query.status.trim());
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await request<{ documents: BoqDocumentSummary[] }>(`/boq${suffix}`, { accessToken });
  return data.documents;
}

export async function fetchBoqDocument(accessToken: string, id: string): Promise<BoqDocumentDetail> {
  const data = await request<{ document: BoqDocumentDetail }>(`/boq/${id}`, { accessToken });
  return data.document;
}

export async function createBoqDocument(
  accessToken: string,
  body: CreateBoqDocumentRequest,
): Promise<BoqDocumentSummary> {
  const data = await request<{ document: BoqDocumentSummary }>('/boq', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.document;
}

export async function updateBoqDocument(
  accessToken: string,
  id: string,
  body: UpdateBoqDocumentRequest,
): Promise<BoqDocumentDetail> {
  const data = await request<{ document: BoqDocumentDetail }>(`/boq/${id}`, {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.document;
}

export async function convertBoqToQuote(
  accessToken: string,
  id: string,
  body: ConvertBoqToQuoteRequest,
) {
  const data = await request<{ quote: { id: string } }>(`/boq/${id}/convert-to-quote`, {
    method: 'POST',
    accessToken,
    body,
  });
  return data.quote;
}

export type BoqWorkbookImportDetail = {
  import: {
    id: string;
    originalFilename: string;
    fileHashSha256: string;
    revisionLabel: string | null;
    importVersion: number;
    status: string;
    sheetOrder: string[];
    warnings: string[];
    auraNarrativeFacts: string[];
  };
  sheets: Array<{ id: string; sheetName: string; sheetOrder: number }>;
  rows: Array<{
    id: string;
    sheetName: string;
    originalRowNumber: number;
    sectionLabel: string | null;
    rowKind: string;
    itemCode: string | null;
    description: string | null;
    unit: string | null;
    quantity: string | null;
    formulaText: string | null;
    displayValue: string | null;
    warnings: string[];
    reviewState: string;
  }>;
  automaticPricing: false;
  supplierMatching: false;
  idempotentReplay?: boolean;
};

export async function importBoqWorkbook(
  accessToken: string,
  body: {
    originalFilename: string;
    contentBase64: string;
    revisionLabel?: string | null;
    clientActionId?: string | null;
  },
): Promise<BoqWorkbookImportDetail> {
  const data = await request<BoqWorkbookImportDetail>('/finance/boq-imports', {
    method: 'POST',
    accessToken,
    body,
  });
  return data;
}

export async function fetchBoqWorkbookImport(
  accessToken: string,
  importId: string,
): Promise<BoqWorkbookImportDetail> {
  const data = await request<BoqWorkbookImportDetail>(`/finance/boq-imports/${importId}`, {
    accessToken,
  });
  return data;
}

export type SupplierQuoteMatchDetail = {
  import: {
    id: string;
    originalFilename: string;
    fileHashSha256: string;
    supplierName: string | null;
    status: string;
    auraNarrativeFacts: string[];
  };
  lines: Array<{
    id: string;
    clientKey: string;
    supplierSku: string | null;
    description: string | null;
    unit: string | null;
    quantity: string | null;
    unitPriceCents: number | null;
    vatBasis: string;
  }>;
  proposals: Array<{
    id: string;
    proposalKey: string;
    matchState: string;
    signalsUsed: string[];
    warnings: string[];
    boqImportRowId: string | null;
    supplierSku: string | null;
    description: string | null;
    unitPriceCents: number | null;
    vatBasis: string;
    humanConfirmed: boolean;
  }>;
  catalogueMutation: false;
  quotePriceMutation: false;
  idempotentReplay?: boolean;
};

export async function runSupplierQuoteBoqMatch(
  accessToken: string,
  boqImportId: string,
  body: {
    originalFilename: string;
    supplierName?: string | null;
    revisionLabel?: string | null;
    clientActionId?: string | null;
    supplierLines: Array<{
      clientKey: string;
      sourceLineOrder: number;
      supplierSku?: string | null;
      description?: string | null;
      unit?: string | null;
      quantity?: number | null;
      packSize?: number | null;
      unitPriceCents?: number | null;
      vatBasis?: 'INCLUSIVE' | 'EXCLUSIVE' | 'UNKNOWN' | null;
      currency?: string | null;
    }>;
  },
): Promise<SupplierQuoteMatchDetail> {
  const data = await request<SupplierQuoteMatchDetail>(
    `/finance/boq-imports/${boqImportId}/supplier-quote-matches`,
    { method: 'POST', accessToken, body },
  );
  return data;
}

export async function fetchSupplierQuoteMatch(
  accessToken: string,
  importId: string,
): Promise<SupplierQuoteMatchDetail> {
  const data = await request<SupplierQuoteMatchDetail>(
    `/finance/supplier-quote-imports/${importId}`,
    { accessToken },
  );
  return data;
}

export async function confirmSupplierQuoteMatchProposal(
  accessToken: string,
  importId: string,
  proposalId: string,
) {
  return request(`/finance/supplier-quote-imports/${importId}/proposals/${proposalId}/confirm`, {
    method: 'POST',
    accessToken,
  });
}

export async function rejectSupplierQuoteMatchProposal(
  accessToken: string,
  importId: string,
  proposalId: string,
) {
  return request(`/finance/supplier-quote-imports/${importId}/proposals/${proposalId}/reject`, {
    method: 'POST',
    accessToken,
  });
}

export type BoqSupplierComparisonDetail = {
  comparison: {
    rows: Array<{
      boqImportRowId: string;
      sheetName: string;
      originalRowNumber: number;
      itemCode: string | null;
      description: string | null;
      unit: string | null;
      quantity: number | null;
      missingSupplierOffer: boolean;
      mismatchFlags: string[];
      cheapestEligibleOfferKey: string | null;
      cheapestEligibleCostCents: number | null;
      humanReviewRequired: boolean;
      offers: Array<{
        offerKey: string;
        supplierName: string;
        supplierDocumentRef: string | null;
        sourceLineOrder: number;
        supplierSku: string | null;
        description: string | null;
        unit: string | null;
        quantity: number | null;
        packSize: number | null;
        unitPriceCents: number | null;
        vatBasis: string;
        deliveryCents: number | null;
        deliveryKnown: boolean;
        validTo: string | null;
        exclusions: string | null;
        isSubstitute: boolean;
        matchState: string;
        matchConfidenceScore: number;
        mismatchFlags: string[];
        commercialCostCents: number | null;
        eligibleForAutoRank: boolean;
        warnings: string[];
      }>;
    }>;
    automaticPurchaseExecution: false;
    row99Immutable: true;
    row100EvidencePreserved: true;
    auraNarrativeFacts: string[];
  };
  purchaseOrdersCreated: 0;
  xeroBillsCreated: 0;
};

export type SplitPurchaseProposalDetail = {
  proposal: {
    id: string;
    status: string;
    supplierSubtotalCents: number | null;
    vatCents: number | null;
    deliveryCents: number | null;
    totalProposedPurchasingCostCents: number | null;
    totalsIncomplete: boolean;
    missingFields: string[];
    warnings: string[];
    auraNarrativeFacts: string[];
  };
  lines: Array<{
    id: string;
    boqImportRowId: string;
    offerKey: string;
    supplierName: string;
    quantityProposed: string | null;
    unitPriceCents: number | null;
    vatBasis: string;
    expectedSupplierCostCents: number | null;
    mismatchFlags: string[];
    isSubstitute: boolean;
  }>;
  createsPurchaseOrder: false;
  createsXeroBill: false;
  mutatesBoqSource: false;
  mutatesCatalogueOrQuotePrice?: false;
  idempotentReplay?: boolean;
};

export async function fetchBoqSupplierComparison(
  accessToken: string,
  boqImportId: string,
): Promise<BoqSupplierComparisonDetail> {
  const data = await request<BoqSupplierComparisonDetail>(
    `/finance/boq-imports/${boqImportId}/supplier-comparison`,
    { accessToken },
  );
  return data;
}

export async function createSplitPurchaseProposal(
  accessToken: string,
  boqImportId: string,
  body: {
    selections?: Array<{
      boqImportRowId: string;
      offerKey: string;
      quantityProposed?: number | null;
    }>;
    preferEligibleCheapest?: boolean;
    clientActionId?: string | null;
    status?: string;
  },
): Promise<SplitPurchaseProposalDetail> {
  const data = await request<SplitPurchaseProposalDetail>(
    `/finance/boq-imports/${boqImportId}/split-purchase-proposals`,
    { method: 'POST', accessToken, body },
  );
  return data;
}

export async function updateSplitPurchaseProposal(
  accessToken: string,
  proposalId: string,
  body: {
    selections?: Array<{
      boqImportRowId: string;
      offerKey: string;
      quantityProposed?: number | null;
    }>;
    status?: string;
  },
): Promise<SplitPurchaseProposalDetail> {
  const data = await request<SplitPurchaseProposalDetail>(
    `/finance/split-purchase-proposals/${proposalId}`,
    { method: 'PATCH', accessToken, body },
  );
  return data;
}

export type BoqExportReadinessDetail = {
  readiness: {
    allowed: boolean;
    blockers: string[];
    labelledDraftPreview: boolean;
    auraNarrativeFacts: string[];
  };
  clientSafe: {
    mode: string;
    labelledDraftPreview: boolean;
    sheetOrder: string[];
    excludesSupplierCost: true;
    excludesMarginGp: true;
    excludesSplitPurchaseInternals: true;
  };
  provenance: {
    boqImportId: string;
    originalFilename: string;
    importVersion: number;
    revisionLabel: string | null;
    hasNewerRevision: boolean;
    status: string;
  };
};

export type BoqReviewedExportResult = {
  export: {
    id: string;
    format: string;
    mode: string;
    labelledDraftPreview: boolean;
    contentFingerprintSha256: string;
    mimeType: string;
    byteLength: number;
    importVersion: number;
  };
  contentBase64: string | null;
  idempotentReplay?: boolean;
  createsPurchaseOrder: false;
  mutatesBoqSource?: false;
  excludesSupplierCost?: true;
};

export async function fetchBoqExportReadiness(
  accessToken: string,
  boqImportId: string,
  mode: 'DRAFT_PREVIEW' | 'REVIEWED_FINAL' = 'DRAFT_PREVIEW',
): Promise<BoqExportReadinessDetail> {
  const data = await request<BoqExportReadinessDetail>(
    `/finance/boq-imports/${boqImportId}/export-readiness?mode=${mode}`,
    { accessToken },
  );
  return data;
}

export async function exportReviewedBoq(
  accessToken: string,
  boqImportId: string,
  body: {
    format: 'XLSX' | 'PDF';
    mode: 'DRAFT_PREVIEW' | 'REVIEWED_FINAL';
    clientActionId?: string | null;
  },
): Promise<BoqReviewedExportResult> {
  const data = await request<BoqReviewedExportResult>(
    `/finance/boq-imports/${boqImportId}/exports`,
    { method: 'POST', accessToken, body },
  );
  return data;
}

export async function markBoqImportReviewed(accessToken: string, boqImportId: string) {
  return request(`/finance/boq-imports/${boqImportId}/mark-reviewed`, {
    method: 'POST',
    accessToken,
  });
}

export function downloadBase64File(base64: string, filename: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
