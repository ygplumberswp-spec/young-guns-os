import { resolveStoragePath } from './storage-paths.js';

export const LOCAL_FINANCE_ATTACHMENT_STORAGE_PATH = 'storage/finance-attachments';
export const PRODUCTION_FINANCE_ATTACHMENT_STORAGE_PATH =
  '/var/lib/titan/storage/finance-attachments';

export function resolveFinanceAttachmentStoragePath(configuredPath?: string | null): string {
  return resolveStoragePath({
    configuredPath,
    localRelativeDefault: LOCAL_FINANCE_ATTACHMENT_STORAGE_PATH,
    productionAbsoluteDefault: PRODUCTION_FINANCE_ATTACHMENT_STORAGE_PATH,
    label: 'Finance attachment storage',
  });
}
