/**
 * UNIVERSAL PHONE COMPATIBILITY — CSS + viewport meta contracts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { UNIVERSAL_PHONE_PORTRAIT_WIDTHS } from '@titan/shared';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return readFileSync(join(webRoot, rel), 'utf8');
}

describe('UNIVERSAL PHONE COMPATIBILITY release gate', () => {
  it('viewport meta enables safe-area + keyboard resize without device hacks', () => {
    const html = read('../index.html');
    assert.match(html, /viewport-fit=cover/);
    assert.match(html, /interactive-widget=resizes-content/);
  });

  it('covers 320 floor and portal field chrome compaction', () => {
    const css = read('index.css');
    assert.match(css, /@media \(max-width: 320px\)/);
    assert.match(css, /UNIVERSAL PHONE COMPATIBILITY/);
    assert.match(css, /\.portal-shell[\s\S]*overflow-x:\s*hidden/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.portal-header__company[\s\S]*display:\s*none/);
    assert.match(
      css,
      /@media \(max-height: 430px\) and \(orientation: landscape\)/,
    );
  });

  it('does not regress desktop OWNER-001 dense pad contract', () => {
    const layout = read('styles/layout-grid.css');
    assert.match(
      layout,
      /\.titan-shell__main:has\(\.exec-dashboard-page--owner001\)\s*\{[\s\S]*clamp\(0\.5rem,\s*1vw,\s*1rem\)/,
    );
  });

  it('exports the full portrait width matrix', () => {
    for (const width of [320, 360, 375, 390, 412, 414, 430, 768, 1024] as const) {
      assert.ok(UNIVERSAL_PHONE_PORTRAIT_WIDTHS.includes(width));
    }
  });
});
