import type {
  CreateInvoiceWriteApprovalRequest,
  ExecuteInvoiceWriteApprovalResult,
  InvoiceWriteApprovalSummary,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchPendingInvoiceWriteApprovals(
  accessToken: string,
): Promise<InvoiceWriteApprovalSummary[]> {
  const data = await request<{ approvals: InvoiceWriteApprovalSummary[] }>('/finance/write-approvals', {
    accessToken,
  });
  return data.approvals;
}

export async function fetchInvoiceWriteApproval(
  accessToken: string,
  approvalId: string,
): Promise<InvoiceWriteApprovalSummary> {
  const data = await request<{ approval: InvoiceWriteApprovalSummary }>(
    `/finance/write-approvals/${approvalId}`,
    { accessToken },
  );
  return data.approval;
}

export async function createInvoiceWriteApproval(
  accessToken: string,
  invoiceId: string,
  body: CreateInvoiceWriteApprovalRequest,
): Promise<InvoiceWriteApprovalSummary> {
  const data = await request<{ approval: InvoiceWriteApprovalSummary }>(
    `/finance/invoices/${invoiceId}/write-approvals`,
    { method: 'POST', accessToken, body },
  );
  return data.approval;
}

export async function approveInvoiceWriteApproval(
  accessToken: string,
  approvalId: string,
): Promise<InvoiceWriteApprovalSummary> {
  const data = await request<{ approval: InvoiceWriteApprovalSummary }>(
    `/finance/write-approvals/${approvalId}/approve`,
    { method: 'POST', accessToken, body: {} },
  );
  return data.approval;
}

export async function rejectInvoiceWriteApproval(
  accessToken: string,
  approvalId: string,
  reason?: string,
): Promise<InvoiceWriteApprovalSummary> {
  const data = await request<{ approval: InvoiceWriteApprovalSummary }>(
    `/finance/write-approvals/${approvalId}/reject`,
    { method: 'POST', accessToken, body: { reason } },
  );
  return data.approval;
}

export async function executeInvoiceWriteApproval(
  accessToken: string,
  approvalId: string,
  clientActionId: string,
): Promise<ExecuteInvoiceWriteApprovalResult> {
  return request<ExecuteInvoiceWriteApprovalResult>(`/finance/write-approvals/${approvalId}/execute`, {
    method: 'POST',
    accessToken,
    body: { clientActionId },
  });
}
