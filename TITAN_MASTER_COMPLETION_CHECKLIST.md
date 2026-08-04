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

### Phase 6 — Owner authenticated smoke test

All 19 items — **NOT RUN** (requires Owner browser session; agent has no authenticated session).

**Phase 6 result:** **NOT STARTED**.

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
