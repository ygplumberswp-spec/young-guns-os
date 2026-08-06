import type {
  BankStatementBankAccountOption,
  BankStatementColumnMapping,
  BankStatementImportPreview,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchBankStatementAccounts(
  accessToken: string,
): Promise<BankStatementBankAccountOption[]> {
  const data = await request<{ accounts: BankStatementBankAccountOption[] }>(
    '/finance/bank-statements/bank-accounts',
    { accessToken },
  );
  return data.accounts;
}

export async function detectBankStatementHeaders(
  accessToken: string,
  contentBase64: string,
): Promise<{ headers: string[]; suggestedMapping: BankStatementColumnMapping | null }> {
  return request('/finance/bank-statements/detect-headers', {
    method: 'POST',
    accessToken,
    body: { contentBase64 },
  });
}

export async function createBankStatementPreview(
  accessToken: string,
  body: {
    bankAccountCode: string;
    filename: string;
    mimeType: string;
    contentBase64: string;
    columnMapping?: BankStatementColumnMapping;
  },
): Promise<BankStatementImportPreview> {
  const data = await request<{ preview: BankStatementImportPreview }>(
    '/finance/bank-statements/preview',
    { method: 'POST', accessToken, body },
  );
  return data.preview;
}

export async function fetchBankStatementBatch(
  accessToken: string,
  batchId: string,
): Promise<BankStatementImportPreview> {
  const data = await request<{ preview: BankStatementImportPreview }>(
    `/finance/bank-statements/batches/${batchId}`,
    { accessToken },
  );
  return data.preview;
}

export async function approveBankStatementBatch(
  accessToken: string,
  batchId: string,
): Promise<BankStatementImportPreview> {
  const data = await request<{ preview: BankStatementImportPreview }>(
    `/finance/bank-statements/batches/${batchId}/approve`,
    { method: 'POST', accessToken },
  );
  return data.preview;
}

export async function revertBankStatementBatch(
  accessToken: string,
  batchId: string,
): Promise<BankStatementImportPreview> {
  const data = await request<{ preview: BankStatementImportPreview }>(
    `/finance/bank-statements/batches/${batchId}/revert`,
    { method: 'POST', accessToken },
  );
  return data.preview;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read file'));
        return;
      }
      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error('Could not encode file'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}
