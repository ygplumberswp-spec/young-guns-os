import type {
  CashFlowIntelligence,
  PayablesIntelligence,
  ReceivablesIntelligence,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchReceivablesIntelligence(
  accessToken: string,
): Promise<ReceivablesIntelligence> {
  const data = await request<{ receivables: ReceivablesIntelligence }>(
    '/finance-intelligence/receivables',
    { accessToken },
  );
  return data.receivables;
}

export async function fetchPayablesIntelligence(
  accessToken: string,
): Promise<PayablesIntelligence> {
  const data = await request<{ payables: PayablesIntelligence }>(
    '/finance-intelligence/payables',
    { accessToken },
  );
  return data.payables;
}

export async function fetchCashFlowIntelligence(
  accessToken: string,
): Promise<CashFlowIntelligence> {
  const data = await request<{ cashFlow: CashFlowIntelligence }>(
    '/finance-intelligence/cashflow',
    { accessToken },
  );
  return data.cashFlow;
}
