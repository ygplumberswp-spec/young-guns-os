import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSmartBackFallback,
  shouldShowBackButton,
} from '../lib/back-navigation.js';

describe('resolveSmartBackFallback', () => {
  it('maps quote create to list', () => {
    assert.equal(resolveSmartBackFallback('/finance/quotes/new'), '/finance/quotes');
  });

  it('maps quote edit to detail', () => {
    assert.equal(
      resolveSmartBackFallback('/finance/quotes/abc-123/edit'),
      '/finance/quotes/abc-123',
    );
  });

  it('maps job create to jobs list', () => {
    assert.equal(resolveSmartBackFallback('/jobs/new'), '/jobs');
  });

  it('maps invoice detail to invoice list', () => {
    assert.equal(resolveSmartBackFallback('/finance/invoices/inv-1'), '/finance/invoices');
  });

  it('maps settings sub-page to settings hub', () => {
    assert.equal(resolveSmartBackFallback('/settings/team'), '/settings');
  });

  it('maps aura business rules to aura hub', () => {
    assert.equal(resolveSmartBackFallback('/aura/business-rules'), '/aura');
  });

  it('defaults unknown paths to dashboard', () => {
    assert.equal(resolveSmartBackFallback('/unknown'), '/');
  });
});

describe('shouldShowBackButton', () => {
  it('hides on dashboard', () => {
    assert.equal(shouldShowBackButton('/'), false);
  });

  it('hides on module roots', () => {
    assert.equal(shouldShowBackButton('/jobs'), false);
    assert.equal(shouldShowBackButton('/crm'), false);
    assert.equal(shouldShowBackButton('/settings'), false);
  });

  it('shows on detail and create pages', () => {
    assert.equal(shouldShowBackButton('/jobs/new'), true);
    assert.equal(shouldShowBackButton('/jobs/job-1'), true);
    assert.equal(shouldShowBackButton('/settings/team'), true);
  });

  it('excludes auth and portal routes', () => {
    assert.equal(shouldShowBackButton('/auth/login'), false);
    assert.equal(shouldShowBackButton('/my/jobs'), false);
  });

  it('shows on drafts workspace', () => {
    assert.equal(shouldShowBackButton('/drafts'), true);
  });
});
