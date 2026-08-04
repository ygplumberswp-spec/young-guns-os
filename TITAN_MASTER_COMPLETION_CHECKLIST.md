# TITAN Master Completion Checklist — Controlled Staging Release

**Release:** Finance editor recovery (migration 0176 + live updates + customer search)  
**Scope:** Staging only — production forbidden  
**Checkpoint updated:** 2026-08-04T17:43:00Z  
**Agent run:** `bc-019fb4cd-7dec-7aac-9ed3-68c7cb71998f`

---

## Environment identities

| Item | Expected | Checkpoint status |
|------|----------|-------------------|
| Recovery worktree | `/workspace/.worktrees/titan-recovery` | **CONFIRMED** — clean |
| Recovery branch | `cursor/titan-v1-integration-recovery` | **CONFIRMED** @ `a7fb615` |
| App deploy branch | `cursor/titan-v1-integration` | **CONFIRMED** @ `80a2534` on origin |
| Baseline ancestor | `af56e32` | **CONFIRMED** — `80a2534` is linear descendant |
| Staging Supabase ref | `cpkuwtaipjxeipvbssvn` | **UNVERIFIED locally** — no `apps/api/.env.staging.local` |
| Production ref (forbidden) | `rshuiaghmtrvvilhqpwm` | **NOT TARGETED** — no local DB URL present |
| `APP_ENV` / `TITAN_ENV` | `staging` | **UNVERIFIED locally** — env file absent; Railway API readiness reports DB connected |
| Staging API URL | `https://young-guns-os-staging.up.railway.app` | Reachable |
| Staging Web URL | `https://titan-staging-web-production.up.railway.app` | HTTP 200 |

---

## Git revisions

| Ref | SHA | Role |
|-----|-----|------|
| `origin/cursor/titan-v1-integration` | `80a2534` | **Application deploy target** (5 recovery commits on `af56e32`) |
| `origin/cursor/titan-v1-integration-recovery` | `a7fb615` | Migration helper only — **do not deploy as app** |
| `af56e32` | `af56e32` | Authoritative baseline |
| Local HEAD (recovery worktree) | `a7fb615` | Clean, up to date with origin |

Recovery commits on app branch (newest first): `80a2534` → `3bfa085` → `2117f6f` → `962c618` → `6147b3d`.

---

## Phase gate checklist

### Phase 1 — Preflight

- [x] Repository / worktree / branch / HEAD confirmed
- [x] `git fetch origin` (no rebase/reset)
- [x] `origin/cursor/titan-v1-integration` = `80a2534`
- [x] `origin/cursor/titan-v1-integration-recovery` = `a7fb615`
- [x] `80a2534` descendant of `af56e32`
- [ ] `APP_ENV=staging` and `TITAN_ENV=staging` in local credential file — **BLOCKED** (file missing)
- [ ] Staging DB ref `cpkuwtaipjxeipvbssvn` confirmed in `DATABASE_URL` — **BLOCKED**
- [ ] Production ref not in local target — **N/A** (no credentials)
- [ ] Xero import/sync idle — **UNVERIFIED** (requires DB or authenticated API)

**Phase 1 result:** **PARTIAL STOP** — git identity OK; credential/Xero gates incomplete.

### Phase 2 — Verified backup

- [x] `pg_dump` / `pg_restore` available (postgresql-client 16.14 installed)
- [ ] Custom-format backup created outside Git — **NOT RUN**
- [ ] Permissions 700/600 — **NOT RUN**
- [ ] SHA-256 recorded — **NOT RUN**
- [ ] `pg_restore --list` verified — **NOT RUN**
- [ ] Rollback command recorded — **NOT RUN**

**Phase 2 result:** **STOP** — `apps/api/.env.staging.local` absent; cannot connect to staging DB.

### Phase 3 — Migration precheck (read-only)

- [ ] 0175 applied — **NOT RUN**
- [ ] 0176 not applied — **NOT RUN**
- [ ] 0174 untouched — **NOT RUN**
- [ ] 0039 never applied — **NOT RUN**
- [ ] Customer columns absent/present audit — **NOT RUN**
- [ ] Protected row counts — **NOT RUN**

**Phase 3 result:** **NOT STARTED** — blocked by Phase 2.

### Phase 4 — Apply 0176 only

- [ ] `node packages/db/scripts/apply-0176-staging-only.mjs` — **NOT RUN**
- [ ] Post-apply verification — **NOT RUN**

**Phase 4 result:** **NOT STARTED** — blocked by Phase 2.

### Phase 5 — Railway staging deployment

- [ ] Confirm API/Web source branch `cursor/titan-v1-integration` — **UNVERIFIED** (Railway CLI unauthorized)
- [ ] Deploy revision `80a2534` — **NOT EXECUTED**
- [ ] Deployment IDs recorded — **NOT AVAILABLE**
- [x] `/api/v1/health` → 200
- [x] `/api/v1/health/ready` → 200, `"database":"connected"`
- [x] Web → 200
- [x] `/api/v1/live-updates/stream` → **401** (not 404)
- [x] `/api/v1/finance/customers/search?q=test` → **401** with `UNAUTHORIZED` (dedicated route, not shadow)

**Phase 5 result:** **PARTIAL** — route probes suggest recovery API may already be live; revision/deployment ID unconfirmed.

### Phase 6 — Owner authenticated smoke test (Phase J-5)

**J-5 run (revision `75a48f0`):** **SUPERSEDED — NO DEFECT VERDICT**

- Human-assisted smoke test **stopped** on Owner instruction (2026-08-04).
- **No QA quote or invoice documents were created.**
- **No defects recorded** — test did not complete; criteria changed before meaningful UI verification.
- **Do not continue testing revision `75a48f0`.**

**Superseding acceptance criteria (implementation required before J-5 resumes):**

1. Quotes and invoices must **not use or require titles**.
2. **Xero is the only official** quote/invoice numbering authority.
3. **Google Maps address search** must be integrated into Quote and Invoice address fields (autocomplete + manual fallback).
4. Corrections must be **committed and deployed to staging** before Owner smoke test resumes.
5. **Full-width Quote/Invoice workspace (J-6.1 addendum):** create, edit, detail and preview screens must fill the usable page width beside the TITAN sidebar — no narrow max-width wrappers; 20–24px outer margin; responsive grid; line table at 100% content width; notes + totals two-column section; readable search dropdowns; clean tablet/mobile reflow without horizontal overflow.

**Phase 6 / J-5 result:** **SUPERSEDED** — awaiting new implementation revision and staging deploy.

---

## Phase J-5 — Corrected Owner smoke checklist (use after new revision deploy)

**Status:** **NOT STARTED** — run only after corrected implementation is committed and deployed to staging. Record deployed revision before testing.

**Staging URLs:** Web `https://comfortable-determination-staging.up.railway.app` · API `https://young-guns-os-staging.up.railway.app`

**Safety (throughout):** Staging only · no Approve/Send · no Xero sync · no Yoco · no email/WhatsApp · no duplicate customers · do not delete QA records without Owner approval. Mark test documents: `STAGING QA — FINANCE ROUNDTRIP — DO NOT SEND` (reference label only — **no title field required**).

### Precheck

- [ ] Confirm deployed revision (not `75a48f0` unless explicitly re-approved after corrections).
- [ ] API `/health` and `/ready` → 200, database connected.
- [ ] Migration 0177 applied exactly once (if still relevant to deployed schema).
- [ ] Xero idle — no pending/running sync jobs.
- [ ] Record quote and invoice counts before testing.

### A — Title-free drafts

- [ ] New Quote editor has **no required title field**; draft saves without title.
- [ ] New Invoice editor has **no required title field**; draft saves without title.
- [ ] List and detail views do not depend on a user-entered title for identification.

### B — Xero numbering authority

- [ ] Draft quotes display **Xero quote number pending** (or equivalent honest pending state).
- [ ] Draft invoices display **Xero invoice number pending**.
- [ ] **No internal TITAN placeholder** is presented as an official quote/invoice number.
- [ ] Synced Xero documents show the **exact Xero number** from Xero.
- [ ] Open a synced Xero invoice — editing is **blocked**; update endpoint returns **409 SYNC_CONFLICT** if safely probeable.

### C — Google Maps address autocomplete (Quote + Invoice)

- [ ] Billing, site/delivery and postal address fields offer **Google Maps search/autocomplete**.
- [ ] Selecting a Maps result populates the address field correctly.
- [ ] **Manual entry fallback** works when search is skipped or fails.
- [ ] All three address snapshots **save and reload** after hard refresh.

### D — Customer search and selection

- [ ] Customer search updates results **while typing**.
- [ ] Selecting a customer closes the dropdown and it **stays closed**.
- [ ] Inline customer creation UI **opens correctly** — do **not** create a duplicate during smoke test.
- [ ] Use an **existing Owner-approved staging customer** only for save/round-trip tests.

### E — VAT and line-item workflow

- [ ] VAT defaults to **15%**.
- [ ] **VAT / No VAT** toggle recalculates correctly.
- [ ] **Exclusive / Inclusive** price mode recalculates correctly.
- [ ] Subtotal, VAT and total are **cents-safe** (integer cents, no drift).
- [ ] Five blank line rows initially; inputs comfortably sized.
- [ ] **Add line** appears directly below the final row.
- [ ] **Enter** on the final row creates a new line and focuses Description — **never submits** the document.
- [ ] Blank or incomplete documents can always **Save Draft**.

### E2 — Full-width workspace layout (J-6.1 addendum)

- [ ] Quote and Invoice **create, edit, detail and preview** screens use the **full usable width** beside the TITAN sidebar (no narrow centred column).
- [ ] Outer page margin is **20–24px** only; no empty side columns.
- [ ] Customer and document details use a **balanced responsive grid**; addresses use available width.
- [ ] Line-item table spans **100% of content width**; Description is the **widest column**; price/qty/VAT/totals remain readable.
- [ ] Notes and totals sit in a **two-column section** on desktop where applicable.
- [ ] Customer and catalogue search dropdowns **align with their fields** and show readable results.
- [ ] **Tablet** reflows to fewer columns; **mobile** stacks vertically with **no horizontal page overflow**.
- [ ] Long customer names, addresses and descriptions **wrap cleanly**; Young Guns dark theme preserved.

### E3 — Catalogue line search (J-6.2)

- [ ] Line description search returns **tenant inventory** and **Young Guns labour/service pricebook** items only.
- [ ] Each result shows its **source type** (Inventory / Young Guns labour / Young Guns service).
- [ ] Selecting an item **auto-fills** description, qty, unit, price — all fields remain editable.
- [ ] **Manual/custom line** always available when search fails or is skipped.
- [ ] **Same catalogue item may appear on multiple lines** (e.g. separate work sections) — optional warning only, never blocked.
- [ ] Saving a draft does **not** deduct inventory or mutate master catalogue items.
- [ ] **Enter** on catalogue dropdown selects highlighted item; **Enter** on final blank line adds a new line — document never submits.

### F — Round-trip persistence

- [ ] Quote: dates, notes, customer reference (if shown), all three addresses, line items, VAT mode and totals survive save → hard refresh → reopen.
- [ ] Invoice: same fields including **customer reference** (`STAGING-QA-REF` for QA doc).
- [ ] Edit notes and one address → Save Draft → refresh → edits persist.
- [ ] **No persistent “Draft saved · time”** message appears.

### G — Live updates

- [ ] Open Finance list in a **second authenticated tab**.
- [ ] Save a change to one QA draft — list updates **without manual refresh**.
- [ ] While editing unsaved fields, a safe draft update in the other tab shows **deferred-update warning** — dirty form not overwritten.
- [ ] Connection returns to **Live** after reconnect.

### H — Final safety

- [ ] No unexpected 500 responses.
- [ ] No duplicate customers created.
- [ ] No Xero sync, write approval, Yoco link, email or WhatsApp triggered.
- [ ] Record QA quote and invoice IDs; record after counts.

**J-5 completion gate:** PASS all sections A–H → **GO** for Finance Editor Phase 1 complete; any FAIL → repair prompt + **NO-GO**.

---

## Phase J-6.2 — Final finance editor corrections

**Status:** **IMPLEMENTED locally** — awaiting Owner approval before staging release.

**Ancestry (verified):** `HEAD` → `d23b79a` → `c3566ba` → `99d3e8e`

### Catalogue data sources (exact)

| Source | Table / service | Scope | Notes |
|--------|-----------------|-------|-------|
| Tenant inventory | `inventory_items` via `FinanceService.searchCatalogueItems` | `company_id = tenant`, `status = active`, ILIKE on sku/name/description, limit 24 → ranked to 12 | Materials, parts and any labour/service rows stored as inventory SKUs |
| Young Guns pricebook | **Not in database** (YGP-001 queued) | — | No hardcoded fallback; manual/custom line when no inventory match |
| Supplier catalogue | `supplier_price_catalogue_items` | Procurement only | **Not wired** to finance line search |

**No parallel catalogue DB created.** Selection copies values to quote/invoice line snapshots only — no master mutation, no draft stock deduction.

### Acceptance requirements

| Area | Requirement | Status |
|------|-------------|--------|
| Full-width workspace | Quote/Invoice create, edit, detail and preview fill usable width; 20–24px padding; responsive grid; line table 100%; notes + totals two-column on desktop | **DONE** (`d23b79a` — not reworked) |
| Responsive safety | No `overflow-x: clip`; controlled table scroll; reflow at 1024px / 768px; fields/actions accessible at ~1440 / 1024 / 768 / 390px | **DONE** |
| Catalogue search | Tenant `inventory_items` only until YGP-001; source type labelled; manual line always available | **DONE** |
| Duplicate lines | Same item on multiple lines; optional warning only — never blocks; no `exclude` search filter | **DONE** |
| Source integrity | Copy to document line only; no master mutation; no draft inventory deduction | **DONE** |
| Security | `companyId` tenant isolation; finance RBAC; query ≤120 chars; ILIKE + limit 12; cost gated by `canViewFinanceProfit` | **DONE** |
| Enter key | Catalogue Enter selects; final line Enter adds row; never submits document | **DONE** |

### J-6.2 automated tests

- `apps/web/src/features/finance/finance-workspace-layout.test.ts` — full-width, reflow, no clip
- `apps/web/src/features/finance/finance-j62-phase.test.ts` — duplicates, RBAC, debounce, no exclude
- `packages/shared/src/finance-j62-phase.test.ts` — inventory-only sources, duplicate warning
- `packages/shared/src/finance-catalogue.test.ts`
- `apps/api/src/services/finance-catalogue.service.test.ts` — tenant isolation, no BUILTIN, no stock mutation

### Responsive breakpoints verified in CSS/tests

| Viewport | Behaviour |
|----------|-----------|
| ~1440px desktop | 12-column grid; notes + totals side-by-side; line table full width |
| ≤1024px tablet | Single-column card reflow; bottom grid stacks |
| ≤768px mobile | Line items stack as cards; totals full width; action buttons stretch |
| ~390px mobile | Same stack; 1.25rem padding; table wrap scrolls horizontally if needed |

---

## Correct future staging release sequence (J-6.2)

**Use only after Owner approval of local J-6.2 commit.**

1. **Backup** — create and verify a fresh staging backup (`pg_dump` custom format, SHA-256, `pg_restore --list`). Refuse if backup older than 7 days or missing.
2. **Precheck** — confirm `APP_ENV=staging`, `TITAN_ENV=staging`, `DATABASE_URL` ref `cpkuwtaipjxeipvbssvn` only; Xero idle; migration 0177 applied exactly once; 0178 not yet applied.
3. **Apply migration 0178 only** — `node packages/db/scripts/apply-0178-staging-only.mjs` — **never** `drizzle-kit migrate`.
4. **Push recovery branch** — `git push -u origin cursor/titan-v1-integration-recovery`.
5. **Fast-forward deploy branch** — merge/ff `cursor/titan-v1-integration` to the final J-6.2 commit **without force push**.
6. **Railway deploy** — source branch `cursor/titan-v1-integration`; disable startup/blanket migrations on deploy.
7. **Verify deployed revision** — record exact commit SHA on API and Web services before J-5 smoke resumes (sections A–H + E2 + E3).

---

## Migration 0176 specification (pending apply)

**File:** `packages/db/drizzle/0176_titan_finance_editor_fields.sql`  
**Apply script:** `packages/db/scripts/apply-0176-staging-only.mjs`  
**Adds:** `customers.company_name`, `billing_address`, `site_address`, `vat_number`  
**Indexes:** `customers_company_name_idx`, `customers_vat_number_idx`

---

## Owner actions to unblock

1. Place staging credentials at `apps/api/.env.staging.local` with `APP_ENV=staging`, `TITAN_ENV=staging`, and `DATABASE_URL` containing ref `cpkuwtaipjxeipvbssvn` only (never `rshuiaghmtrvvilhqpwm`).
2. Re-run Phases 2–4 from this checkpoint (backup → precheck → apply 0176).
3. Railway dashboard (or `railway login` + CLI):
   - Services: `titan-staging-api`, `titan-staging-web`
   - Source branch: `cursor/titan-v1-integration`
   - Deploy commit: `80a2534` (not `a7fb615`)
   - Disable startup/blanket migrations on deploy
4. Execute Phase 6 smoke tests in authenticated Owner session.

---

## GO / NO-GO

| Gate | Verdict |
|------|---------|
| Staging release DONE | **NO-GO** |
| Reason | Phase 2 backup blocked (no staging credentials on agent host); Phases 3–4 not run; Phase 5 deploy unverified; Phase 6 not executed |

**Do not proceed to production, Xero sync/write, Yoco, migration 0174/0039, or next A–Z phase until this checklist is green.**

---

## Future phases (planned — not started)

### AURA Developer Agent + Cursor Cloud Agent provider

**Status:** **PLANNED / NOT STARTED** — documentation only; **do not implement** until explicit Owner approval for this phase.

**Purpose:** An Owner-only development assistant inside TITAN that sends **approved** change requests to Cursor AI via a first-class backend provider—not a parallel AI system. Cursor must be integrated into TITAN’s existing AI provider registry alongside OpenAI, Claude and Gemini.

**Required workflow (mandatory sequence):**

1. **Request** — Owner submits a change request inside TITAN.
2. **AURA specification** — AURA produces a structured spec (scope, files, risks, test plan).
3. **Owner approval** — Owner explicitly approves the spec before any Cursor run starts.
4. **Cursor backend provider** — Approved request is dispatched through the `cursor_cloud_agent` provider adapter (server-side only).
5. **Isolated Git branch** — Work proceeds only on a dedicated feature branch (never on `main` or production deploy branches).
6. **Automated tests and builds** — CI runs typecheck, relevant tests, and production builds; failures block progression.
7. **Pull request and change report** — PR opened with a human-readable change report (diff summary, changed-file evidence, risks, rollback notes).
8. **Staging deployment** — Deploy approved revision to staging only (requires separate Owner approval before deploy).
9. **Owner smoke test** — Owner verifies behaviour in staging before any production consideration.
10. **Separate production approval** — Distinct Owner gate required for production deploy; staging success alone is insufficient.

**Future provider design (extend existing registry — do not replace):**

1. Add **“Cursor Cloud Agent”** under **Settings → AI Providers**, beside OpenAI, Claude and Gemini.
2. **Provider key:** `cursor_cloud_agent`.
3. Integrate via the **official Cursor TypeScript SDK** or **Cloud Agents API**.
4. Store the Cursor API key **server-side and encrypted**. Never expose it to the browser, logs or prompts.
5. **Capability-based routing** — route to Cursor only when the task matches an allowed capability:
   - `software_change`
   - `bug_diagnosis`
   - `code_review`
   - `test_repair`
   - `build_repair`
6. **Do not route** ordinary AURA business chat, customer replies, finance questions or operations questions to Cursor. Cursor is the specialist coding/development provider only.
7. Support **asynchronous run states:** `queued`, `running`, `awaiting_review`, `completed`, `failed`, `cancelled`.
8. Use **webhooks or safe polling** to update run status inside TITAN.
9. Every run must use an **isolated Git branch** and produce **tests, build results, changed-file evidence and a review report**.
10. Require **Owner approval** before starting Cursor, before staging deployment, and separately before production.
11. **Preserve** the existing OpenAI, Claude and Gemini adapters. **Extend** the existing provider registry—do not create a parallel AI system.
12. Include **health check**, **usage tracking**, **timeout handling**, **cost visibility**, **audit history** and **rollback evidence**.
13. **Never permit:** automatic production changes, automatic migrations, secret exposure, force pushes or unapproved external actions.

**Hard prohibitions (never allowed):**

- Direct production edits or production deploy without a separate Owner approval gate
- Automatic database migrations (migrations require explicit Owner-approved, staged apply — same discipline as Finance 0176/0177)
- Secret exposure (tokens, passwords, `DATABASE_URL`, API keys) in specs, logs, PRs, prompts or agent output
- Unapproved external actions (Xero sync/write, Yoco, email, WhatsApp, paid services, third-party writes)
- Bypassing Git review (no force-push to shared branches, no merge without PR review)
- Routing non-development AURA chat through Cursor

**Required safeguards:**

- **Complete audit log** — every request, spec, approval, provider run ID, branch, commit, deploy ID, and smoke result recorded with actor and timestamp
- **Rollback path** — documented revert steps for code (Git), deploy (Railway prior revision), and database (backup/restore when schema touched)

**Implementation gate:** Owner must approve this phase explicitly before design or code begins. Until then, treat as backlog only.
