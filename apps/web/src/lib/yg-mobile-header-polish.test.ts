/**
 * Mobile TITAN header polish — logo readability, STAGING pairing, crowding rules.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return readFileSync(join(webRoot, rel), 'utf8');
}

describe('YG mobile header / TITAN logo polish', () => {
  it('AppLayout uses compact TitanWordmark SVG with brand-meta + STAGING pairing', () => {
    const layout = read('layouts/AppLayout.tsx');
    assert.match(layout, /TitanWordmark variant="compact"/);
    assert.match(layout, /app-header__brand-meta/);
    assert.match(layout, /StagingBadge/);
    assert.match(layout, /app-sidebar__profile/);
    assert.match(layout, /app-header__signout-short/);
    assert.doesNotMatch(layout, />TITAN</);
  });

  it('keeps Powered by AURA secondary on phone and does not shrink logo unreadably', () => {
    const css = read('index.css');
    assert.match(
      css,
      /@media \(max-width: 640px\)[\s\S]*\.owner-shell \.app-header__brand \.brand-sub[\s\S]*display:\s*block/,
    );
    assert.match(
      css,
      /@media \(max-width: 640px\)[\s\S]*\.app-header__wordmark[\s\S]*width:\s*6\.75rem/,
    );
    assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.app-header__wordmark[\s\S]*width:\s*6\.5rem/);
    assert.match(css, /@media \(max-width: 360px\)[\s\S]*\.app-header__wordmark[\s\S]*width:\s*6\.25rem/);
    assert.doesNotMatch(
      css,
      /@media \(max-width: 414px\)[\s\S]*\.app-header__wordmark[\s\S]*width:\s*5\.5rem/,
    );
  });

  it('hides role/company before name and defers YG mark on ≤430', () => {
    const css = read('index.css');
    assert.match(
      css,
      /@media \(max-width: 640px\)[\s\S]*\.app-header__tenant,\s*\.app-header__role\s*\{\s*display:\s*none;/,
    );
    assert.match(
      css,
      /@media \(max-width: 430px\)[\s\S]*\.app-header__identity-mark[\s\S]*display:\s*none/,
    );
    assert.doesNotMatch(
      css,
      /@media \(max-width: 390px\)[\s\S]*\.app-header__identity > span:not\(\.app-header__identity-mark\)[\s\S]*display:\s*none/,
    );
  });

  it('preserves header safe-area and brand-meta nowrap contract', () => {
    const css = read('index.css');
    assert.match(css, /\.app-header__brand-meta[\s\S]*flex-wrap:\s*nowrap/);
    assert.match(
      css,
      /\.owner-shell \.titan-shell__header[\s\S]*safe-area-inset-top[\s\S]*safe-area-inset-left/,
    );
    assert.match(
      css,
      /@media \(max-width: 430px\)[\s\S]*\.owner-shell \.titan-shell__header[\s\S]*safe-area-inset-left/,
    );
    assert.match(
      css,
      /@media \(max-width: 640px\)[\s\S]*\.app-header__brand[\s\S]*flex-direction:\s*column/,
    );
  });

  it('static + React wordmark assets stay SVG-consistent', () => {
    const react = read('brand/TitanWordmark.tsx');
    const asset = read('../public/brand/titan-wordmark.svg');
    assert.match(react, /viewBox="0 0 560 88"/);
    assert.match(asset, /viewBox="0 0 560 88"/);
    assert.match(asset, /<title>TITAN<\/title>/);
    assert.doesNotMatch(react, />TITAN</);
  });
});
