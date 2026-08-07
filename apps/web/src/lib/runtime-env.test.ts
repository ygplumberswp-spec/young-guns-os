import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveApiBaseFrom, coerceSameOriginApiBase } from './runtime-env';

describe('resolveApiBaseFrom', () => {
  it('uses same-origin when runtime override is empty string', () => {
    assert.equal(resolveApiBaseFrom('https://api.example.com', true, ''), '/api/v1');
  });

  it('uses Vite value when runtime override is absent', () => {
    assert.equal(
      resolveApiBaseFrom('https://young-guns-os-staging.up.railway.app', false, undefined),
      'https://young-guns-os-staging.up.railway.app/api/v1',
    );
  });

  it('strips accidental /api/v1 suffix from Vite value', () => {
    assert.equal(
      resolveApiBaseFrom('https://api.example.com/api/v1', false, undefined),
      'https://api.example.com/api/v1',
    );
  });

  it('prefers same-origin /api/v1 when configured API host differs from the page', () => {
    assert.equal(
      coerceSameOriginApiBase(
        'https://young-guns-os-staging.up.railway.app/api/v1',
        'https://comfortable-determination-staging.up.railway.app',
      ),
      '/api/v1',
    );
    assert.equal(
      coerceSameOriginApiBase(
        'https://api.example.com/api/v1',
        'https://api.example.com',
      ),
      'https://api.example.com/api/v1',
    );
  });
});
