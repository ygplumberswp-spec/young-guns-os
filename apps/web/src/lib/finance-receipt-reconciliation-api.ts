import type { ReceiptReconciliationControlQueue } from '@titan/shared';
import { request } from './api-client';

export async function fetchReceiptReconciliationControlQueue(
  accessToken: string,
): Promise<ReceiptReconciliationControlQueue> {
  return request<ReceiptReconciliationControlQueue>('/finance/receipts/control', {
    accessToken,
  });
}
