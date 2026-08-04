# AGENTS.md

## Cursor Cloud specific instructions

TITAN-AURA-V1 is a single-product **pnpm workspace monorepo** (an AI Business Operating System). The end-to-end dev stack is: **PostgreSQL** (required) + **Redis** (optional) + **`@titan/api`** (Express, port 3000) + **`@titan/web`** (React/Vite SPA, port 5173, proxies `/api` → `:3000`). Standard scripts live in the root `package.json` and `README.md`; the notes below are only the non-obvious cloud gotchas.

### Services / infra
- **Docker is not used in the cloud VM.** The documented `docker compose -f infra/docker/docker-compose.yml up` path won't work here — Postgres 16 and Redis 7 are installed natively into the VM snapshot instead. Start them (they do not auto-start on boot) with:
  - `sudo pg_ctlcluster 16 main start`
  - `sudo redis-server --daemonize yes`
- Database is provisioned to match `.env.example`'s `DATABASE_URL`: role `titan` / password `titan`, database `titan_aura`, on `localhost:5432`. `pnpm db:migrate` (drizzle-kit) reads `DATABASE_URL` and also falls back to that same URL by default (see `packages/db/drizzle.config.ts`).

### Env file (non-obvious)
- The API dev process is `node --watch --env-file=.env ...` run **from `apps/api/`**, so it reads **`apps/api/.env`**, NOT the repo-root `.env` that the README's `cp .env.example .env` suggests. Create it with `cp .env.example apps/api/.env`. `apps/api/.env` is git-ignored.

### Running / verifying
- Run everything with `pnpm dev` (API + web in parallel). Health checks: `GET /api/v1/health` and `GET /api/v1/health/ready` (the latter reports `database` + `redis` connection status).
- Providers/integrations are gated off by default (`PROVIDERS_ENABLED=false`); AURA AI returns placeholder responses unless `AURA_OPENAI_API_KEY` is set. Neither is needed for core flows.

### Core flow gotchas
- `POST /api/v1/auth/signup` requires `companyName`, `firstName`, `lastName`, `email`, `password` (not a single `name`). The access token is returned at `data.session.accessToken`; authenticated requests use either the `Authorization: Bearer <token>` header or the session cookies set on signup/login.

### Lint / test / build
- `pnpm lint` is a no-op (no ESLint config in the repo). `pnpm format:check` currently reports pre-existing Prettier violations across many files — this is the repo's existing state and is unrelated to environment setup. CI (`.github/workflows/ci.yml`) runs `format:check`, `typecheck`, and `build` (it does not run `pnpm test`).
