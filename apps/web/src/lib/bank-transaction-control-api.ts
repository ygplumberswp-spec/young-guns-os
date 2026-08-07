import type { BankTransactionControlQueue } from '@titan/shared';
import { request } from './api-client';

export async function fetchBankTransactionControlQueue(
  accessToken: string,
): Promise<BankTransactionControlQueue> {
  return request<BankTransactionControlQueue>('/finance/bank-transactions/control', {
    accessToken,
  });
}
