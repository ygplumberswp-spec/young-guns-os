# Finance direct attachments — staging storage and Railway volume

Phase J-6.4B stores quote/invoice attachments in the **job evidence filesystem root** (`JOB_EVIDENCE_STORAGE_PATH`). Finance direct bytes are kept separate from job evidence by path layout only.

## Environment variable

| Environment | Variable | Default |
|-------------|----------|---------|
| Local dev | `JOB_EVIDENCE_STORAGE_PATH` | `storage/job-evidence` (repo-relative) |
| Test | unset | temp directory per test |
| Staging | `JOB_EVIDENCE_STORAGE_PATH` | `/var/lib/titan/storage/job-evidence` |
| Production | `JOB_EVIDENCE_STORAGE_PATH` | `/var/lib/titan/storage/job-evidence` |

Company media continues to use `COMPANY_MEDIA_STORAGE_PATH` separately.

Finance direct attachments **do not** use a second volume variable on this ancestry — they share the job evidence root with distinct subpaths.

## Tenant path layout

```
{companyId}/finance/staging/{draftClientActionId}/{fileId}.bin
{companyId}/finance/staging/{draftClientActionId}/{fileId}.json
{companyId}/finance/document/{documentId}/{fileId}.bin
```

Job evidence remains under its existing `{companyId}/jobs/...` layout and is never touched by finance staging cleanup.

## Railway volume mount (staging and production)

1. Create a Railway volume on the **API service** (`titan-staging-api` / production API).
2. Mount the volume at **`/var/lib/titan/storage`**.
3. Keep environment variables aligned with the Dockerfile defaults:
   - `JOB_EVIDENCE_STORAGE_PATH=/var/lib/titan/storage/job-evidence`
   - `COMPANY_MEDIA_STORAGE_PATH=/var/lib/titan/storage/company-media`
4. Redeploy the API after attaching the volume.

Without a mounted volume, the API still boots using container-local directories under `/var/lib/titan/storage`, but **bytes are lost on redeploy**. Startup validation refuses ephemeral `/app` paths in staging/production.

## Diagnostics

```bash
# Storage configuration (read-only)
pnpm --filter @titan/api exec node --import tsx src/bin/storage-diagnostic.ts

# PDF renderer Chromium availability (read-only)
pnpm --filter @titan/api exec node --import tsx src/bin/pdf-renderer-diagnostic.ts
```

HTTP diagnostics (authenticated infrastructure use only — no raw paths returned):

- `GET /api/v1/health/storage`
- `GET /api/v1/health/pdf-renderer`

## Abandoned staged file cleanup

Staged uploads correlated by `draftClientActionId` may be deleted once older than the retention window **and** unreferenced by any `titan_documents.photos` entry with `source: finance_direct`.

Default retention: **7 days** (`FINANCE_STAGING_EVIDENCE_RETENTION_DAYS_DEFAULT`).

```bash
# Audit only
pnpm --filter @titan/api exec node --import tsx src/bin/finance-staging-cleanup.ts --dry-run

# Delete eligible files
pnpm --filter @titan/api exec node --import tsx src/bin/finance-staging-cleanup.ts

# Tenant-scoped, custom retention
pnpm --filter @titan/api exec node --import tsx src/bin/finance-staging-cleanup.ts \
  --company-id=<uuid> --retention-days=14 --dry-run
```

Cleanup is **not** invoked during normal API startup. Schedule it manually or via a future Railway cron once staging is live.

## Chromium / finance PDF preview

The API Docker image installs system Chromium and sets:

- `PUPPETEER_SKIP_DOWNLOAD=true`
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`

Finance preview PDFs are rendered server-side via headless Chromium. If Chromium is unavailable, preview PDF requests return `CHROMIUM_UNAVAILABLE`.
