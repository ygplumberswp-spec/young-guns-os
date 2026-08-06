import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'social-media-integrations.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/social-media-integrations.service.ts'),
  'utf8',
);

describe('social media integrations API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoPublish: false as const',
      'autoReply: false as const',
      'livePublishAvailable: false as const',
      'liveSyncAvailable: false as const',
      'published: false as const',
      'gated: true as const',
      'demoData: false as const',
      'inventedEngagement: false as const',
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
    assert.ok(!serviceSource.includes('allowOutboundPublish: true'));
    assert.ok(!serviceSource.includes('allowAutoReply: true'));
    assert.ok(serviceSource.includes('allowOutboundPublish: false'));
    assert.ok(serviceSource.includes('allowAutoReply: false'));
  });

  it('never claims connected without credentials', () => {
    assert.ok(serviceSource.includes('Never claim connected without credentials'));
    assert.ok(serviceSource.includes("status === 'connected' && !hasCredentials"));
  });

  it('Owner approval required for outbound publish/reply', () => {
    assert.ok(serviceSource.includes('canApproveSocialOutbound'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner'));
  });

  it('links Marketing Agent drafts into gated publishing workflow', () => {
    assert.ok(serviceSource.includes('queueMarketingDraft'));
    assert.ok(serviceSource.includes('mktAgentContentDrafts'));
    assert.ok(routeSource.includes("'/outbound-drafts/queue-marketing'"));
    assert.ok(serviceSource.includes("href: '/marketing-agent'"));
  });

  it('exposes connection health without live provider verification', () => {
    assert.ok(serviceSource.includes('checkHealth'));
    assert.ok(serviceSource.includes('liveProviderVerified: false'));
    assert.ok(routeSource.includes("'/connections/health'"));
  });

  it('publish execute remains gated — live providers not wired', () => {
    assert.ok(serviceSource.includes('requestPublish'));
    assert.ok(serviceSource.includes('publish_gated'));
    assert.ok(serviceSource.includes('live social publish providers are not connected'));
  });

  it('sync foundation does not invent demo items', () => {
    assert.ok(serviceSource.includes('No demo items ingested'));
    assert.ok(serviceSource.includes("status: 'skipped'"));
    assert.ok(serviceSource.includes('itemsIngested: 0'));
  });

  it('writes security audit logs and scopes by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'social_media_integrations'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('eq(socialMediaConnections.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(socialMediaItems.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(socialMediaOutboundDrafts.companyId, actor.companyId)'));
  });
});
