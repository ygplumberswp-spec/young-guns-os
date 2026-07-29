# TITAN-AURA-V1 Architecture

## Overview

TITAN is a multi-tenant AI Business Operating System. AURA is the intelligence layer that powers decisions and assistance across modules.

## Repository Layout

```
apps/api          REST API (Express)
apps/web          Main dashboard (React + Vite)
packages/db       Drizzle ORM + migrations
packages/shared   Shared types and constants
packages/ui       Design system primitives
packages/aura     AURA AI foundation (Milestone 5+)
infra/docker      Local Postgres + Redis
```

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Package manager | pnpm workspaces |
| Frontend | React 19, Vite, Wouter |
| Backend | Express 5, Pino |
| Database | PostgreSQL 16, Drizzle ORM |
| Cache | Redis 7 |

## Principles

- **Zero demo data** — empty database, guided empty states
- **Multi-tenant** — every business table scoped by `company_id`
- **OpenAPI-first** — API contract drives client codegen (later milestones)
- **AURA as platform layer** — tool-calling with RBAC, not a chat wrapper
- **Milestone-driven** — ship small, production-ready slices

## Current State (Milestone 1)

Tenant bootstrap and authentication are live. Database tables: `companies`, `users`, `roles`, `sessions`. No business modules, no AURA, no demo data.

See [MILESTONES.md](./MILESTONES.md) for the implementation roadmap.
