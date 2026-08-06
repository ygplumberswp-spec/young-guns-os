import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const actionsSource = readFileSync(join(here, 'FacebookConnectionActions.tsx'), 'utf8');
const pageSource = readFileSync(
  join(here, '../../pages/facebook-business/FacebookBusinessPage.tsx'),
  'utf8',
);
const integrationsSource = readFileSync(join(here, 'SocialConnectionsSection.tsx'), 'utf8');

describe('facebook connection actions click path (J-6.7F8)', () => {
  it('choose_correct_page invokes onChoosePage handler instead of a same-page Link', () => {
    assert.ok(actionsSource.includes("choose_correct_page: props.onChoosePage"));
    assert.equal(
      actionsSource.includes("action === 'choose_correct_page' && choosePageHref"),
      false,
    );
    assert.ok(actionsSource.includes("key={action}"));
    assert.ok(actionsSource.includes('type="button"'));
  });

  it('choose_page still uses workspace Link when choosePageHref is provided', () => {
    assert.ok(actionsSource.includes("action === 'choose_page' && choosePageHref"));
    assert.ok(actionsSource.includes('<Link key="choose-page"'));
  });

  it('Facebook Business workspace loads Pages on click with loading state', () => {
    assert.ok(pageSource.includes('Loading Pages…'));
    assert.ok(pageSource.includes('pagesLoadInFlight'));
    assert.ok(pageSource.includes('fetchFacebookPages'));
    assert.equal(pageSource.includes('choosePageHref="/facebook-business"'), false);
    assert.ok(
      pageSource.includes("outcome === 'select-page'") &&
        pageSource.includes("outcome === 'reconnect-wizard'"),
    );
    assert.ok(pageSource.includes('showPageDiscovery'));
    assert.ok(pageSource.includes('pageStored={Boolean(connection.pageId)}'));
  });

  it('Integrations overview card links to Facebook Business workspace for Manage/Review', () => {
    assert.ok(integrationsSource.includes('resolveSocialEnterpriseActionHref'));
    assert.ok(integrationsSource.includes('EnterpriseConnectionStatusLine'));
    const statusSource = readFileSync(join(here, 'enterprise-connection-status.ts'), 'utf8');
    assert.ok(statusSource.includes('managementPath'));
  });
});
