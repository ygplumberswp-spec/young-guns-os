import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'content-reputation-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/content-reputation-intelligence.service.ts'),
  'utf8',
);

describe('content & reputation intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoPublish: false as const',
      'autoReply: false as const',
      'inventedScores: false as const',
      'published: false as const',
      'invented: false as const',
      'ownerEntered: true as const',
      'scraping: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + marketing permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('marketing:read'));
    assert.ok(routeSource.includes('marketing:write'));
    assert.ok(routeSource.includes('marketing_intelligence:manage'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('never auto-publishes or auto-replies', () => {
    assert.ok(!routeSource.includes('autoPublish: true'));
    assert.ok(!routeSource.includes('autoReply: true'));
    assert.ok(!serviceSource.includes('autoPublish: true'));
    assert.ok(!serviceSource.includes('autoReply: true'));
    assert.ok(serviceSource.includes('autoPublish: false'));
    assert.ok(serviceSource.includes('autoReply: false'));
  });

  it('Owner approval required for outbound drafts', () => {
    assert.ok(serviceSource.includes('canApproveContentReputationDrafts'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'content_reputation_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('cri_content_suggestion_approved'));
    assert.ok(serviceSource.includes('cri_review_response_approved'));
    assert.ok(serviceSource.includes('eq(criContentSuggestions.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(criReviews.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(criCompetitors.companyId, actor.companyId)'));
  });

  it('extends Marketing Agent drafts and optional social reviews', () => {
    assert.ok(serviceSource.includes('mktAgentContentDrafts'));
    assert.ok(serviceSource.includes('social_media_items'));
    assert.ok(serviceSource.includes('buildCriReputationSnapshot'));
    assert.ok(serviceSource.includes('scoreCriContentQuality'));
  });
});
