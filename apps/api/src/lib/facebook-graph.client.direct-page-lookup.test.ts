import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FacebookGraphClient } from './facebook-graph.client.js';
import {
  FACEBOOK_DIRECT_PAGE_LOOKUP_FIELDS,
  YOUNG_GUNS_FACEBOOK_PAGE_ID,
  YOUNG_GUNS_FACEBOOK_PAGE_NAME,
} from '@titan/shared';

const TEST_CONFIG = {
  appId: '1234567890',
  appSecret: 'test-secret-not-logged',
  redirectUri: 'https://young-guns-os-staging.up.railway.app/api/v1/facebook-business/oauth/callback',
};

describe('FacebookGraphClient direct page lookup (J-6.7F2)', () => {
  it('lookupPageDirect requests id,name,access_token,tasks fields', async () => {
    let requestedFields = '';
    const client = new FacebookGraphClient(TEST_CONFIG, async (url) => {
      const href = typeof url === 'string' ? url : url.toString();
      requestedFields = new URL(href).searchParams.get('fields') ?? '';
      return new Response(
        JSON.stringify({
          id: YOUNG_GUNS_FACEBOOK_PAGE_ID,
          name: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
          access_token: 'page-token',
          tasks: ['MODERATE'],
        }),
        { status: 200 },
      );
    });

    const result = await client.lookupPageDirect(YOUNG_GUNS_FACEBOOK_PAGE_ID, 'user-token');
    assert.equal(requestedFields, FACEBOOK_DIRECT_PAGE_LOOKUP_FIELDS);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.raw?.id, YOUNG_GUNS_FACEBOOK_PAGE_ID);
    assert.equal(result.raw?.access_token, 'page-token');
    assert.equal(result.providerError, null);
  });

  it('lookupPageDirect surfaces permission denied without throwing', async () => {
    const client = new FacebookGraphClient(TEST_CONFIG, async () =>
      new Response(JSON.stringify({ error: { message: 'Permissions error', code: 200 } }), {
        status: 403,
      }),
    );

    const result = await client.lookupPageDirect(YOUNG_GUNS_FACEBOOK_PAGE_ID, 'user-token');
    assert.equal(result.raw, null);
    assert.equal(result.httpStatus, 403);
    assert.equal(result.providerError?.code, 200);
    assert.equal(result.providerError?.type, 'permission');
  });

  it('lookupPageDirect surfaces not found without throwing', async () => {
    const client = new FacebookGraphClient(TEST_CONFIG, async () =>
      new Response(JSON.stringify({ error: { message: 'Unsupported get request', code: 803 } }), {
        status: 404,
      }),
    );

    const result = await client.lookupPageDirect('missing-page', 'user-token');
    assert.equal(result.raw, null);
    assert.equal(result.httpStatus, 404);
    assert.equal(result.providerError?.code, 803);
  });

  it('tryResolvePageAccessToken delegates to lookupPageDirect', async () => {
    const client = new FacebookGraphClient(TEST_CONFIG, async (url) => {
      const href = typeof url === 'string' ? url : url.toString();
      assert.match(href, new RegExp(`/${YOUNG_GUNS_FACEBOOK_PAGE_ID}`));
      return new Response(
        JSON.stringify({
          id: YOUNG_GUNS_FACEBOOK_PAGE_ID,
          name: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
          access_token: 'resolved-token',
        }),
        { status: 200 },
      );
    });

    const token = await client.tryResolvePageAccessToken(YOUNG_GUNS_FACEBOOK_PAGE_ID, 'user-token');
    assert.equal(token, 'resolved-token');
  });
});
