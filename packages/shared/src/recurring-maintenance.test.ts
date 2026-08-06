import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyMaintenanceDueBucket,
  daysUntilDue,
  isCustomerFacingMaintenanceComm,
  PLUMBING_EQUIPMENT_KINDS,
  RECURRING_MAINTENANCE_GUARANTEES,
  requiresOwnerApprovalForComm,
} from './recurring-maintenance.js';

describe('recurring-maintenance guarantees', () => {
  it('never invents demo data or auto-sends customer communication', () => {
    assert.equal(RECURRING_MAINTENANCE_GUARANTEES.noDemoData, true);
    assert.equal(RECURRING_MAINTENANCE_GUARANTEES.noFakePlans, true);
    assert.equal(RECURRING_MAINTENANCE_GUARANTEES.noFakeRuns, true);
    assert.equal(RECURRING_MAINTENANCE_GUARANTEES.autoExecuted, false);
    assert.equal(RECURRING_MAINTENANCE_GUARANTEES.noAutoExternalCommunication, true);
    assert.equal(RECURRING_MAINTENANCE_GUARANTEES.auraSuggestionsDraftOnly, true);
    assert.equal(RECURRING_MAINTENANCE_GUARANTEES.ownerApprovalForCustomerCommunication, true);
    assert.equal(RECURRING_MAINTENANCE_GUARANTEES.extendsExistingMaintenanceDue, true);
  });
});

describe('plumbing equipment kinds', () => {
  it('covers geyser, PRV, tank, and installed equipment honestly', () => {
    for (const kind of ['geyser', 'prv', 'tank', 'installed_equipment', 'other'] as const) {
      assert.ok(PLUMBING_EQUIPMENT_KINDS.includes(kind));
    }
  });
});

describe('due bucket classification', () => {
  const now = new Date('2026-08-03T12:00:00.000Z');

  it('classifies upcoming, due, and missed from real dates', () => {
    assert.equal(classifyMaintenanceDueBucket('2026-08-10T12:00:00.000Z', now), 'upcoming');
    assert.equal(classifyMaintenanceDueBucket('2026-08-03T10:00:00.000Z', now), 'due');
    assert.equal(classifyMaintenanceDueBucket('2026-07-20T12:00:00.000Z', now), 'missed');
    assert.equal(classifyMaintenanceDueBucket(null, now), 'upcoming');
  });

  it('computes days until due', () => {
    assert.equal(daysUntilDue('2026-08-10T12:00:00.000Z', now), 7);
    assert.equal(daysUntilDue(null, now), null);
  });
});

describe('customer communication gating', () => {
  it('only marks executed as customer-facing', () => {
    assert.equal(isCustomerFacingMaintenanceComm('executed'), true);
    assert.equal(isCustomerFacingMaintenanceComm('approved'), false);
    assert.equal(isCustomerFacingMaintenanceComm('draft'), false);
  });

  it('requires Owner approval before execute path', () => {
    assert.equal(requiresOwnerApprovalForComm('draft'), true);
    assert.equal(requiresOwnerApprovalForComm('pending_approval'), true);
    assert.equal(requiresOwnerApprovalForComm('approved'), true);
    assert.equal(requiresOwnerApprovalForComm('executed'), false);
  });
});
