import { normalizeSaMobile } from './contact-validation.js';

/** Build a WhatsApp deep link for SA numbers — opens chat, never sends automatically. */
export function buildWhatsAppHref(phone: string | null | undefined): string | null {
  const normalized = phone ? normalizeSaMobile(phone) : null;
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

/** Build mailto link — user agent handles compose; TITAN never sends email directly from list rows. */
export function buildEmailHref(
  email: string | null | undefined,
  subject?: string,
): string | null {
  const trimmed = email?.trim();
  if (!trimmed || !trimmed.includes('@')) return null;
  const params = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `mailto:${trimmed}${params}`;
}

export function formatListMoney(cents: number, currency = 'ZAR'): string {
  if (cents <= 0) return '—';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
