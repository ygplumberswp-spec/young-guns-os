import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isPlaceholderPublicUrl,
  normalizePublicOrigin,
  parseCorsOriginAllowlist,
} from './public-url.js';

describe('public-url', () => {
  it('normalizes APP_URL to origin (strips path and trailing slash)', () => {
    assert.equal(
      normalizePublicOrigin('https://web.up.railway.app/app/'),
      'https://web.up.railway.app',
    );
  });

  it('detects Railway docs placeholders', () => {
    assert.equal(
      isPlaceholderPublicUrl('https://YOUR-COMFORTABLE-DETERMINATION-URL.up.railway.app'),
      true,
    );
    assert.equal(
      isPlaceholderPublicUrl('https://comfortable-determination-url.up.railway.app'),
      true,
    );
    assert.equal(isPlaceholderPublicUrl('https://young-guns-os-web.up.railway.app'), false);
    assert.equal(
      isPlaceholderPublicUrl('https://comfortable-determination-staging.up.railway.app'),
      false,
    );
  });

  it('allows the live TITAN staging web origin (not a docs placeholder)', () => {
    assert.equal(
      isPlaceholderPublicUrl('https://comfortable-determination-staging.up.railway.app'),
      false,
    );
  });

  it('builds CORS allowlist from APP_URL + CORS_ORIGINS', () => {
    const allowed = parseCorsOriginAllowlist(
      'https://web.up.railway.app/',
      'https://preview.up.railway.app, https://other.example.com/path',
    );
    assert.ok(allowed.has('https://web.up.railway.app'));
    assert.ok(allowed.has('https://preview.up.railway.app'));
    assert.ok(allowed.has('https://other.example.com'));
  });
});
