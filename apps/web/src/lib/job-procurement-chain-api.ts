import { request } from './api-client';

export type JobProcurementChainCreateResult = {
  chain: {
    id: string;
    jobId: string | null;
    status: string;
    purchasePath: string;
  };
  purchaseOrder: {
    id: string;
    status: string;
  };
  idempotentReplay?: boolean;
  createsXeroWrite: false;
};

export type JobProcurementChainDetail = {
  chain: {
    id: string;
    jobId: string | null;
    status: string;
    purchasePath: string;
    warnings?: string[];
  };
  links: Array<{
    id: string;
    purchaseOrderId: string | null;
    purchaseOrderLineId: string | null;
    supplierId: string | null;
    quantity: string | number | null;
    unitPriceCents: number | null;
  }>;
  purchaseOrderId?: string | null;
};

export function createJobProcurementChainFromProposal(
  accessToken: string,
  body: {
    proposalId: string;
    proposalLineId: string;
    purchasePath?: 'DIRECT_TO_JOB' | 'STOCK';
    clientActionId?: string | null;
  },
) {
  return request<JobProcurementChainCreateResult>('/finance/job-procurement-chains/from-proposal', {
    method: 'POST',
    accessToken,
    body,
  });
}

export function fetchJobProcurementChain(accessToken: string, chainId: string) {
  return request<JobProcurementChainDetail>(`/finance/job-procurement-chains/${chainId}`, {
    accessToken,
  });
}

export function recordJobProcurementDelivery(
  accessToken: string,
  chainId: string,
  body: {
    deliveredQuantity: number | null;
    deliveredAt?: string | null;
    deliveryReference?: string | null;
  },
) {
  return request(`/finance/job-procurement-chains/${chainId}/delivery`, {
    method: 'POST',
    accessToken,
    body,
  });
}

export function recordJobProcurementSupplierInvoice(
  accessToken: string,
  chainId: string,
  body: {
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    sourceDocumentRef?: string | null;
    lineQuantity?: number | null;
    lineCostCents?: number | null;
    vatBasis?: 'INCLUSIVE' | 'EXCLUSIVE' | 'UNKNOWN' | null;
  },
) {
  return request(`/finance/job-procurement-chains/${chainId}/supplier-invoice`, {
    method: 'POST',
    accessToken,
    body,
  });
}

export function projectJobProcurementXeroBill(
  accessToken: string,
  chainId: string,
  body?: { knownXeroBillId?: string | null; knownXeroInvoiceId?: string | null },
) {
  return request(`/finance/job-procurement-chains/${chainId}/xero-project`, {
    method: 'POST',
    accessToken,
    body: body ?? {},
  });
}

export function postJobProcurementMaterialCost(
  accessToken: string,
  chainId: string,
  body?: {
    materialUseTransactionId?: string | null;
    stockReceiptMovementId?: string | null;
  },
) {
  return request(`/finance/job-procurement-chains/${chainId}/post-material-cost`, {
    method: 'POST',
    accessToken,
    body: body ?? {},
  });
}
