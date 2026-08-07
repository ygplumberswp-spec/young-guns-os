import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

describe('Facebook connection state API wiring J-6.7F13', () => {
  it('resolveState uses effective verification helper', () => {
    const source = readFileSync(join(here, 'facebook-business.service.ts'), 'utf8');
    assert.ok(source.includes('resolveFacebookEffectiveVerification'));
    assert.ok(source.includes('startContentFeaturesOAuth'));
    assert.ok(source.includes("oauthTier === 'content_features'"));
  });

  it('content features route is registered', () => {
    const routeSource = readFileSync(join(here, '../routes/facebook-business.ts'), 'utf8');
    assert.ok(routeSource.includes("router.post('/oauth/start-content-features'"));
  });
});
