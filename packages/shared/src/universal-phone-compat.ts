/**
 * UNIVERSAL PHONE COMPATIBILITY — release-gate contracts.
 * Standards-based responsive widths (not one iPhone model).
 */

export const UNIVERSAL_PHONE_COMPAT_LABEL = 'UNIVERSAL-PHONE-COMPAT' as const;

/** Representative logical CSS widths for the release gate. */
export const UNIVERSAL_PHONE_PORTRAIT_WIDTHS = [
  320, 360, 375, 390, 412, 414, 430, 768, 1024,
] as const;

/** Short landscape heights paired with common phone widths. */
export const UNIVERSAL_PHONE_LANDSCAPE_VIEWPORTS = [
  { width: 667, height: 375, label: 'landscape-375-class' },
  { width: 844, height: 390, label: 'landscape-390-class' },
  { width: 926, height: 430, label: 'landscape-430-class' },
] as const;

export const UNIVERSAL_PHONE_SHELLS = ['owner-shell', 'portal-shell'] as const;

export const UNIVERSAL_PHONE_BROWSERS = {
  iphoneSafari: {
    label: 'iPhone Safari',
    engine: 'WebKit',
    note: 'Validated via Chromium viewport matrix + WebKit-oriented CSS (dvh, safe-area, viewport-fit=cover). Live device Safari not available in CI.',
  },
  androidChrome: {
    label: 'Android Chrome',
    engine: 'Blink',
    note: 'Validated via Chromium viewport matrix matching Android Chrome layout widths.',
  },
} as const;

export const UNIVERSAL_PHONE_UNSUPPORTED = [
  'Internet Explorer',
  'Pre-Chromium Edge',
  'Android WebView without modern CSS (no dvh / env(safe-area) support)',
  'iOS Safari older than versions supporting viewport-fit=cover + CSS env()',
] as const;

export const UNIVERSAL_PHONE_VERIFY_SURFACES = [
  'no horizontal overflow',
  'no clipped header/actions',
  'safe-area insets',
  'drawers/menus usable',
  'AURA composer sticky + dvh (role-authorised)',
  'Jobs / Job Cards',
  'Timesheets',
  'Parts Used',
  'Navigation',
  'Offline Sync',
  'RBAC unchanged by viewport',
] as const;
