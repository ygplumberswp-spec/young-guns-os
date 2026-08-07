import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AURA_AGENT_NETWORK_GUARANTEES, AURA_NETWORK_CATALOG, AURA_NETWORK_EXAMPLE_FLOW,
  isAllowedContextDomain, isForbiddenContextDomain, isSensitiveNetworkApprovalType,
  messageRequiresOwnerApproval,
} from './aura-agent-network.js';

describe('AURA Agent Network', () => {
  it('preserves mandatory guarantees and Command Centre extension', () => {
    assert.equal(AURA_AGENT_NETWORK_GUARANTEES.extendsCommandCentreRegistry, true);
    assert.equal(AURA_AGENT_NETWORK_GUARANTEES.autoExecuted, false);
    assert.equal(AURA_AGENT_NETWORK_GUARANTEES.neverSourcesPersonalWhatsappPrivate, true);
  });
  it('has executive plus ten specialist agents', () => assert.equal(AURA_NETWORK_CATALOG.length, 11));
  it('blocks private personal WhatsApp context', () => {
    assert.equal(isForbiddenContextDomain('personal_wa_private'), true);
    assert.equal(isAllowedContextDomain('finance'), true);
  });
  it('requires approval for handoffs and sensitive actions', () => {
    assert.equal(messageRequiresOwnerApproval('handoff'), true);
    assert.equal(isSensitiveNetworkApprovalType('financial_action'), true);
  });
  it('documents the finance executive communication draft flow', () => {
    assert.deepEqual(AURA_NETWORK_EXAMPLE_FLOW.from, 'finance');
    assert.equal(AURA_NETWORK_EXAMPLE_FLOW.through, 'executive');
    assert.equal(AURA_NETWORK_EXAMPLE_FLOW.outcome, 'communication_draft');
  });
});
