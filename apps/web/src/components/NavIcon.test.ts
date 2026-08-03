import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { OWNER_STAFF_NAV_ITEMS, selectPrimaryNavItems } from '@titan/shared';
import { NAV_ICON_SIZE, NAV_ICON_STROKE } from './NavIcon.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const navIconSource = readFileSync(join(__dirname, 'NavIcon.tsx'), 'utf8');
const appLayoutSource = readFileSync(join(__dirname, '../layouts/AppLayout.tsx'), 'utf8');
const css = readFileSync(join(__dirname, '../index.css'), 'utf8');

describe('NavIcon sidebar standardization', () => {
  it('uses one outline family at 18px / stroke 1.6', () => {
    assert.equal(NAV_ICON_SIZE, 18);
    assert.equal(NAV_ICON_STROKE, 1.6);
    assert.match(navIconSource, /fill="none"/);
    assert.match(navIconSource, /stroke="currentColor"/);
    assert.equal(navIconSource.includes('fill="currentColor"'), false);
  });

  /**
   * Icons are a sidebar affordance. The sidebar lists module landing pages, and
   * the in-module navigation below the header uses text links, so the contract
   * is that every sidebar entry has a drawn icon rather than the generic
   * fallback.
   */
  it('covers every sidebar module label', () => {
    const labels = [
      ...new Set(selectPrimaryNavItems(OWNER_STAFF_NAV_ITEMS).map((item) => item.label)),
    ];
    assert.ok(labels.length > 0, 'expected a consolidated sidebar');
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const keyPattern =
        /^[A-Za-z_][\w]*$/.test(label)
          ? new RegExp(`(?:^|\\n)\\s*(?:${escaped}|['"]${escaped}['"])\\s*:`)
          : new RegExp(`['"]${escaped}['"]\\s*:`);
      assert.match(navIconSource, keyPattern, `missing NavIcon path for "${label}"`);
    }
  });

  it('renders in-module navigation as text so it needs no icon set', () => {
    const moduleToolbarSource = readFileSync(join(__dirname, 'ux/ModuleToolbar.tsx'), 'utf8');
    assert.equal(moduleToolbarSource.includes('NavIcon'), false);
    assert.match(moduleToolbarSource, /module-toolbar__link/);
  });

  it('keeps icon slot + active cyan colour-only contract in layout/CSS', () => {
    assert.match(appLayoutSource, /app-nav__icon-slot/);
    assert.match(css, /\.app-nav__icon-slot/);
    assert.match(css, /--titan-icon-slot/);
    assert.match(css, /--titan-space-2/);
    assert.match(css, /\.app-nav__link--active \.app-nav__icon[\s\S]*color:\s*var\(--titan-accent\)/);
    assert.match(css, /\.app-nav__link:hover \.app-nav__icon/);
    assert.match(css, /\.owner-shell--collapsed \.app-nav__link[\s\S]*border-left-width:\s*0/);
  });
});
