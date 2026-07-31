import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLIENT_PORTAL_CANONICAL_BASE,
  assertPortalLoginRedirectIsSafe,
  composeNestedNavigateTarget,
  portalHrefMatchesLocation,
  portalLoginRedirectHref,
  toAppAbsoluteHref,
  toCanonicalPortalPath,
  toPortalNestedHref,
} from './portal-routing.js';

describe('portal routing nest helpers', () => {
  it('escapes nest base with wouter ~ for app-absolute hrefs', () => {
    assert.equal(toAppAbsoluteHref('/my/login'), '~/my/login');
    assert.equal(toAppAbsoluteHref('~/my/login'), '~/my/login');
  });

  it('converts absolute portal hrefs to nest-relative paths for /my and /portal', () => {
    assert.equal(toPortalNestedHref('/my'), '/');
    assert.equal(toPortalNestedHref('/my/'), '/');
    assert.equal(toPortalNestedHref('/my/jobs'), '/jobs');
    assert.equal(toPortalNestedHref('/my/finance'), '/finance');
    assert.equal(toPortalNestedHref('/portal'), '/');
    assert.equal(toPortalNestedHref('/portal/jobs'), '/jobs');
  });

  it('rewrites legacy /portal paths to canonical /my', () => {
    assert.equal(toCanonicalPortalPath('/portal'), '/my');
    assert.equal(toCanonicalPortalPath('/portal/'), '/my');
    assert.equal(toCanonicalPortalPath('/portal/jobs'), '/my/jobs');
    assert.equal(toCanonicalPortalPath('/portal/login'), '/my/login');
    assert.equal(toCanonicalPortalPath('/my/jobs'), '/my/jobs');
  });

  it('matches nest-relative locations against absolute portal hrefs', () => {
    assert.equal(portalHrefMatchesLocation('/my', '/'), true);
    assert.equal(portalHrefMatchesLocation('/my/jobs', '/jobs'), true);
    assert.equal(portalHrefMatchesLocation('/portal/jobs', '/jobs'), true);
    assert.equal(portalHrefMatchesLocation('/my/jobs', '/quotes'), false);
  });

  it('never composes /my/my/login from the protected-route redirect', () => {
    assert.equal(portalLoginRedirectHref(), '~/my/login');
    assert.equal(composeNestedNavigateTarget('/my', '/my/login'), '/my/my/login');
    assert.equal(assertPortalLoginRedirectIsSafe('/my'), '/my/login');
    assert.equal(composeNestedNavigateTarget('/my', portalLoginRedirectHref()), '/my/login');
    assert.equal(CLIENT_PORTAL_CANONICAL_BASE, '/my');
  });
});
