# BrowserStack Audit Sandbox (QA-0)

Staging-only tenant for Website Scanner, Test Companion, Playwright, Automate, Percy and accessibility testing.

## Tenant

| Field | Value |
|-------|-------|
| Company | TITAN Audit Sandbox |
| Slug | `titan-audit-sandbox` |
| Industry | General Field Services |
| Banner | `STAGING AUDIT SANDBOX — NO REAL BUSINESS DATA` |

## Provisioning

```bash
node packages/db/scripts/staging-audit-sandbox-provision.mjs
```

Requires `apps/api/.env.staging.local` with staging `DATABASE_URL` (never production ref `rshuiaghmtrvvilhqpwm`).

Credentials are written to `~/.titan-audit-sandbox/credentials.json` (mode `0600`). **Passwords are not stored in Git or the manifest.**

Reset (destructive, sandbox only):

```bash
STAGING_CONFIRM_RESET=1 node packages/db/scripts/staging-audit-sandbox-reset.mjs
```

## Login URLs

| Role | URL |
|------|-----|
| Company Owner, Dispatcher, Technician | https://comfortable-determination-staging.up.railway.app/auth/login |
| Client (portal) | https://comfortable-determination-staging.up.railway.app/my/login |

## Verified form selectors

| Field | Selector |
|-------|----------|
| Email | `input[name="email"]` or `input[type="email"]` |
| Password | `input[name="password"]` or `input[type="password"]` |
| Submit | `button[type="submit"]` |

Staff submit label: **Sign in**. Portal submit label: **Sign in**.

## Post-login routes

| Role | Expected route |
|------|----------------|
| Company Owner | `/` |
| Dispatcher | `/` |
| Technician | `/mobile` |
| Client | `/my` |

## BrowserStack authenticated scans (Owner configures manually)

Create **four separate** authenticated scans. Enter credentials from `~/.titan-audit-sandbox/credentials.json` manually in BrowserStack — never commit them.

1. **TITAN Audit — Company Owner** — staff login URL, Owner email
2. **TITAN Audit — Dispatcher** — staff login URL, Dispatcher email
3. **TITAN Audit — Technician** — staff login URL, Technician email
4. **TITAN Audit — Client** — portal login URL, Client email

### Company Owner scan setup (example)

1. Open BrowserStack Website Scanner → New scan → Staging URL `https://comfortable-determination-staging.up.railway.app/auth/login`
2. Enable **Form authentication**
3. Login URL: `https://comfortable-determination-staging.up.railway.app/auth/login`
4. Username field selector: `input[name="email"]`
5. Password field selector: `input[name="password"]`
6. Submit selector: `button[type="submit"]`
7. Paste Owner email and password from local credentials file
8. Success indicator: redirect away from `/auth/login` (e.g. `/` dashboard)
9. Restrict crawl to staging host only
10. Do **not** enable OAuth, payment or provider connection flows

## Safety

- No Young Guns Plumbing data copied
- No external providers connected
- Staging outbound gates remain disabled (`OUTBOUND_MESSAGES_ENABLED=false`, etc.)
- Audit sandbox preference `auditSandboxOutboundBlocked=true`
- MFA disabled for scanner accounts (`mfa_required=false`, no enrollment)
- Production never targeted
