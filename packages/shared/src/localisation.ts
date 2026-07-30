import type { CompanyPreferences } from './company.js';

export type CompanyLocaleSettings = {
  country: string;
  currency: string;
  currencySymbol: string;
  locale: string;
  timezone: string;
};

/** Default locale for new South African tenants; overridable per company. */
export const DEFAULT_COMPANY_LOCALE: CompanyLocaleSettings = {
  country: 'South Africa',
  currency: 'ZAR',
  currencySymbol: 'R',
  locale: 'en-ZA',
  timezone: 'Africa/Johannesburg',
};

export const DEFAULT_COMPANY_PREFERENCES: CompanyPreferences = {
  timezone: DEFAULT_COMPANY_LOCALE.timezone,
  currency: DEFAULT_COMPANY_LOCALE.currency,
  locale: DEFAULT_COMPANY_LOCALE.locale,
};

export function resolveCompanyLocale(
  preferences?: CompanyPreferences | null,
): CompanyLocaleSettings {
  return {
    country: DEFAULT_COMPANY_LOCALE.country,
    currency: preferences?.currency?.trim() || DEFAULT_COMPANY_LOCALE.currency,
    locale: preferences?.locale?.trim() || DEFAULT_COMPANY_LOCALE.locale,
    timezone: preferences?.timezone?.trim() || DEFAULT_COMPANY_LOCALE.timezone,
    currencySymbol: getCurrencySymbol(
      preferences?.currency?.trim() || DEFAULT_COMPANY_LOCALE.currency,
      preferences?.locale?.trim() || DEFAULT_COMPANY_LOCALE.locale,
    ),
  };
}

export function getCurrencySymbol(
  currency: string,
  locale = DEFAULT_COMPANY_LOCALE.locale,
): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);

    return parts.find((part) => part.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

export function formatMoney(
  amountCents: number,
  currency = DEFAULT_COMPANY_LOCALE.currency,
  locale = DEFAULT_COMPANY_LOCALE.locale,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(amountCents / 100);
  } catch {
    const symbol = getCurrencySymbol(currency, locale);
    const amount = (amountCents / 100).toFixed(2).replace('.', ',');
    return `${symbol} ${amount}`;
  }
}

export function formatNumber(
  value: number,
  locale = DEFAULT_COMPANY_LOCALE.locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatPercent(
  value: number | string | null | undefined,
  locale = DEFAULT_COMPANY_LOCALE.locale,
  fractionDigits = 1,
): string {
  if (value == null || value === '') {
    return '—';
  }

  const numeric = typeof value === 'string' ? Number(value) : value;

  if (Number.isNaN(numeric)) {
    return String(value);
  }

  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numeric / 100);
}

export function formatDate(
  value: string | Date,
  locale = DEFAULT_COMPANY_LOCALE.locale,
  timezone = DEFAULT_COMPANY_LOCALE.timezone,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  },
): string {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone }).format(date);
}

export function formatDateTime(
  value: string | Date,
  locale = DEFAULT_COMPANY_LOCALE.locale,
  timezone = DEFAULT_COMPANY_LOCALE.timezone,
): string {
  return formatDate(value, locale, timezone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(
  value: string | Date,
  locale = DEFAULT_COMPANY_LOCALE.locale,
  timezone = DEFAULT_COMPANY_LOCALE.timezone,
): string {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date);
}
