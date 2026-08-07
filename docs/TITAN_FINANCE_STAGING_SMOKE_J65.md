# Phase J-6.5 — Authenticated finance staging smoke checklist

**Status:** Prepared locally — **not executed** in this phase.

Run only after:

1. Staging API and web are deployed from `cursor/titan-v1-integration-recovery`
2. Migrations **0176 → 0177 → 0178** are applied via guarded staging-only scripts
3. Railway volume is mounted at `/var/lib/titan/storage`
4. Chromium diagnostic passes on the staging API pod

## Required configuration (BLOCKED without these)

| Item | Purpose |
|------|---------|
| `apps/api/.env.staging.local` with `APP_ENV=staging`, `TITAN_ENV=staging`, staging `DATABASE_URL` | API connectivity |
| Staging web origin in `APP_URL` / CORS | Browser login |
| Authorized Owner or finance user credentials (real tenant user — **do not fabricate**) | Authenticated flows |
| `JOB_EVIDENCE_STORAGE_PATH` on persistent volume | Attachment survival across reload |
| Staging API `/api/v1/health/pdf-renderer` → 200 | Genuine PDF preview |

If any item is missing, mark the run **BLOCKED** and record the exact missing configuration.

---

## Quote workflow

1. Log in as authorized Owner/finance user
2. Open **New Quote**
3. Add or select customer (inline create allowed when RBAC permits)
4. Upload **image** and **PDF** without linking a job
5. Open preview → confirm **genuine server-rendered PDF** (not client mock)
6. **Save from Preview**
7. Confirm exactly **one** quote created
8. Reload the edit page
9. Confirm attachments remain visible
10. Toggle **Include in PDF** filtering and re-preview
11. Confirm attachment download works for authorized user

## Invoice workflow

Repeat the equivalent steps on **New Invoice**:

1. Login → New Invoice
2. Customer select/create
3. Direct image + PDF upload (no job)
4. Preview genuine PDF
5. Save from Preview
6. Single invoice created
7. Reload edit page — attachments persist
8. Include-in-PDF filtering
9. Download works

## Security checks

| Check | Expected |
|-------|----------|
| Unauthorized user uploads finance staging/document photo | 401/403 |
| Cross-tenant retrieval of finance photo bytes | 403/404 |
| User without customer-create permission creates customer inline | Blocked UI + 403 on API |
| Technician/unauthorized role views quote/invoice cost fields | Hidden server-side (no unit cost in API payload) |

## Suggested commands (after deploy)

```bash
# Migration verify (read-only)
node packages/db/scripts/verify-0176-staging-only.mjs
node packages/db/scripts/verify-0177-staging-only.mjs
node packages/db/scripts/verify-0178-staging-only.mjs

# Runtime diagnostics on staging pod
curl -sS "$STAGING_API/api/v1/health/pdf-renderer"
curl -sS "$STAGING_API/api/v1/health/storage"
```

## Local authenticated E2E blocker (this phase)

Automated Playwright authenticated finance upload → preview → save → reload was **not run** because staging credentials and a live staging API were out of scope for J-6.5A (local-only). Existing contract tests cover layout, RBAC wiring, and attachment validation without live credentials.

**Exact blockers for full browser smoke:**

- No staging login credentials supplied in this environment
- No live staging API/web URLs wired for Playwright in CI
- Migrations not applied to staging database in this phase

Record pass/fail per checklist row during the controlled staging release phase (post J-6.5A).
