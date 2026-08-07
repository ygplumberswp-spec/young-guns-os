# TITAN Secure Persistent Session Architecture

**Status:** Implemented (local + staging verify script)  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Related:** [GLOBAL BINDING ACCEPTANCE RULE](TITAN_BINDING_ACCEPTANCE_RULE.md)

## Goal

Users remain signed in during normal work (tab switches, refresh, brief offline, mobile background) without storing auth tokens in `localStorage`. Sensitive actions still require recent password confirmation.

## Topology (Railway staging/production)

```
Browser (web origin)
  └─ same-origin /api/v1/*  (nginx proxy)
       └─ API service /auth/*
            └─ HttpOnly refresh cookie: titan_refresh_token
                 path=/api/v1/auth, SameSite=Lax, Secure (prod/staging)
```

`resolveApiBase()` + `coerceSameOriginApiBase()` force same-origin `/api/v1` when Vite/runtime config points at a different API host, so refresh cookies survive hard reload.

## Token model

| Layer | Lifetime | Storage |
|-------|----------|---------|
| Access JWT | ~15 min (configurable `TITAN_ACCESS_TOKEN_TTL_SECONDS`) | Memory (React state) |
| Refresh token | 7 days default; 30 days trusted device | HttpOnly cookie |
| Step-up token | 5 min | Memory / request header |

Refresh rotation revokes the previous server session row and issues a new refresh token. Presenting a revoked refresh token triggers **reuse detection** and revokes all active sessions for that user.

## Web bootstrap flow

1. `AuthProvider` calls `POST /auth/refresh` before `ProtectedRoute` renders children.
2. Loading gate shows **Restoring your session…** (no login flash).
3. Bootstrap states: `missing` | `expired` | `unreachable` | `authenticated`.
4. Only true refresh rejections redirect with `?reason=session_expired`.
5. `returnTo` query + sessionStorage preserve deep links (e.g. `/integrations/xero`).

## Cross-tab coordination

- `BroadcastChannel` (`titan-staff-session`): login, logout, refresh, session_expired.
- `localStorage` refresh lock prevents duplicate concurrent refresh calls across tabs.

## Step-up auth (sensitive actions)

`POST /auth/step-up` verifies password and returns a short-lived step-up JWT. Mutations on sensitive routes (e.g. `/enterprise-security/policy`) require header `x-titan-step-up`.

User stays logged in; only the sensitive action needs re-confirmation.

## Session management UI

- **All users:** `/settings/security` — current device, other sessions, revoke one, sign out others.
- **Owner/security roles:** `/security` enterprise center — tenant-wide sessions, MFA, audit.

## Configurable tenant policy

`security_tenant_policies.session_timeout_minutes` (default 480) applies to **inactivity**, using `sessions.last_activity_at`. Tab visibility alone does not sign users out.

## Migration

`0108_secure_session_enhancements.sql` adds `last_activity_at`, `is_trusted_device`, `revoked_reason` to `sessions` only — safe to queue behind active Xero import.

## Evidence

- `apps/api/src/routes/session-refresh.test.ts`
- `apps/web/src/lib/session-expiry.test.ts`
- `apps/web/src/lib/secure-session.test.ts`
- `packages/auth/src/secure-session.test.ts`
- `diagnostic-output/184-secure-session-staging-verify.json`

## GLOBAL BINDING ACCEPTANCE RULE

Secure session work satisfies binding criteria for authentication surfaces: truthful UX states, tenant isolation on restore, retry-safe reads, no token leakage to `localStorage`, staging verification script included.
