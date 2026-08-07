# TITAN Phase 1 Polish — Execution Plan

**Branch:** `cursor/titan-frozen-scope-completion` (~23284ea+)  
**Scope:** Staging only · foundation + 3 key modules · honest deferrals  
**Session date:** 2026-08-01

---

## Audit — What Exists vs Needed

| Area | Exists | Gap (this session) |
|------|--------|-------------------|
| **Draft storage / autosave** | Local `DraftLine` types in quote forms only; BOQ has `draft` status on persisted records | No cross-module draft workspace table, API, or debounced autosave hook |
| **Notifications / toast** | Inline `form-error` / `success` strings; `window.confirm` on security pages | No unified toast system; no undo; no dedupe |
| **Back navigation** | Ad-hoc `Link` + "Back to …" buttons on create pages | No shared `BackButton`, no smart history/fallback, no filter/tab preservation |
| **Global search** | `SearchCommandPalette`, `HeaderSearchTrigger`, `GlobalSearchPage` | No recently-viewed section (localStorage, tenant+user scoped) |
| **Settings routes** | `/settings/company`, `team`, `security`, `portal`, `billing`, `about` via `SettingsNav` | Missing documents-records, notifications, advanced/data-protection scaffolds |
| **Quote forms** | `QuoteCreatePage`, `QuoteEditPage` — full forms, manual save | Wire BackButton, draft autosave, notifications, unsaved guard |
| **Invoice forms** | `InvoiceCreatePage` only (no edit page) | Same wiring on create; edit deferred |
| **Job forms** | `JobCreatePage` — large operational form | BackButton + draft autosave on scalar fields (exclude file blobs) |
| **Drafts workspace UI** | None | New `/drafts` page grouped by type |
| **Duplicate draft** | None | API `POST /drafts/:id/duplicate` + web helper |
| **Unsaved changes guard** | None | Custom modal; minimal `beforeunload` only when dirty |

**Do not duplicate:** `HeaderSearchTrigger`, `AuraQuickMemory`, existing command palette shortcut wiring.

---

## Phased Delivery — This Session

### Phase A — Shared infrastructure (priority)
1. `packages/shared/src/drafts.ts` — types, defaults, `buildDraftKey`
2. `packages/db` schema + `0112_draft_workspace.sql`
3. `apps/api` — `draft-autosave.service.ts`, `routes/drafts.ts`, register in `index.ts`
4. `BackButton` + `useSmartBack`
5. `TitanNotifications` + `useTitanNotify` (dedupe, undo, variants)
6. `useDraftAutosave` + `useUnsavedChangesGuard`
7. `apps/web/src/lib/drafts-api.ts`, `recent-items.ts`

### Phase B — Key module wiring
1. Quote create/edit — full autosave + guard + BackButton
2. Invoice create — BackButton + autosave (no edit page exists)
3. Job create — BackButton + autosave (JSON payload, no file content)

### Phase C — Drafts workspace + duplicate
1. `DraftsPage` at `/drafts`
2. Finance nav / More menu link
3. Duplicate endpoint + helper

### Phase D — Search + settings scaffolds
1. Recently viewed in `SearchCommandPalette`
2. `/settings/documents-records`, `/settings/notifications`, `/settings/advanced/data-protection`

### Phase E — Validation + staging
1. `pnpm run typecheck`, web + api build
2. Unit tests: draft key dedupe, BackButton routing, notify dedupe
3. Migration 0112 on staging, Railway redeploy, health 200

### Phase F — Completion report + commit
1. `TITAN_PHASE1_POLISH_COMPLETION_REPORT.md`
2. Coherent commit, push branch, **STOP FOR OWNER APPROVAL**

---

## Deferred (honest)

- Full autosave on: customers, documents, marketing, BOQ, leads, payments
- `InvoiceEditPage` (route does not exist)
- API-backed recently viewed (localStorage first)
- Owner-configurable draft retention UI persistence (scaffold defaults in code only)
- Replacing all legacy `window.confirm` outside scope pages

---

## Young Guns Safe Defaults (code)

| Setting | Default |
|---------|---------|
| Autosave interval | 30s debounce, 1.5s min between writes |
| Draft retention | 90 days |
| Notify dedupe window | 3s |
| Recent items cap | 20 per user+tenant |
