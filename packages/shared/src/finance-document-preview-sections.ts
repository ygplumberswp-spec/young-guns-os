/**
 * Finance preview section visibility, URL validation and photo grouping.
 * Pure helpers — no persistence or provider calls.
 */

import type { CocAttachmentState, DocumentPhotoRole } from './document-engine.js';
import type { FinanceDocumentPreviewAttachment, FinanceDocumentPreviewKind } from './finance-document-preview.js';
import { buildReviewQrSvg } from './qr-code.js';
import { isYocoPaymentUrl } from './yoco-payment-links.js';

export type FinancePreviewCocInput = CocAttachmentState;

export type FinancePreviewWarrantyInput = {
  text: string;
  months?: number | null;
};

export type FinancePreviewMaintenanceInput = {
  text?: string | null;
  items?: Array<{ label?: string; description?: string }>;
};

const INVOICE_PAYMENT_VISIBLE_STATUSES = new Set(['sent', 'paid', 'partial', 'overdue']);
const REVIEW_VISIBLE_STATUSES = new Set(['sent', 'paid', 'partial', 'overdue']);

export function normalizeFinancePreviewStatus(status: string | null | undefined): string {
  return (status?.trim() || 'draft').toLowerCase();
}

/** Draft previews hide bank details unless explicitly overridden. */
export function shouldHideFinancePreviewPaymentOptions(input: {
  kind: FinanceDocumentPreviewKind;
  status?: string | null;
  showPaymentDetails?: boolean | null;
}): boolean {
  if (input.kind !== 'invoice') return true;
  if (input.showPaymentDetails === true) return false;
  if (input.showPaymentDetails === false) return true;
  const status = normalizeFinancePreviewStatus(input.status);
  return !INVOICE_PAYMENT_VISIBLE_STATUSES.has(status);
}

export function shouldShowFinancePreviewReviewSection(input: {
  kind: FinanceDocumentPreviewKind;
  status?: string | null;
}): boolean {
  if (input.kind !== 'invoice') return false;
  return REVIEW_VISIBLE_STATUSES.has(normalizeFinancePreviewStatus(input.status));
}

export function shouldShowFinancePreviewWorkCompleted(input: {
  kind: FinanceDocumentPreviewKind;
  workCompleted?: string | null;
}): boolean {
  const text = input.workCompleted?.trim();
  if (!text) return false;
  return input.kind === 'invoice';
}

export function shouldShowFinancePreviewWarranty(warranty?: FinancePreviewWarrantyInput | null): boolean {
  return Boolean(warranty?.text?.trim());
}

export function shouldShowFinancePreviewMaintenance(
  maintenance?: FinancePreviewMaintenanceInput | null,
): boolean {
  if (!maintenance) return false;
  if (maintenance.text?.trim()) return true;
  return (maintenance.items ?? []).some((item) => (item.label ?? item.description ?? '').trim());
}

export function shouldShowFinancePreviewCoc(
  kind: FinanceDocumentPreviewKind,
  coc?: FinancePreviewCocInput | null,
): boolean {
  if (kind !== 'invoice' || !coc) return false;
  return coc.status === 'attached';
}

export function isGoogleReviewUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return (
    host.includes('google.') ||
    host === 'g.page' ||
    host.endsWith('.g.page') ||
    host === 'maps.app.goo.gl' ||
    host.endsWith('.app.goo.gl')
  );
}

export function sanitizeFinancePreviewPaymentUrl(value: unknown): string | null {
  return isYocoPaymentUrl(value) ? value.trim() : null;
}

export function sanitizeFinancePreviewReviewUrl(value: unknown): string | null {
  return isGoogleReviewUrl(value) ? value.trim() : null;
}

export function buildFinancePreviewReviewQrSvg(reviewUrl: string | null): string | null {
  if (!reviewUrl) return null;
  try {
    return buildReviewQrSvg(reviewUrl);
  } catch {
    return null;
  }
}

export function groupFinancePreviewAttachments(attachments: readonly FinanceDocumentPreviewAttachment[]): {
  before: FinanceDocumentPreviewAttachment[];
  after: FinanceDocumentPreviewAttachment[];
  additional: FinanceDocumentPreviewAttachment[];
  files: FinanceDocumentPreviewAttachment[];
} {
  const before: FinanceDocumentPreviewAttachment[] = [];
  const after: FinanceDocumentPreviewAttachment[] = [];
  const additional: FinanceDocumentPreviewAttachment[] = [];
  const files: FinanceDocumentPreviewAttachment[] = [];

  for (const item of attachments) {
    if (!item.mimeType.startsWith('image/')) {
      files.push(item);
      continue;
    }
    if (item.role === 'before') before.push(item);
    else if (item.role === 'after') after.push(item);
    else additional.push(item);
  }

  return { before, after, additional, files };
}

export function financePreviewPhotoSectionTitle(input: {
  before: readonly unknown[];
  after: readonly unknown[];
  additional: readonly unknown[];
}): string {
  if (input.before.length > 0 || input.after.length > 0) return 'Before & After Photos';
  return 'Supporting Photos';
}

export function formatVerifiedWebsiteDisplay(website: string | null | undefined): string | null {
  const trimmed = website?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

export type DocumentPhotoRoleInput = DocumentPhotoRole;
