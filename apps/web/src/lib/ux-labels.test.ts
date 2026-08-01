import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UX_INVENTORY_LABELS, UX_NAV_LABELS, UX_NAV_RENAME_MAP } from './ux-labels.js';

describe('ux-labels', () => {
  it('exposes canonical enterprise nav labels', () => {
    assert.equal(UX_NAV_LABELS.liveDispatch, 'Live Dispatch');
    assert.equal(UX_NAV_LABELS.auraTeam, 'AURA Team');
    assert.equal(UX_NAV_LABELS.teamAndAccess, 'Team & Access');
  });

  it('maps legacy labels to canonical names', () => {
    assert.equal(UX_NAV_RENAME_MAP['Dispatcher console'], 'Live Dispatch');
    assert.equal(UX_NAV_RENAME_MAP['Owner AI Chat'], 'AURA Executive Chat');
  });

  it('uses Stock history for inventory movements tab', () => {
    assert.equal(UX_INVENTORY_LABELS.stockHistory, 'Stock history');
  });
});
