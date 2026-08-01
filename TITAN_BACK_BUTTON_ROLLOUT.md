# TITAN Back Button Global Rollout

**Branch:** `cursor/titan-frozen-scope-completion`  
**Date:** 2026-08-01

## Summary

Global BackButton rollout via shared `PageHeader` (apps/web `components/ux`). Smart back uses browser history when same-origin, otherwise central parent-route fallbacks. List scroll/state is preserved in `sessionStorage`.

## Shared infrastructure

| File | Role |
|------|------|
| `apps/web/src/lib/back-navigation.ts` | Parent route map, module roots, exclusions, `shouldShowBackButton` |
| `apps/web/src/hooks/useTitanNavigationHistory.ts` | Scroll + list state capture/restore |
| `apps/web/src/hooks/useSmartBack.ts` | History-first back with fallback navigation |
| `apps/web/src/components/ux/BackButton.tsx` | Arrow + Back, mobile compact, optional `guardNavigation` |
| `apps/web/src/components/ux/PageHeader.tsx` | Auto back (left slot) unless excluded or `showBack={false}` |
| `apps/web/src/App.tsx` | `TitanNavigationHistoryProvider` wraps all routes |

## Draft protection

Form pages with `useFormDraftShell` pass `guardNavigation={draftShell.guard.guardNavigation}` on `PageHeader` (quotes, invoices, jobs). Saved drafts navigate cleanly; dirty drafts show Stay / Save draft and leave / Discard modal.

## Pages covered

All owner/staff pages using `PageHeader` from `components/ux` (~140 migrated from `@titan/ui`). Back shows automatically on:

- Create / edit / detail routes (finance, jobs, CRM, leads, fleet, documents, procurement, automation, agents, etc.)
- Settings sub-pages → `/settings`
- Integration sub-pages → `/integrations`
- AURA sub-pages (`/aura/business-rules`, `/aura/todays-plan`, agent detail/create, capabilities)
- `/drafts`, `/global-search`, `/workforce/day-timeline`, mobile nested routes

## Exclusions (no Titan BackButton)

| Surface | Reason |
|---------|--------|
| `/auth/*` | Login, MFA, recovery — custom “Back to sign in” only |
| `/my/*`, `/portal/*` | Customer portal — portal shell navigation |
| `/` dashboard | Module root; `rememberLastModule` tracks last sidebar destination |
| Module list roots | e.g. `/jobs`, `/crm`, `/finance/quotes`, `/aura`, `/settings` (index redirects) |
| `AuraPage` (`/aura`) | Custom AURA shell (module root) |

Portal/mobile auth pages retain their own safe nav patterns.

## Legacy cleanup

Removed per-page “Back to …” `Link`+`Button` blocks superseded by `PageHeader` back. Contextual inline links (e.g. stock movements “Back to job” when filtered) kept.

## Tests

- `apps/web/src/lib/back-navigation.test.ts` — route map + visibility
- `apps/web/src/hooks/useSmartBack.test.ts` — re-export sanity
- Full web suite: 130 tests pass

## Codemods (optional re-run)

- `scripts/migrate-page-header-imports.mjs`
- `scripts/remove-legacy-back-buttons.mjs`
