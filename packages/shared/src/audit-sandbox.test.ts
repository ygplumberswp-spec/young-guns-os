import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUDIT_SANDBOX_BANNER_TEXT,
  AUDIT_SANDBOX_SLUG,
  AUDIT_SANDBOX_USER_EMAILS,
  FORBIDDEN_PRODUCTION_PROJECT_REF,
  auditSandboxOutboundBlocked,
  defaultAuditSandboxPreferences,
  isAuditSandboxProfile,
  isForbiddenProductionDatabaseUrl,
  resolveAuditSandboxBanner,
} from './audit-sandbox.js';

describe('audit sandbox guards (QA-0)', () => {
  it('refuses production Supabase project ref', () => {
    assert.equal(
      isForbiddenProductionDatabaseUrl(
        `postgresql://postgres.${FORBIDDEN_PRODUCTION_PROJECT_REF}:x@pooler.supabase.com:5432/postgres`,
      ),
      true,
    );
    assert.equal(
      isForbiddenProductionDatabaseUrl(
        'postgresql://postgres.staging-ref:x@aws-0-region.pooler.supabase.com:5432/postgres',
      ),
      false,
    );
  });

  it('detects audit sandbox by slug or preference flag', () => {
    assert.equal(isAuditSandboxProfile({ slug: AUDIT_SANDBOX_SLUG, preferences: {} }), true);
    assert.equal(
      isAuditSandboxProfile({ slug: 'other', preferences: { auditSandbox: true } }),
      true,
    );
    assert.equal(isAuditSandboxProfile({ slug: 'young-guns', preferences: {} }), false);
  });

  it('resolves banner text for sandbox tenants', () => {
    assert.equal(
      resolveAuditSandboxBanner({ slug: AUDIT_SANDBOX_SLUG, preferences: {} }),
      AUDIT_SANDBOX_BANNER_TEXT,
    );
    assert.equal(resolveAuditSandboxBanner({ slug: 'other', preferences: {} }), null);
  });

  it('blocks outbound actions by default in audit sandbox', () => {
    assert.equal(
      auditSandboxOutboundBlocked({ slug: AUDIT_SANDBOX_SLUG, preferences: {} }),
      true,
    );
    assert.equal(auditSandboxOutboundBlocked({ slug: 'other', preferences: {} }), false);
  });

  it('uses fixed staging-only audit email addresses', () => {
    assert.match(AUDIT_SANDBOX_USER_EMAILS.owner, /@titan-staging\.test$/);
    assert.match(AUDIT_SANDBOX_USER_EMAILS.client, /@titan-staging\.test$/);
  });

  it('seeds default sandbox preferences with MFA disabled flag', () => {
    const prefs = defaultAuditSandboxPreferences();
    assert.equal(prefs.auditSandbox, true);
    assert.equal(prefs.auditSandboxMfaDisabled, true);
    assert.equal(prefs.auditSandboxOutboundBlocked, true);
  });
});
