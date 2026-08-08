import { request } from './api-client';

export type BankFeedConnectionCard = {
  title: string;
  mode: string;
  status: string;
  maskedAccount: string | null;
  lastSuccessfulIntakeAt: string | null;
  lastAttemptedIntakeAt: string | null;
  primaryAction: 'CONNECT_PROVIDER' | 'IMPORT_STATEMENT' | 'DISCONNECT' | 'NONE';
  connectedClaim: boolean;
};

export type BankFeedConnectionResponse = {
  id: string;
  companyId: string;
  bankName: string;
  provider: string;
  mode: string;
  status: string;
  maskedAccountIdentity: string | null;
  currency: string | null;
  lastAttemptedIntakeAt: string | null;
  lastSuccessfulIntakeAt: string | null;
  statusReason: string | null;
  card: BankFeedConnectionCard;
};

export type BankFeedCapabilityResponse = {
  capability: {
    liveProviderFeedAvailable: boolean;
    mode: string;
    reason: string;
    csvImportAvailable: boolean;
    xlsxImportAvailable: boolean;
    pdfOcrAvailable: boolean;
  };
  xlsx: { xlsxImportAvailable: false; fallback: string };
};

export function fetchBankFeedCapability(accessToken: string) {
  return request<BankFeedCapabilityResponse>('/finance/bank-feed/capability', {
    accessToken,
  });
}

export function fetchBankFeedConnection(accessToken: string) {
  return request<BankFeedConnectionResponse>('/finance/bank-feed/connection', {
    accessToken,
  });
}
