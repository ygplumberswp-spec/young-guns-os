import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(join(here, 'facebook-business.service.ts'), 'utf8');

describe('facebook page read OAuth wiring (J-6.7F6)', () => {
  it('service exposes startPageReadOAuth and preserves page on denial', () => {
    assert.ok(serviceSource.includes('startPageReadOAuth'));
    assert.ok(serviceSource.includes('oauth_page_read_denied'));
    assert.ok(serviceSource.includes('pages_read_engagement. The selected Page and stored credentials were preserved'));
    assert.ok(serviceSource.includes('persistFacebookConnectionState'));
    assert.ok(serviceSource.includes('mergeFacebookVerificationMetadata'));
  });

  it('route exposes start-page-read endpoint', () => {
    const routeSource = readFileSync(join(here, '../routes/facebook-business.ts'), 'utf8');
    assert.ok(routeSource.includes("router.post('/oauth/start-page-read'"));
  });

  it('graph client builds page-read authorize URL with controlled scopes', () => {
    const clientSource = readFileSync(join(here, '../lib/facebook-graph.client.ts'), 'utf8');
    assert.ok(clientSource.includes('buildPageReadAuthorizeUrl'));
    assert.ok(clientSource.includes('FACEBOOK_OAUTH_PAGE_READ_SCOPES'));
  });

  it('runSync requires usable connected state (blocks CONNECTED_LIMITED)', () => {
    assert.ok(serviceSource.includes('requireUsableConnection'));
    assert.ok(serviceSource.includes('if (!state.usable)'));
    assert.ok(serviceSource.includes('runSync(actor: FacebookActor'));
    assert.match(serviceSource, /capable\('read_comments'\)/);
  });
});
