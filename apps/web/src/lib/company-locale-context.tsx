import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_COMPANY_LOCALE,
  formatDate as formatDateValue,
  formatDateTime as formatDateTimeValue,
  formatMoney as formatMoneyValue,
  formatNumber as formatNumberValue,
  formatPercent as formatPercentValue,
  formatTime as formatTimeValue,
  resolveCompanyLocale,
  type CompanyLocaleSettings,
} from '@titan/shared';
import { ApiClientError } from './api-client';
import { fetchCompanyProfile } from './company-api';
import { useAuth } from './auth-context';

type CompanyLocaleContextValue = CompanyLocaleSettings & {
  isLoading: boolean;
  logoFileId: string | null;
  companyName: string | null;
  formatMoney: (amountCents: number, currency?: string) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (value: number | string | null | undefined, fractionDigits?: number) => string;
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: string | Date) => string;
  formatTime: (value: string | Date) => string;
};

const CompanyLocaleContext = createContext<CompanyLocaleContextValue | null>(null);

export function CompanyLocaleProvider({ children }: { children: ReactNode }) {
  const { accessToken, isAuthenticated } = useAuth();
  const [locale, setLocale] = useState<CompanyLocaleSettings>(DEFAULT_COMPANY_LOCALE);
  const [logoFileId, setLogoFileId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadLocale() {
      if (!accessToken || !isAuthenticated) {
        setLocale(DEFAULT_COMPANY_LOCALE);
        setLogoFileId(null);
        setCompanyName(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const profile = await fetchCompanyProfile(accessToken);

        if (!cancelled) {
          setLocale(resolveCompanyLocale(profile.preferences));
          setLogoFileId(profile.preferences.logoFileId ?? null);
          setCompanyName(profile.name);
        }
      } catch (err) {
        if (!cancelled) {
          if (!(err instanceof ApiClientError)) {
            console.error('Unable to load company locale settings', err);
          }
          setLocale(DEFAULT_COMPANY_LOCALE);
          setLogoFileId(null);
          setCompanyName(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadLocale();

    return () => {
      cancelled = true;
    };
  }, [accessToken, isAuthenticated]);

  const formatMoney = useCallback(
    (amountCents: number, currency = locale.currency) =>
      formatMoneyValue(amountCents, currency, locale.locale),
    [locale.currency, locale.locale],
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      formatNumberValue(value, locale.locale, options),
    [locale.locale],
  );

  const formatPercent = useCallback(
    (value: number | string | null | undefined, fractionDigits = 1) =>
      formatPercentValue(value, locale.locale, fractionDigits),
    [locale.locale],
  );

  const formatDate = useCallback(
    (value: string | Date, options?: Intl.DateTimeFormatOptions) =>
      formatDateValue(value, locale.locale, locale.timezone, options),
    [locale.locale, locale.timezone],
  );

  const formatDateTime = useCallback(
    (value: string | Date) => formatDateTimeValue(value, locale.locale, locale.timezone),
    [locale.locale, locale.timezone],
  );

  const formatTime = useCallback(
    (value: string | Date) => formatTimeValue(value, locale.locale, locale.timezone),
    [locale.locale, locale.timezone],
  );

  const value = useMemo<CompanyLocaleContextValue>(
    () => ({
      ...locale,
      isLoading,
      logoFileId,
      companyName,
      formatMoney,
      formatNumber,
      formatPercent,
      formatDate,
      formatDateTime,
      formatTime,
    }),
    [
      locale,
      isLoading,
      logoFileId,
      companyName,
      formatMoney,
      formatNumber,
      formatPercent,
      formatDate,
      formatDateTime,
      formatTime,
    ],
  );

  return <CompanyLocaleContext.Provider value={value}>{children}</CompanyLocaleContext.Provider>;
}

export function useCompanyLocale() {
  const context = useContext(CompanyLocaleContext);

  if (!context) {
    throw new Error('useCompanyLocale must be used within CompanyLocaleProvider');
  }

  return context;
}
