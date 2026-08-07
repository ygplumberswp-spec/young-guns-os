import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FacebookGraphClient } from './facebook-graph.client.js';

const TEST_CONFIG = {
  appId: '1234567890',
  appSecret: 'test-secret-not-logged',
  redirectUri: 'https://young-guns-os-staging.up.railway.app/api/v1/facebook-business/oauth/callback',
};

describe('FacebookGraphClient page discovery', () => {
  it('returns all provider rows and follows pagination', async () => {
    let calls = 0;
    const client = new FacebookGraphClient(TEST_CONFIG, async (url) => {
      calls += 1;
      const href = typeof url === 'string' ? url : url.toString();
      if (calls === 1) {
        assert.match(href, /\/me\/accounts/);
        return new Response(
          JSON.stringify({
            data: [{ id: '111', name: 'Page One', access_token: 'tok-1' }],
            paging: { next: 'https://graph.facebook.com/v21.0/me/accounts?after=cursor' },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: [{ id: '222', name: 'Young Guns Plumbing – Cape Town', access_token: 'tok-2' }],
        }),
        { status: 200 },
      );
    });

    const result = await client.discoverPages('user-token');
    assert.equal(result.rows.length, 2);
    assert.equal(result.hasPaging, true);
    assert.equal(result.pagingPageCount, 2);
    assert.equal(result.providerError, null);
  });

  it('listPages resolves token via page node when /me/accounts omits access_token', async () => {
    const client = new FacebookGraphClient(TEST_CONFIG, async (url) => {
      const href = typeof url === 'string' ? url : url.toString();
      if (href.includes('/me/accounts')) {
        return new Response(
          JSON.stringify({
            data: [{ id: '333', name: 'Young Guns Plumbing – Cape Town', tasks: ['PROFILE_PLUS_MODERATE'] }],
          }),
          { status: 200 },
        );
      }
      if (href.includes('/333?')) {
        return new Response(JSON.stringify({ access_token: 'resolved-page-token' }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: 'unexpected', code: 1 } }), {
        status: 400,
      });
    });

    const pages = await client.listPages('user-token');
    assert.equal(pages.length, 1);
    assert.equal(pages[0]?.id, '333');
    assert.equal(pages[0]?.accessToken, 'resolved-page-token');
  });

  it('surfaces provider errors instead of returning an empty list', async () => {
    const client = new FacebookGraphClient(TEST_CONFIG, async () =>
      new Response(JSON.stringify({ error: { message: 'Permissions error', code: 200 } }), {
        status: 403,
      }),
    );

    const result = await client.discoverPages('user-token');
    assert.equal(result.rows.length, 0);
    assert.ok(result.providerError);
    assert.equal(result.providerError?.code, 200);
  });
});
