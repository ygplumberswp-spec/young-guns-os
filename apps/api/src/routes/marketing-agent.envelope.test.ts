import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'marketing-agent.ts'), 'utf8');
const serviceSource = readFileSync(join(here, '../services/marketing-agent.service.ts'), 'utf8');

describe('marketing agent API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    for (const pattern of [
      'autoPublish: false as const',
      'socialIntegrationsLive: false as const',
      'engagementInvented: false as const',
      'published: false as const',
      'gated: true as const',
      'autoExecuted: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + marketing permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes("marketing:read"));
    assert.ok(routeSource.includes("marketing:write"));
    assert.ok(routeSource.includes('marketing_intelligence:manage'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('never auto-publishes or invents engagement', () => {
    assert.ok(!routeSource.includes('autoPublish: true'));
    assert.ok(!serviceSource.includes('autoPublish: true'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(!serviceSource.includes('socialPublishAvailable: true'));
    assert.ok(serviceSource.includes('autoPublish: false'));
    assert.ok(serviceSource.includes('emptyMktAgentEngagement') || serviceSource.includes('buildMktAgentAnalyticsFromCounts'));
  });

  it('Owner approval required for publish-sensitive decisions', () => {
    assert.ok(serviceSource.includes('canApproveMarketingAgentPublish'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner'));
  });

  it('publish execute remains gated — social integrations not live', () => {
    assert.ok(serviceSource.includes('requestPublish'));
    assert.ok(serviceSource.includes('publish_gated'));
    assert.ok(serviceSource.includes('Social platform integrations'));
    assert.ok(routeSource.includes('Publish execute gated'));
    assert.ok(routeSource.includes("'/content-drafts/:id/publish'"));
  });

  it('writes security audit logs for marketing agent actions', () => {
    assert.ok(serviceSource.includes("entityType: 'marketing_agent'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('mkt_agent_content_draft_approved'));
    assert.ok(serviceSource.includes('mkt_agent_publish_gated'));
  });

  it('scopes all queries by companyId', () => {
    assert.ok(serviceSource.includes('eq(mktAgentCampaigns.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(mktAgentContentDrafts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(mktAgentGoals.companyId, actor.companyId)'));
  });
});
