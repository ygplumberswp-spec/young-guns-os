import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FacebookGraphClient } from './facebook-graph.client.js';
import {
  FACEBOOK_DIRECT_PAGE_IDENTITY_FIELDS,
  FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS,
  YOUNG_GUNS_FACEBOOK_PAGE_ID,
  YOUNG_GUNS_FACEBOOK_PAGE_NAME,
} from '@titan/shared';

const TEST_CONFIG = {
  appId: '1234567890',
  appSecret: 'test-secret-not-logged',
  redirectUri: 'https://young-guns-os-staging.up.railway.app/api/v1/facebook-business/oauth/callback',
};

describe('FacebookGraphClient direct page lookup (J-6.7F3)', () => {
  it('identity probe requests id,name only — no tasks', async () => {
    const requested: string[] = [];
    const client = new FacebookGraphClient(TEST_CONFIG, async (url) => {
      const href = typeof url === 'string' ? url : url.toString();
      const fields = new URL(href).searchParams.get('fields') ?? '';
      requested.push(fields);
      if (fields === FACEBOOK_DIRECT_PAGE_IDENTITY_FIELDS) {
        return new Response(
          JSON.stringify({
            id: YOUNG_GUNS_FACEBOOK_PAGE_ID,
            name: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          id: YOUNG_GUNS_FACEBOOK_PAGE_ID,
          name: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
          access_token: 'page-token',
        }),
        { status: 200 },
      );
    });

    const result = await client.lookupPageDirect(YOUNG_GUNS_FACEBOOK_PAGE_ID, 'user-token');
    assert.deepEqual(requested, [
      FACEBOOK_DIRECT_PAGE_IDENTITY_FIELDS,
      FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS,
    ]);
    assert.equal(requested.every((fields) => !fields.includes('tasks')), true);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.raw?.access_token, 'page-token');
    assert.equal(result.tokenProbe.skipped, false);
  });

  it('token probe uses id,name,access_token without tasks', async () => {
    let tokenFields = '';
    const client = new FacebookGraphClient(TEST_CONFIG, async (url) => {
      const href = typeof url === 'string' ? url : url.toString();
      const fields = new URL(href).searchParams.get('fields') ?? '';
      if (fields === FACEBOOK_DIRECT_PAGE_IDENTITY_FIELDS) {
        return new Response(
          JSON.stringify({ id: YOUNG_GUNS_FACEBOOK_PAGE_ID, name: YOUNG_GUNS_FACEBOOK_PAGE_NAME }),
          { status: 200 },
        );
      }
      tokenFields = fields;
      return new Response(
        JSON.stringify({
          id: YOUNG_GUNS_FACEBOOK_PAGE_ID,
          name: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
          access_token: 'page-token',
        }),
        { status: 200 },
      );
    });

    await client.lookupPageDirect(YOUNG_GUNS_FACEBOOK_PAGE_ID, 'user-token');
    assert.equal(tokenFields, FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS);
    assert.equal(tokenFields.includes('tasks'), false);
  });

  it('skips token probe when identity probe fails', async () => {
    let callCount = 0;
    const client = new FacebookGraphClient(TEST_CONFIG, async () => {
      callCount += 1;
      return new Response(JSON.stringify({ error: { message: 'Unsupported get request', code: 803 } }), {
        status: 404,
      });
    });

    const result = await client.lookupPageDirect('missing-page', 'user-token');
    assert.equal(callCount, 1);
    assert.equal(result.tokenProbe.skipped, true);
    assert.equal(result.raw, null);
    assert.equal(result.httpStatus, 404);
  });

  it('lookupPageDirect surfaces permission denied without throwing', async () => {
    const client = new FacebookGraphClient(TEST_CONFIG, async (url) => {
      const href = typeof url === 'string' ? url : url.toString();
      const fields = new URL(href).searchParams.get('fields') ?? '';
      if (fields === FACEBOOK_DIRECT_PAGE_IDENTITY_FIELDS) {
        return new Response(
          JSON.stringify({ id: YOUNG_GUNS_FACEBOOK_PAGE_ID, name: YOUNG_GUNS_FACEBOOK_PAGE_NAME }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: { message: 'Permissions error', code: 200 } }), {
        status: 403,
      });
    });

    const result = await client.lookupPageDirect(YOUNG_GUNS_FACEBOOK_PAGE_ID, 'user-token');
    assert.equal(result.raw?.access_token, undefined);
    assert.equal(result.tokenProbe.httpStatus, 403);
    assert.equal(result.tokenProbe.providerError?.code, 200);
    assert.equal(result.tokenProbe.providerError?.type, 'permission');
  });

  it('lookupPageDirect surfaces invalid field code 100 without throwing', async () => {
    const client = new FacebookGraphClient(TEST_CONFIG, async () =>
      new Response(
        JSON.stringify({
          error: { message: '(#100) Invalid field', type: 'OAuthException', code: 100 },
        }),
        { status: 400 },
      ),
    );

    const result = await client.lookupPageDirect(YOUNG_GUNS_FACEBOOK_PAGE_ID, 'user-token');
    assert.equal(result.identityProbe.httpStatus, 400);
    assert.equal(result.identityProbe.providerError?.code, 100);
    assert.equal(result.tokenProbe.skipped, true);
  });

  it('tryResolvePageAccessToken uses token fields only', async () => {
    let requestedFields = '';
    const client = new FacebookGraphClient(TEST_CONFIG, async (url) => {
      const href = typeof url === 'string' ? url : url.toString();
      requestedFields = new URL(href).searchParams.get('fields') ?? '';
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
    assert.equal(requestedFields, FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS);
    assert.equal(token, 'resolved-token');
  });
});

describe('FacebookGraphClient Page-token identity (J-6.7F10)', () => {
  it('verifyPageTokenViaMe requests GET /me?fields=id,name with Page token', async () => {
    let requestedPath = '';
    let requestedFields = '';
    const client = new FacebookGraphClient(TEST_CONFIG, async (url) => {
      const href = typeof url === 'string' ? url : url.toString();
      const parsed = new URL(href);
      requestedPath = parsed.pathname;
      requestedFields = parsed.searchParams.get('fields') ?? '';
      return new Response(
        JSON.stringify({
          id: '394603137072407',
          name: 'Young Guns Plumbing - Cape Town',
        }),
        { status: 200 },
      );
    });

    const identity = await client.verifyPageTokenViaMe('page-access-token');
    assert.match(requestedPath, /\/me$/);
    assert.equal(requestedFields, 'id,name');
    assert.equal(identity.id, '394603137072407');
    assert.equal(identity.name, 'Young Guns Plumbing - Cape Town');
  });
});
