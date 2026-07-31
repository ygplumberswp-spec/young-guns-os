# Railway Railpack fallback — root cause and fix

## Root cause

1. This monorepo’s production images are **`infra/docker/Dockerfile.api`** and **`Dockerfile.web`**, not a root file named `Dockerfile`.
2. Railway only auto-detects a Dockerfile when it is named exactly `Dockerfile` at the service root ([docs](https://docs.railway.com/builds/dockerfiles)).
3. The service Config-as-code path pointed at `/infra/staging/railway/titan-staging-api/railway.toml`. That nested path is **not** the package-root location Railway documents for monorepo config detection (`apps/<pkg>/railway.toml`). When that custom config was not applied to the deployment, Railway used the default builder **Railpack**.
4. Relative `dockerfilePath = "infra/docker/Dockerfile.api"` (no leading `/`) was also non-canonical; Railway staff guidance is to use a path from repo root with a leading `/` when needed ([station](https://station.railway.com/questions/config-as-code-questions-regarding-paths-dbf35562)).
5. Resulting log (`Detected Node` / pnpm / no start command) is exactly Railpack on a pnpm workspace — proof `builder = DOCKERFILE` never took effect.

## Fix (aligned with Railway docs)

1. Place config-as-code at package roots:
   - `/apps/api/railway.toml` + `railway.json`
   - `/apps/web/railway.toml` + `railway.json`
2. Set `builder = "DOCKERFILE"` and **absolute** `dockerfilePath = "/infra/docker/Dockerfile.api"` (web: `Dockerfile.web`).
3. Document / require service variable `RAILWAY_DOCKERFILE_PATH` ([official custom Dockerfile path](https://docs.railway.com/builds/dockerfiles)).
4. Keep `infra/staging/railway/*` as synced mirrors only; UI must point at `/apps/api/railway.toml`.

## Dashboard action required after push

On `titan-staging-api` → Settings:

- Config-as-code file → **`/apps/api/railway.toml`** (change away from `/infra/staging/...`)
- Variables → add `RAILWAY_DOCKERFILE_PATH=/infra/docker/Dockerfile.api`
- Root Directory → empty
- Redeploy

On `titan-staging-web` → Settings:

- Config-as-code → **`/apps/web/railway.toml`**
- `RAILWAY_DOCKERFILE_PATH=/infra/docker/Dockerfile.web`
