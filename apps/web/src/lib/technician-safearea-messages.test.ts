/**
 * Technician Field Mobile — safe-area + Messages/Notifications + Performance delta.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TECHNICIAN_ROLE_NAME, COMPANY_OWNER_ROLE_NAME } from '@titan/auth/browser';
import {
  TECHNICIAN_FIELD_MESSAGES_PATH,
  TECHNICIAN_NAV_ITEMS,
  TECHNICIAN_NOTIFICATIONS_PATH,
  TECHNICIAN_PERFORMANCE_PATH,
} from '@titan/shared';
import {
  evaluateTechnicianDirectUrl,
  isTechnicianForbiddenMobilePath,
} from './role-forbidden-direct-url.js';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return readFileSync(join(webRoot, rel), 'utf8');
}

describe('Technician Field Mobile safe-area + Messages delta', () => {
  it('portal-header owns safe-area-inset-top/left/right (not wiped by mobile padding shorthand)', () => {
    const css = read('index.css');
    const html = read('../index.html');
    assert.match(html, /viewport-fit=cover/);
    assert.match(html, /black-translucent/);
    assert.match(
      css,
      /\.portal-header\s*\{[\s\S]*padding-top:\s*calc\(0\.75rem \+ env\(safe-area-inset-top/,
    );
    assert.match(css, /\.portal-header\s*\{[\s\S]*padding-left:\s*max\([^;]*safe-area-inset-left/);
    assert.match(css, /\.portal-header\s*\{[\s\S]*padding-right:\s*max\([^;]*safe-area-inset-right/);
    assert.match(css, /position:\s*sticky/);
    // Regression: mobile portal-header block must keep calc'd safe-area (no shorthand wipe)
    const mobileHeader = css.match(
      /@media \(max-width: 720px\)\s*\{[\s\S]*?\.portal-header\s*\{([\s\S]*?)\}/,
    );
    assert.ok(mobileHeader, '720px portal-header block missing');
    assert.match(mobileHeader[1]!, /padding-top:\s*calc\([^;]*safe-area-inset-top/);
    assert.doesNotMatch(mobileHeader[1]!, /padding:\s*0\.75rem/);
  });

  it('Messages and Notifications are distinct routes and pages', () => {
    const hrefs = TECHNICIAN_NAV_ITEMS.map((item) => item.href);
    const labels = TECHNICIAN_NAV_ITEMS.map((item) => item.label);
    assert.ok(hrefs.includes(TECHNICIAN_FIELD_MESSAGES_PATH));
    assert.ok(hrefs.includes(TECHNICIAN_NOTIFICATIONS_PATH));
    assert.ok(labels.includes('Messages'));
    assert.ok(labels.includes('Notifications'));
    assert.equal(hrefs.includes(TECHNICIAN_PERFORMANCE_PATH), false);
    assert.equal(labels.includes('Performance'), false);

    const app = read('App.tsx');
    assert.match(app, /path="\/messages"\s+component=\{MobilePages\.MobileMessagesPage\}/);
    assert.match(app, /path="\/notifications"\s+component=\{MobilePages\.MobileNotificationsPage\}/);

    const messages = read('pages/mobile/MobileMessagesPage.tsx');
    assert.match(messages, /title="Messages"/);
    assert.match(messages, /Dispatch \/ office/);
    assert.match(messages, /Assigned job threads/);
    assert.doesNotMatch(messages, /communications-hub/);
    assert.doesNotMatch(messages, /\/crm\b/);
    assert.doesNotMatch(messages, /title="Notifications"/);

    const notifications = read('pages/mobile/MobileNotificationsPage.tsx');
    assert.match(notifications, /title="Notifications"/);
    assert.doesNotMatch(notifications, /title="Messages"/);
  });

  it('denies technician Performance URL; owners may still peek', () => {
    assert.equal(isTechnicianForbiddenMobilePath('/mobile/performance'), true);
    const technician = {
      roleName: TECHNICIAN_ROLE_NAME,
      permissions: ['mobile:read', 'mobile:write'],
    };
    const owner = {
      roleName: COMPANY_OWNER_ROLE_NAME,
      permissions: ['*'],
    };
    const techDecision = evaluateTechnicianDirectUrl(technician, '/mobile/performance');
    assert.equal(techDecision.allowed, false);
    if (!techDecision.allowed) assert.equal(techDecision.redirectPath, '/mobile');

    const ownerDecision = evaluateTechnicianDirectUrl(owner, '/mobile/performance');
    assert.equal(ownerDecision.allowed, true);

    const messagesDecision = evaluateTechnicianDirectUrl(technician, '/mobile/messages');
    assert.equal(messagesDecision.allowed, true);
  });
});
