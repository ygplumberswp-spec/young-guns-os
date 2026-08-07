import type { CompanyPreferences, CompanyProfile } from './company.js';

/** Dedicated BrowserStack / automated QA tenant slug (staging only). */
export const AUDIT_SANDBOX_SLUG = 'titan-audit-sandbox';

export const AUDIT_SANDBOX_COMPANY_NAME = 'TITAN Audit Sandbox';

export const AUDIT_SANDBOX_INDUSTRY = 'General Field Services';

export const AUDIT_SANDBOX_BANNER_TEXT =
  'STAGING AUDIT SANDBOX — NO REAL BUSINESS DATA';

export const AUDIT_SANDBOX_RECORD_PREFIX = '[AUDIT]';

export const AUDIT_SANDBOX_EMAIL_DOMAIN = 'titan-staging.test';

export const AUDIT_SANDBOX_USER_EMAILS = {
  owner: `audit.owner@${AUDIT_SANDBOX_EMAIL_DOMAIN}`,
  dispatcher: `audit.dispatcher@${AUDIT_SANDBOX_EMAIL_DOMAIN}`,
  technician: `audit.technician@${AUDIT_SANDBOX_EMAIL_DOMAIN}`,
  client: `audit.client@${AUDIT_SANDBOX_EMAIL_DOMAIN}`,
} as const;

/** Production Supabase project ref — provisioning must refuse this target. */
export const FORBIDDEN_PRODUCTION_PROJECT_REF = 'rshuiaghmtrvvilhqpwm';

/** Staging Supabase project ref — LIVE-001 / staging scripts must target only this. */
export const REQUIRED_STAGING_PROJECT_REF = 'cpkuwtaipjxeipvbssvn';

export type AuditSandboxPreferences = CompanyPreferences;

export function isForbiddenProductionDatabaseUrl(databaseUrl: string): boolean {
  return databaseUrl.toLowerCase().includes(FORBIDDEN_PRODUCTION_PROJECT_REF);
}

export function isRequiredStagingDatabaseUrl(databaseUrl: string): boolean {
  return databaseUrl.toLowerCase().includes(REQUIRED_STAGING_PROJECT_REF);
}

export function isAuditSandboxSlug(slug: string | null | undefined): boolean {
  return slug?.trim().toLowerCase() === AUDIT_SANDBOX_SLUG;
}

export function isAuditSandboxProfile(
  profile: Pick<CompanyProfile, 'slug' | 'preferences'> | null | undefined,
): boolean {
  if (!profile) return false;
  if (isAuditSandboxSlug(profile.slug)) return true;
  return profile.preferences?.auditSandbox === true;
}

export function resolveAuditSandboxBanner(
  profile: Pick<CompanyProfile, 'slug' | 'preferences'> | null | undefined,
): string | null {
  if (!isAuditSandboxProfile(profile)) return null;
  return profile?.preferences?.auditSandboxBanner?.trim() || AUDIT_SANDBOX_BANNER_TEXT;
}

export function auditSandboxOutboundBlocked(
  profile: Pick<CompanyProfile, 'slug' | 'preferences'> | null | undefined,
): boolean {
  if (!isAuditSandboxProfile(profile)) return false;
  return profile?.preferences?.auditSandboxOutboundBlocked !== false;
}

export function defaultAuditSandboxPreferences(): AuditSandboxPreferences {
  return {
    timezone: 'Africa/Johannesburg',
    currency: 'ZAR',
    locale: 'en-ZA',
    aiTone: 'professional',
    auditSandbox: true,
    auditSandboxBanner: AUDIT_SANDBOX_BANNER_TEXT,
    auditSandboxPurpose: 'BrowserStack and automated QA only',
    auditSandboxOutboundBlocked: true,
    auditSandboxMfaDisabled: true,
    notes: `${AUDIT_SANDBOX_RECORD_PREFIX} Synthetic tenant — no real business data.`,
  };
}
