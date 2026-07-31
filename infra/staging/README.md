# TITAN Staging Deployment Pack

Selected platform: **Railway** (preferred), with **Render** as documented fallback.

## Why Railway

| Criterion | Railway | Render |
|---|---|---|
| Long-running API | Yes | Yes |
| Frontend static/nginx | Yes (Docker) | Yes (Docker) |
| Managed Redis | Yes | Yes (Key Value) |
| Internal networking | Private networking | Private network |
| Health checks | Yes | Yes |
| Secrets | Project variables | Environment groups |
| Rollback | Redeploy prior deploy | Redeploy prior deploy |
| Workers / schedulers | Separate services (keep off) | Background workers (keep off) |
| Supabase | External DATABASE_URL | External DATABASE_URL |
| SA latency | Depends on region (use EU/US closest) | Same |
| Cost control | Usage-based; start minimal | Free/starter with limits |
| Prod promotion | Same Dockerfiles | Same Dockerfiles |

Railway is preferred because the repo already ships production Dockerfiles and Railway maps cleanly to API + web + optional Redis without forcing a Blueprint apply step before owner approval.

## Hard rules

- Never use production Supabase project `rshuiaghmtrvvilhqpwm`
- Never enable provider/worker/scheduler/webhook gates in this phase
- Never purchase custom domains in this phase
- Do not create paid resources without owner approval

## Owner-required actions

See `TITAN_STAGING_OWNER_ACTIONS.md` at repo root.

## Local validation (no cloud bill)

```bash
# Against existing isolated staging Supabase (.env.staging.local)
node packages/db/scripts/staging-controlled-deploy-validate.mjs
```

Optional Docker local stack (requires Docker daemon):

```bash
docker compose -f infra/staging/docker-compose.staging.yml up --build
```
