# Railway staging — TITAN monorepo

## Why Railpack previously ran

This repo has **no** root `Dockerfile` (files are `infra/docker/Dockerfile.api` / `Dockerfile.web`).  
If Railway does not apply `builder = DOCKERFILE` + `dockerfilePath`, it falls back to **Railpack** (“Detected Node”).

## Canonical Config-as-code paths (use these in the Railway UI)

| Service | Config-as-code path | Dockerfile |
|---------|---------------------|------------|
| `titan-staging-api` | **`/apps/api/railway.toml`** | `/infra/docker/Dockerfile.api` |
| `titan-staging-web` | **`/apps/web/railway.toml`** | `/infra/docker/Dockerfile.web` |

These live at the **package roots**, which is where Railway’s monorepo docs detect `railway.toml` / `railway.json`.

Do **not** rely on `/infra/staging/railway/...` as the service Config-as-code path (kept only as documentation mirrors).

## Required service settings

1. **Root Directory**: empty (`/`) — Dockerfiles need monorepo context  
2. **Config-as-code**: paths in the table above  
3. **Variable** (official Dockerfile override):  
   - API: `RAILWAY_DOCKERFILE_PATH=/infra/docker/Dockerfile.api`  
   - Web: `RAILWAY_DOCKERFILE_PATH=/infra/docker/Dockerfile.web`  
4. Do not set a Custom Start Command (image CMD is correct)

## Expected build log (success)

```
==========================
Using detected Dockerfile!
==========================
```

If you still see `Detected Node` / Railpack, the Config-as-code path or `RAILWAY_DOCKERFILE_PATH` is wrong.
