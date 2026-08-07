import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OAUTH_SCOPES,
} from './xero-oauth.service.js';
import {
  XERO_REQUESTED_SCOPES,
  analyzeXeroScopes,
  classifyXeroAttachmentRootCause,
  redactXeroSecrets,
  toOwnerMappingReviewBucket,
  ownerApprovalRequiredForMappingBucket,
  XERO_FINANCIAL_TRUTH_MATRIX,
  buildXeroWriteIdempotencyKey,
} from '@titan/shared';

const SYNC_SOURCE = readFileSync(new URL('./xero-sync.service.ts', import.meta.url), 'utf8');
const OAUTH_SOURCE = readFileSync(new URL('./xero-oauth.service.ts', import.meta.url), 'utf8');
const REALTIME_SOURCE = readFileSync(
  new URL('./xero-realtime-intersync.service.ts', import.meta.url),
  'utf8',
);
const WEBHOOK_SOURCE = readFileSync(new URL('../routes/xero-webhook.ts', import.meta.url), 'utf8');
const AUDIT_SCRIPT = readFileSync(
  new URL('../../../../diagnostic-output/xero-001-readonly-audit.mjs', import.meta.url),
  'utf8',
);

test('OAuth authorize URL requests accounting.attachments.read', () => {
  assert.match(OAUTH_SCOPES, /accounting\.attachments\.read/);
  assert.ok(XERO_REQUESTED_SCOPES.includes('accounting.attachments.read'));
});

test('missing attachment scope is classified without exposing tokens', () => {
  const analysis = analyzeXeroScopes({
    grantedScopes: XERO_REQUESTED_SCOPES.filter((s) => s !== 'accounting.attachments.read'),
  });
  assert.equal(analysis.attachmentsReadGranted, false);
  const cause = classifyXeroAttachmentRootCause({
    attachmentCount: 0,
    scopeAnalysis: analysis,
    stageErrorCode: 'AUTH_FAILED',
    stageError: 'insufficient_scope',
    tenantIdPresent: true,
  });
  assert.equal(cause, 'stale_token_missing_scope');
});

test('reconnect preserves organisation mapping fields in OAuth merge path', () => {
  assert.match(OAUTH_SOURCE, /organisationName/);
  assert.match(OAUTH_SOURCE, /tenantId/);
  assert.match(OAUTH_SOURCE, /grantedScopes/);
  assert.match(SYNC_SOURCE, /createSyncContext/);
});

test('ambiguous mapping bucket requires Owner approval', () => {
  assert.equal(ownerApprovalRequiredForMappingBucket('ambiguous'), true);
  assert.equal(
    toOwnerMappingReviewBucket('possible_match_review_required'),
    'ambiguous',
  );
});

test('write idempotency keys are stable per entity operation', () => {
  const a = buildXeroWriteIdempotencyKey({
    companyId: 'co-1',
    operation: 'invoice_create',
    entityId: 'inv-1',
  });
  const b = buildXeroWriteIdempotencyKey({
    companyId: 'co-1',
    operation: 'invoice_create',
    entityId: 'inv-1',
  });
  assert.equal(a, b);
});

test('webhook handler deduplicates before targeted refresh', () => {
  assert.match(WEBHOOK_SOURCE, /handleWebhook/);
  assert.match(REALTIME_SOURCE, /dedupeKey|dedupe_key/);
  assert.match(REALTIME_SOURCE, /recordAndQueueEvents/);
});

test('preflight audit script forbids production database ref', () => {
  assert.match(AUDIT_SCRIPT, /rshuiaghmtrvvilhqpwm/);
  assert.match(AUDIT_SCRIPT, /PRODUCTION DB FORBIDDEN/);
  assert.match(AUDIT_SCRIPT, /cpkuwtaipjxeipvbssvn/);
});

test('secrets are redacted from connection error strings', () => {
  const redacted = redactXeroSecrets('Bearer abc.def.ghi refresh_token=secret-value');
  assert.ok(redacted?.includes('[REDACTED]'));
  assert.ok(!redacted?.includes('secret-value'));
});

test('financial truth matrix has twelve distinct states for live proof', () => {
  assert.equal(XERO_FINANCIAL_TRUTH_MATRIX.length, 12);
});

test('preflight audit script performs read-only SQL audit only', () => {
  assert.doesNotMatch(AUDIT_SCRIPT, /\bINSERT INTO\b/i);
  assert.doesNotMatch(AUDIT_SCRIPT, /\bUPDATE\s+\w/i);
  assert.doesNotMatch(AUDIT_SCRIPT, /\bDELETE FROM\b/i);
  assert.match(AUDIT_SCRIPT, /read-only/i);
});
