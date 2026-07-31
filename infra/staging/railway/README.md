# Railway staging service configs

**GitHub repo:** `ygplumberswp-spec/young-guns-os`  
**Environment:** `staging` only  
**Status:** Config prepared — **do not deploy** until approved

## Detected monorepo roots

| Service | Package | App directory | Dockerfile | Verified start |
|---------|---------|---------------|------------|----------------|
| `titan-staging-api` | `@titan/api` | `apps/api` | `infra/docker/Dockerfile.api` | `node --import tsx src/index.ts` (image CMD; workdir `apps/api`) |
| `titan-staging-web` | `@titan/web` | `apps/web` | `infra/docker/Dockerfile.web` | nginx on `8080` serving `apps/web/dist` |

Docker builds must use **repository root** as context (Dockerfiles copy workspace packages).

## Apply in Railway dashboard (no CLI required)

For each service in the **staging** environment:

### titan-staging-api

1. Source: GitHub `ygplumberswp-spec/young-guns-os` (branch as agreed, typically `main`).
2. Builder: Dockerfile  
3. Dockerfile path: `infra/docker/Dockerfile.api`  
4. Root directory: `/` (repo root)  
5. Healthcheck path: `/api/v1/health/ready`  
6. Public networking: **off** (do not generate domain)  
7. Variables: copy non-secret defaults from `titan-staging-api.env.staging.names`; enter secrets in UI only  
8. **Do not Deploy** yet  

### titan-staging-web

1. Same GitHub repo / staging environment  
2. Dockerfile path: `infra/docker/Dockerfile.web`  
3. Root directory: `/`  
4. Healthcheck path: `/healthz`  
5. Build args / vars: `VITE_APP_ENV=staging`, `VITE_TITAN_ENV=staging`, `VITE_API_BASE_URL=` (empty for now)  
6. Public networking: **off** (do not generate domain)  
7. **Do not Deploy** yet  

## Out of scope

- Redis service  
- Worker / scheduler services  
- Custom DNS  
- Production database credentials  
- Provider activation  
