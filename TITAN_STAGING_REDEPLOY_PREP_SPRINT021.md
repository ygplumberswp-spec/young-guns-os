# Sprint 021 — Staging redeploy preparation

**Date:** 2026-08-01  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Target fix commit:** `58a16b7` (APP_URL placeholder heuristic)  
**Remote HEAD after push:** `4e94ef6` (includes `58a16b7`)  
**Production:** not touched

---

## 1. Commit verification

| Check | Result |
|-------|--------|
| `58a16b7` on local `cursor/titan-frozen-scope-completion` | **YES** |
| `58a16b7` ancestor of local HEAD | **YES** (`4e94ef6`) |
| Fix message | `Fix APP_URL false positive for TITAN staging web hostname.` |

---

## 2. GitHub push status

| Check | Result |
|-------|--------|
| Branch on GitHub before this prep | **NO** — only `main`, `claude/*` |
| Action taken | **Pushed** `cursor/titan-frozen-scope-completion` → `origin` (no force-push) |
| Remote HEAD | `4e94ef65950eff08668a95637fe7146c0a5c7865` |
| `58a16b7` on remote branch | **YES** (ancestor of remote HEAD) |
| Merged to `main` | **NO** |

---

## 3. Railway staging API — inferred deploy source

| Check | Result |
|-------|--------|
| Railway CLI / token on runner | **Unavailable** — cannot read live service settings |
| GitHub branches available to Railway before push | `main` @ `8d35bfd`, `claude/*` |
| `cursor/titan-frozen-scope-completion` on GitHub before push | **Absent** → Railway **could not** deploy this branch |
| **Inferred connected branch** | **`main`** @ `8d35bfd` |
| **Inferred deploy commit on next `main` build** | `8d35bfd` — *still includes buggy* `host.includes('comfortable-determination')` |
| Live API (pre-switch) | `GET /api/v1/health/live` → 200; `/api/v1/health/ready` → 503 (`28P01`) |

**Conclusion:** Railway staging API is almost certainly wired to **`main`**, not the completion branch. Owner must switch the service branch (one dashboard action below) then redeploy.

---

## 4. Owner action (single — Railway dashboard)

1. Open Railway project **`sweet-victory`** (staging environment).
2. Select service **`titan-staging-api`** (host `young-guns-os-staging.up.railway.app`).
3. **Settings → Source → Branch** → set to **`cursor/titan-frozen-scope-completion`** (not `main`).
4. **Deploy** (or wait for auto-deploy) — confirm build uses commit **`4e94ef6`** or at least **`58a16b7`**.

Repeat branch switch for **`titan-staging-web`** if that service also tracks `main`.

**Do not change** `APP_URL` or `DATABASE_URL` (already set correctly).

---

## 5. Post-switch verification (agent — after Owner confirms)

- [ ] Redeploy staging API + web from completion branch
- [ ] `GET /api/v1/health/ready` → 200, `database=connected`
- [ ] Phase 5 / 6 / 8–12 public E2E smokes
- [ ] Update acceptance register, sprint log, evidence index

---

## 6. Evidence paths

- Push: `origin/cursor/titan-frozen-scope-completion` @ `4e94ef6`
- Prior deploy blockers: `diagnostic-output/167-staging-deploy-verification-summary.json`
- APP_URL fix: `apps/api/src/lib/public-url.ts` @ `58a16b7`
