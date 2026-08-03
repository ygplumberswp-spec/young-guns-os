import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMktAgentAnalyticsFromCounts,
  buildMktAgentContentTemplate,
  canAccessMarketingAgent,
  canApproveMarketingAgentPublish,
  canWriteMarketingAgent,
  emptyMktAgentEngagement,
  listDefaultMktAgentContentTemplates,
  listMktAgentAuraConnections,
  MKT_AGENT_PRODUCT_COPY,
} from './marketing-agent.js';

describe('marketing agent foundation', () => {
  it('RBAC: marketing perms; Technician/Client denied; Owner approves publish', () => {
    assert.equal(
      canAccessMarketingAgent({
        roleName: 'Manager',
        permissions: ['marketing:read'],
      }),
      true,
    );
    assert.equal(
      canAccessMarketingAgent({
        roleName: 'Technician',
        permissions: ['*', 'marketing:write'],
      }),
      false,
    );
    assert.equal(
      canAccessMarketingAgent({
        roleName: 'Client',
        permissions: ['marketing:read'],
      }),
      false,
    );
    assert.equal(
      canWriteMarketingAgent({
        roleName: 'Manager',
        permissions: ['marketing:read'],
      }),
      false,
    );
    assert.equal(
      canWriteMarketingAgent({
        roleName: 'Manager',
        permissions: ['marketing:write'],
      }),
      true,
    );
    assert.equal(
      canApproveMarketingAgentPublish({
        roleName: 'Manager',
        permissions: ['marketing:write'],
      }),
      false,
    );
    assert.equal(
      canApproveMarketingAgentPublish({
        roleName: 'Company Owner',
        permissions: ['marketing:write'],
      }),
      true,
    );
    assert.equal(
      canApproveMarketingAgentPublish({
        roleName: 'Manager',
        permissions: ['marketing_intelligence:manage'],
      }),
      true,
    );
  });

  it('content templates are drafts — never claim published posts', () => {
    const caption = buildMktAgentContentTemplate({
      contentKind: 'caption',
      topicHint: 'blocked drain',
    });
    assert.equal(caption.contentKind, 'caption');
    assert.ok(caption.body.includes('draft') || caption.body.includes('Draft'));
    assert.ok(caption.body.toLowerCase().includes('not') || caption.body.includes('Owner'));
    assert.ok(caption.hashtags.length > 0);

    const tip = buildMktAgentContentTemplate({ contentKind: 'plumbing_tip' });
    assert.equal(tip.industry, 'educational');

    const templates = listDefaultMktAgentContentTemplates();
    assert.ok(templates.length >= 6);
  });

  it('analytics never invent engagement numbers', () => {
    const engagement = emptyMktAgentEngagement();
    assert.equal(engagement.availability, 'unavailable');
    assert.equal(engagement.impressions, null);
    assert.equal(engagement.clicks, null);
    assert.equal(engagement.engagements, null);

    const analytics = buildMktAgentAnalyticsFromCounts({
      campaignCount: 0,
      draftCount: 0,
      pendingApprovals: 0,
      approvedDrafts: 0,
      rejectedDrafts: 0,
      activeGoals: 0,
      pendingRecommendations: 0,
    });
    assert.equal(analytics.engagement.availability, 'unavailable');
    assert.equal(analytics.engagement.impressions, null);
    assert.equal(analytics.opportunities.length, 0);
  });

  it('AURA connections are honest stubs/links', () => {
    const connections = listMktAgentAuraConnections();
    assert.ok(connections.some((c) => c.target === 'command_centre'));
    assert.ok(connections.some((c) => c.target === 'communication_timeline'));
    assert.ok(MKT_AGENT_PRODUCT_COPY.socialIntegrations.includes('not live'));
  });
});
