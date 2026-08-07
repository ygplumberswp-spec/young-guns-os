# Technician Mobile Screenshot Delta — Safe Area + Messages

## Safe-area fix

Root cause: `.portal-header` used a mobile `padding` shorthand (`0.75rem 1rem` at ≤720px) and top inset lived only on `.portal-shell`. With `apple-mobile-web-app-status-bar-style=black-translucent` + `viewport-fit=cover`, the TITAN logo could sit under the iOS status bar / Dynamic Island.

Fix: sticky `.portal-header` owns `env(safe-area-inset-top|left|right)`; shell no longer pads top; ≤720/360/320 rules preserve calc’d top inset (no shorthand wipe).

## Safari / WhatsApp launch / PWA verification

| Context | Result |
| --- | --- |
| Safari | **PASS_CSS_READY** — `viewport-fit=cover` + header safe-area |
| WhatsApp / external in-app browser | **PASS_CSS_READY** — same standards CSS; no UA hacks |
| Installed PWA (`black-translucent`) | **PASS_CSS_READY** — header owns notch inset so logo clears clock |
| Android Chrome | **PASS** — Chromium width matrix 320–430 with simulated inset |

## Messages vs Notifications root cause

Nav historically labeled **Messages** while `href=/mobile/notifications` rendered `MobileNotificationsPage` (“Notifications / 0 unread”). Label-only rename was insufficient — Messages and Notifications are not interchangeable.

**Fix:** canonical `Messages` → `/mobile/messages` → `MobileMessagesPage`. `Notifications` remains `/mobile/notifications`.

## Technician messaging scope

Messages includes only:

- assigned job threads (job-card notes / site updates)
- dispatch / office workforce requests
- authorised customer/site communication via the assigned job card

Excluded: Communications Hub, CRM inbox, company-wide threads, unrelated jobs.

## Performance result

**Removed** from Technician navigation and **denied** for technician direct URL (`TECHNICIAN_FORBIDDEN_MOBILE_PATHS`).

Reason: `MobilePerformancePage` exposes overtime hours + productivity score/exports — not a pure assigned-job execution surface (fails Owner gate on payroll-adjacent / productivity analytics). Owners may still peek the route for support.

## Device widths

Verified (probe): **320, 360, 375, 390, 414, 430** — wordmark clears simulated status bar; no horizontal overflow.

## Production safety

Production untouched (`productionTouched: 0`). Staging-only branch.
