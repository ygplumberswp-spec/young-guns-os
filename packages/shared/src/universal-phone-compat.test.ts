import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  UNIVERSAL_PHONE_LANDSCAPE_VIEWPORTS,
  UNIVERSAL_PHONE_PORTRAIT_WIDTHS,
  UNIVERSAL_PHONE_SHELLS,
  UNIVERSAL_PHONE_UNSUPPORTED,
} from './universal-phone-compat.js';

describe('UNIVERSAL PHONE COMPATIBILITY contracts', () => {
  it('covers required portrait widths including 320 and tablet transition', () => {
    for (const width of [320, 360, 375, 390, 412, 414, 430, 768, 1024] as const) {
      assert.ok(UNIVERSAL_PHONE_PORTRAIT_WIDTHS.includes(width), String(width));
    }
  });

  it('includes landscape short-height viewports', () => {
    assert.ok(UNIVERSAL_PHONE_LANDSCAPE_VIEWPORTS.length >= 3);
    assert.ok(UNIVERSAL_PHONE_LANDSCAPE_VIEWPORTS.every((v) => v.height <= 430));
  });

  it('gates both staff owner-shell and field portal-shell', () => {
    assert.deepEqual([...UNIVERSAL_PHONE_SHELLS], ['owner-shell', 'portal-shell']);
    assert.ok(UNIVERSAL_PHONE_UNSUPPORTED.length >= 2);
  });
});
