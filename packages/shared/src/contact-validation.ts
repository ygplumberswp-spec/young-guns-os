/** South African mobile / WhatsApp normalisation and validation for Young Guns ops. */

const SA_MOBILE_DIGITS = /^(?:\+?27|0)(6|7|8)\d{8}$/;

export function normalizeSaMobile(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/[^\d+]/g, '');
  const onlyDigits = digits.startsWith('+') ? digits.slice(1) : digits.replace(/\D/g, '');

  let national: string | null = null;
  if (onlyDigits.startsWith('27') && onlyDigits.length === 11) {
    national = onlyDigits.slice(2);
  } else if (onlyDigits.startsWith('0') && onlyDigits.length === 10) {
    national = onlyDigits.slice(1);
  } else if (onlyDigits.length === 9 && /^(6|7|8)/.test(onlyDigits)) {
    national = onlyDigits;
  }

  if (!national || !/^(6|7|8)\d{8}$/.test(national)) {
    return null;
  }

  return `+27${national}`;
}

export function isValidSaMobile(input: string | null | undefined): boolean {
  if (input == null || !input.trim()) return false;
  const normalized = normalizeSaMobile(input);
  if (!normalized) return false;
  return (
    SA_MOBILE_DIGITS.test(normalized.replace(/\s/g, '')) || /^\+27[678]\d{8}$/.test(normalized)
  );
}

/** Accepts SA mobile or landline in national / +27 form for CRM contact fields. */
export function normalizeSaPhone(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const mobile = normalizeSaMobile(trimmed);
  if (mobile) return mobile;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('27') && digits.length === 11) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return `+27${digits.slice(1)}`;
  }
  return null;
}

export function isValidSaPhone(input: string | null | undefined): boolean {
  return normalizeSaPhone(input) != null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function isValidEmailAddress(input: string | null | undefined): boolean {
  if (input == null) return false;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return EMAIL_RE.test(trimmed);
}

const PLACEHOLDER_LOCAL_PARTS = new Set([
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'placeholder',
  'unknown',
  'test',
  'demo',
  'null',
  'na',
  'n/a',
]);

const PLACEHOLDER_DOMAINS = new Set([
  'youngguns.co.za',
  'younggunsplumbing.co.za',
  'youngguns.plumbing',
  'example.com',
  'example.org',
  'test.com',
  'localhost',
  'invalid',
  'email.com',
  'mailinator.com',
]);

const COMPANY_PLACEHOLDER_PREFIXES = ['xero+', 'import+', 'placeholder+', 'yg+', 'titan+'];

/**
 * Flags Young Guns / company / import placeholder emails as not customer-verified.
 * Does not reject the value — callers should warn and avoid treating as verified contact.
 */
export function isPlaceholderEmail(input: string | null | undefined): boolean {
  if (!isValidEmailAddress(input)) return false;
  const email = input!.trim().toLowerCase();
  const [local = '', domain = ''] = email.split('@');
  const localBase = local.split('+')[0] ?? local;

  if (PLACEHOLDER_LOCAL_PARTS.has(localBase)) return true;
  if (PLACEHOLDER_DOMAINS.has(domain)) return true;
  if (COMPANY_PLACEHOLDER_PREFIXES.some((prefix) => local.startsWith(prefix))) return true;
  if (domain.endsWith('.invalid') || domain.endsWith('.local')) return true;
  if (/^customer\d*$/.test(localBase) && domain.includes('youngguns')) return true;

  return false;
}

export function formatAddressLine(parts: {
  street?: string | null;
  unit?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
}): string {
  const line1 = [parts.unit ? `Unit ${parts.unit}` : null, parts.street].filter(Boolean).join(', ');
  const line2 = [parts.suburb, parts.city, parts.province, parts.postalCode]
    .filter((part) => part && String(part).trim())
    .join(', ');
  return [line1, line2].filter(Boolean).join(' — ');
}
