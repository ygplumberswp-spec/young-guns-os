import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  facebookConnectionActionAllowed,
  normalizeFacebookConnectionUiStatus,
  resolveFacebookConnectionActionPlan,
} from './facebook-connection-actions.js';

describe('facebook connection action plan (J-6.7F)', () => {
  it('partial state exposes Grant Business Portfolio access when business permission required', () => {
    const plan = resolveFacebookConnectionActionPlan('partial', {
      needsBusinessPortfolioAccess: true,
    });
    assert.equal(plan.primary, 'grant_business_portfolio');
    assert.deepEqual(plan.secondary, ['disconnect']);
    assert.equal(facebookConnectionActionAllowed(plan, 'choose_page'), false);
  });

  it('connected_limited exposes Grant Page read access primary and hides Choose Page', () => {
    const plan = resolveFacebookConnectionActionPlan('connected_limited');
    assert.equal(plan.primary, 'grant_page_read');
    assert.deepEqual(plan.secondary, ['disconnect']);
    assert.equal(facebookConnectionActionAllowed(plan, 'choose_page'), false);
    assert.equal(facebookConnectionActionAllowed(plan, 'check_health'), false);
  });

  it('maps connected_limited connection state consistently', () => {
    assert.equal(
      normalizeFacebookConnectionUiStatus({ connectionState: 'connected_limited' }),
      'connected_limited',
    );
  });

  it('connected_limited with read permission and stored Page exposes Check health (J-6.7F13)', () => {
    const plan = resolveFacebookConnectionActionPlan('connected_limited', {
      pageStored: true,
      hasPageReadEngagement: true,
      missingContentFeatures: true,
    });
    assert.equal(plan.primary, 'check_health');
    assert.ok(plan.secondary.includes('enable_content_features'));
    assert.equal(facebookConnectionActionAllowed(plan, 'choose_page'), false);
  });

  it('partial state exposes Choose Page primary when no Page is stored', () => {
    const plan = resolveFacebookConnectionActionPlan('partial');
    assert.equal(plan.primary, 'choose_page');
    assert.deepEqual(plan.secondary, ['disconnect']);
    assert.equal(plan.tertiary.length, 0);
    assert.equal(facebookConnectionActionAllowed(plan, 'connect'), false);
    assert.equal(facebookConnectionActionAllowed(plan, 'reconnect'), false);
    assert.equal(facebookConnectionActionAllowed(plan, 'check_health'), false);
  });

  it('partial state with stored Page exposes Check health instead of Choose Page (J-6.7F13)', () => {
    const plan = resolveFacebookConnectionActionPlan('partial', {
      pageStored: true,
      missingContentFeatures: true,
    });
    assert.equal(plan.primary, 'check_health');
    assert.equal(plan.secondary.includes('choose_page'), false);
    assert.ok(plan.secondary.includes('enable_content_features'));
    assert.ok(plan.secondary.includes('reconnect'));
  });

  it('partial mismatch exposes Choose correct Page primary and hides Grant Page read access', () => {
    const plan = resolveFacebookConnectionActionPlan('partial', {
      pageSelectionMismatch: true,
    });
    assert.equal(plan.primary, 'choose_correct_page');
    assert.deepEqual(plan.secondary, ['disconnect']);
    assert.equal(facebookConnectionActionAllowed(plan, 'grant_page_read'), false);
    assert.equal(facebookConnectionActionAllowed(plan, 'check_health'), false);
    assert.equal(facebookConnectionActionAllowed(plan, 'reconnect'), false);
    assert.equal(facebookConnectionActionAllowed(plan, 'grant_business_portfolio'), false);
  });

  it('connected state exposes Check health primary with Reconnect and Disconnect secondary', () => {
    const plan = resolveFacebookConnectionActionPlan('connected');
    assert.equal(plan.primary, 'check_health');
    assert.deepEqual(plan.secondary, ['reconnect', 'disconnect']);
    assert.equal(facebookConnectionActionAllowed(plan, 'connect'), false);
    assert.equal(facebookConnectionActionAllowed(plan, 'choose_page'), false);
  });

  it('disconnected state exposes Connect primary only', () => {
    const plan = resolveFacebookConnectionActionPlan('disconnected');
    assert.equal(plan.primary, 'connect');
    assert.deepEqual(plan.secondary, []);
    assert.equal(facebookConnectionActionAllowed(plan, 'choose_page'), false);
    assert.equal(facebookConnectionActionAllowed(plan, 'check_health'), false);
  });

  it('maps partial foundation and connection states consistently', () => {
    assert.equal(
      normalizeFacebookConnectionUiStatus({ foundationStatus: 'ACCOUNT_SELECTION_REQUIRED' }),
      'partial',
    );
    assert.equal(normalizeFacebookConnectionUiStatus({ connectionState: 'partial' }), 'partial');
  });
});
