# TITAN Production Environment Variables

**Authority:** Hosting foundation (2026-07-31)  
**Templates:** `.env.production.example`, `.env.staging.example`  
**Do not overwrite** `apps/api/.env` with these templates.

---

## Groups

### Application
| Name | Required (prod) | Notes |
|------|-----------------|-------|
| `NODE_ENV` | yes | Must be `production` |
| `APP_ENV` / `TITAN_ENV` | recommended | `production` or `staging` |
| `APP_URL` | yes | Frontend origin (CORS); must not be localhost in production |
| `API_PUBLIC_URL` | yes in production | Public API base for OAuth/webhooks |
| `PORT` / `HOST` | no | Defaults `3000` / `0.0.0.0` |
| `LOG_LEVEL` | no | `info` recommended |
| `SEED_DEV` | yes | Must be `false` in production |

### Database
| Name | Required | Notes |
|------|----------|-------|
| `DATABASE_URL` | yes | Postgres/Supabase; SSL in hosted envs |

### Authentication
| Name | Required | Notes |
|------|----------|-------|
| `JWT_SECRET` | yes | ≥32 chars |
| `JWT_REFRESH_SECRET` | yes | ≥32 chars |
| `INTEGRATIONS_ENCRYPTION_KEY` | yes in production | ≥32 chars; encrypts stored provider credentials |

### Supabase
| Name | Required | Notes |
|------|----------|-------|
| `SUPABASE_URL` | optional | Metadata / client tooling |
| `SUPABASE_ANON_KEY` | optional | Never embed service role in frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | Secrets manager only |

### Redis / queues / workers
| Name | Required | Notes |
|------|----------|-------|
| `REDIS_URL` | recommended prod | Auth + persistence for hosted Redis |
| `READY_REQUIRE_REDIS` | default false unless Redis URL + non-staging prod | Staging without Redis must pass `/health/ready`; set `true` when Redis is required |
| `WORKERS_ENABLED` | default false (prod) | Standalone/in-process workers |
| `SCHEDULERS_ENABLED` | default false (prod) | Due-schedule processing |
| `AUTOMATIONS_ENABLED` | default false (prod) | Native automation loop |

### Storage
| Name | Required | Notes |
|------|----------|-------|
| `COMPANY_MEDIA_STORAGE_PATH` | recommended | Durable volume/object mount |
| `JOB_EVIDENCE_STORAGE_PATH` | recommended | Durable volume/object mount |
| `STORAGE_*` | optional | S3-compatible object store |

### Runtime / provider gates (defaults OFF)
| Name | Default | Notes |
|------|---------|-------|
| `PROVIDERS_ENABLED` | false | Master outbound provider gate |
| `WEBHOOKS_ENABLED` | false | Public webhook acceptance |
| `OUTBOUND_MESSAGES_ENABLED` | false | WhatsApp/SMS/email send |
| `PAYMENT_PROCESSING_ENABLED` | false | Yoco/payments |
| `XERO_SYNC_ENABLED` | false | Requires `PROVIDERS_ENABLED` |
| `WHATSAPP_ENABLED` | false | Requires `PROVIDERS_ENABLED` |
| `EMAIL_SENDING_ENABLED` | false | Requires `PROVIDERS_ENABLED` |

### Provider credentials (placeholders only until activation)
Xero, WhatsApp, SMTP, Yoco, Cartrack, Google, Meta, n8n, AURA — see `.env.production.example`.  
**Never enable until a gated activation task.**

### Web build-time (Vite / Dockerfile.web)
| Name | Required (staging cloud) | Notes |
|------|--------------------------|-------|
| `VITE_APP_ENV` | yes for staging UI | Set `staging` so STAGING badge / `data-titan-env` appear |
| `VITE_TITAN_ENV` | recommended | Mirror `staging` |
| `VITE_API_BASE_URL` | yes when web≠API origin | Public HTTPS API origin, no trailing slash; empty = same-origin `/api/v1` |

### Observability
| Name | Notes |
|------|-------|
| `SENTRY_DSN` | Optional; do not activate without approval |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional future |

---

## Startup failure behaviour

`loadEnv()` throws and process exits if:

- Required vars missing/invalid (Zod)
- `SEED_DEV=true` with `NODE_ENV=production`
- Production missing `API_PUBLIC_URL` or `INTEGRATIONS_ENCRYPTION_KEY`
- Production `APP_URL` is localhost

Standalone worker/scheduler exit code `2` if their enable flags are false.

---

## Development vs production defaults

| Flag | Development default | Production default |
|------|---------------------|--------------------|
| Workers / schedulers / automations | **true** (preserve local native loops) | **false** |
| All provider / outbound / webhook flags | **false** | **false** |
| `READY_REQUIRE_REDIS` | false | true |
