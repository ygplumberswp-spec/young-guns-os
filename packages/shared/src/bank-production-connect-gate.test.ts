import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertProductionBankConnectBlocked,
  assertRow116SafetyGates,
  canManageProductionBankConnectGate,
  currentProductionBankGateDefault,
  evaluateProductionBankConnectGate,
} from './bank-production-connect-gate.js';

describe('Row 116 production bank-connect gate', () => {
  it('current capability → PROVIDER_UNAVAILABLE / BLOCKED; no FNB connect', () => {
    const current = currentProductionBankGateDefault('production');
    assert.equal(current.allowed, false);
    assert.equal(current.status, 'PROVIDER_UNAVAILABLE');
    assert.equal(current.mode, 'PROVIDER_UNAVAILABLE');
    assert.equal(current.connectsFnb, false);
    assert.equal(current.requestsCredentials, false);
    assert.equal(current.moneyMovement, 0);
    assert.ok(current.missingEvidence.includes('liveProviderFeedAvailable'));
    assert.throws(() => assertProductionBankConnectBlocked(current));
  });

  it('UI/config flag alone cannot bypass; credentials rejected', () => {
    const bypass = evaluateProductionBankConnectGate({
      evidence: {
        supportedProviderCapability: false,
        requiredConsentAuthMethod: false,
        securityReviewComplete: false,
        secretHandlingComplete: false,
        tenantIsolationProven: false,
        rbacProven: false,
        stagingProofComplete: false,
        noProhibitedCredentialStorage: true,
        ownerExplicitProductionApproval: false,
        uiConfigFlagAlone: true,
        environment: 'production',
      },
      legitimateProviderFeedConfigured: false,
    });
    assert.equal(bypass.allowed, false);
    assert.equal(bypass.bypassAttempted, true);

    assert.throws(() =>
      evaluateProductionBankConnectGate({
        evidence: {
          supportedProviderCapability: true,
          requiredConsentAuthMethod: true,
          securityReviewComplete: true,
          secretHandlingComplete: true,
          tenantIsolationProven: true,
          rbacProven: true,
          stagingProofComplete: true,
          noProhibitedCredentialStorage: true,
          ownerExplicitProductionApproval: true,
          environment: 'production',
        },
        legitimateProviderFeedConfigured: true,
        providerIdsPresent: ['stitch'],
        credentialPayload: { username: 'u', password: 'p' },
      }),
    );
  });

  it('ALLOWED only when live capability + full evidence; RBAC/safety', () => {
    const allowed = evaluateProductionBankConnectGate({
      evidence: {
        supportedProviderCapability: true,
        requiredConsentAuthMethod: true,
        securityReviewComplete: true,
        secretHandlingComplete: true,
        tenantIsolationProven: true,
        rbacProven: true,
        stagingProofComplete: true,
        noProhibitedCredentialStorage: true,
        ownerExplicitProductionApproval: true,
        environment: 'staging',
      },
      legitimateProviderFeedConfigured: true,
      providerIdsPresent: ['stitch'],
    });
    assert.equal(allowed.status, 'ALLOWED');
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.connectsFnb, false);

    const incomplete = evaluateProductionBankConnectGate({
      evidence: {
        supportedProviderCapability: true,
        requiredConsentAuthMethod: true,
        securityReviewComplete: true,
        secretHandlingComplete: true,
        tenantIsolationProven: true,
        rbacProven: true,
        stagingProofComplete: true,
        noProhibitedCredentialStorage: true,
        ownerExplicitProductionApproval: false,
        environment: 'production',
      },
      legitimateProviderFeedConfigured: true,
      providerIdsPresent: ['stitch'],
    });
    assert.equal(incomplete.allowed, false);
    assert.equal(incomplete.status, 'BLOCKED');

    assert.equal(canManageProductionBankConnectGate({ roleName: 'owner' }), true);
    assert.equal(canManageProductionBankConnectGate({ roleName: 'technician' }), false);
    assert.equal(assertRow116SafetyGates({ row92AutomationEnabled: false }).moneyMovement, 0);
    assert.throws(() =>
      assertRow116SafetyGates({ row92AutomationEnabled: false, fnbConnected: true }),
    );
  });
});
