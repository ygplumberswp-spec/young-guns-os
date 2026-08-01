# TITAN Pilot Readiness Report

**Organisation:** Young Guns Plumbing  
**Product:** TITAN Business OS, powered by AURA  
**Updated (UTC):** 2026-08-01 — GLOBAL BINDING ACCEPTANCE RULE + master completion freeze  
**Verdict:** **NOT PILOT-READY** (binding rule not met for most modules; deferred work in next stage plan)  
**Master completion staging:** **OWNER APPROVED / FROZEN BASELINE** @ `60b4829` — see `TITAN_STAGING_BASELINE_FREEZE.md`

---

## GLOBAL BINDING ACCEPTANCE RULE

Pilot sign-off requires compliance with `TITAN_BINDING_ACCEPTANCE_RULE.md` across operational chain, security, reliability, financial, and provider truth gates. Current complete-app audit: **2 PASS / 18 PARTIAL / 3 FAIL** — see `TITAN_COMPLETE_APP_AUDIT.md`.

---

## Gate summary

| Gate | Status | Evidence | Blocker |
|------|--------|----------|---------|
| **Operational chain** | PARTIAL | Phase 5 **10/10 GO**, Phase 6 **12/12 GO** (Sprint 017 rerun); Phases 8–12 staging blocked (deploy + DB creds) | Railway redeploy + migrations 0105–0106; live Xero |
| **Security** | PARTIAL | Code-level RBAC; secure persistent session local **GO** (`TITAN_SECURE_SESSION_ARCHITECTURE.md`); cross-tenant E2E incomplete | Phase 2 matrix; staging session click-path with Owner token |
| **Reliability** | PARTIAL | Offline/retry UX-B; backup dry-run documented | Restore proof on clone |
| **Financial** | PARTIAL | UX-E staging; Xero two-way scaffold (Sprint 186) — read ~71%, write ~25% | Import GO + verify queue; Owner write test |
| **Provider truth** | PARTIAL | FRZ-015 **GO**; Xero import `8e6aec9b…` running; two-way **NOT GO** | Await import complete + `TITAN_XERO_TWO_WAY_VERIFY_QUEUE.md` |

---

## Operational gate detail

Required path:

1. Create legitimate test lead (staging tenant, clearly marked test data)  
2. Convert → customer + property + job with **real street, suburb, SA mobile**  
3. Schedule + assign crew/vehicle  
4. Technician accept → travel → work → photos → materials → complete  
5. Quote/invoice/payment (staging, no live Xero write initially)  
6. Profit view  
7. Approved job pack send (when implemented)  

| Step | Status |
|------|--------|
| Lead convert | **PASS** — Phase 5 staging E2E **10/10** (`TITAN_STAGING_VERIFICATION_SPRINT017_REPORT.md`) |
| Schedule/assign | **PASS (office)** — Phase 6 staging E2E **12/12** |
| BOQ / job packs / day-timeline | **BLOCKED** — deployed API 404 on new routes; needs redeploy + migrations |
| Finance chain | UX-E staging — Phase 12 invoice-from-job not re-proven this cycle |
| Job pack | **Local foundation** — staging blocked (0106 + deploy) |

---

## Security gate detail

| Check | Status |
|-------|--------|
| Owner vs Technician vs Client separation | Partial — contract tests + staging UX-B |
| Tenant isolation | Partial — needs negative API probe matrix |
| Direct URL/API forbidden access | Partial |
| Audit on sensitive actions | Partial — enterprise security exists |
| MFA at login | **FAIL** — PLT-008 |

---

## Reliability gate detail

| Check | Status |
|-------|--------|
| Offline queue + idempotent flush | VERIFIED staging (UX-B) |
| Duplicate completion protection | VERIFIED staging |
| Error recovery UX | Partial |
| Backup procedure documented | Yes |
| Restore tested on clone | Documented dry-run |

---

## Financial gate detail

| Check | Status |
|-------|--------|
| VAT on quotes/invoices | UX-E staging |
| TITAN job # → Xero Reference | UX-E staging |
| No fake Xero invoice numbers | Enforced in UI/API |
| Payment reconciliation | Staging manual record |
| Actual job profit | Partial |

---

## Provider gate detail

See `TITAN_PROVIDER_STATE_REGISTER.md`. **Zero** providers verified connected in this cycle.

Minimum for pilot:
- [ ] AURA OpenAI verified  
- [ ] Xero read-only staging connect  
- [ ] Email or WhatsApp for comms (one channel)  
- [ ] Cartrack OR honest maps fallback for dispatch  

---

## Approved pilot limits (when gates pass)

| Limit | Value |
|-------|-------|
| Users | Young Guns internal crew only |
| Tenants | Single company tenant |
| Customers | Clearly marked test + real internal jobs only |
| Financial writes | Staging Xero org or read-only until Owner approves |
| Marketing sends | Disabled until consent + provider verified |
| Geographic scope | Cape Town operations context |

---

## Rollback plan

1. Redeploy prior known-good Railway image/commit  
2. Database: forward-only migrations — restore from backup if bad migration applied  
3. Document: `TITAN_PRODUCTION_ROLLBACK_PLAN.md`, `TITAN_STAGING_ROLLBACK_TEST.md`  

---

## Support plan (draft)

| Role | Contact | Responsibility |
|------|---------|----------------|
| Product Owner | Founder | Approvals, credentials, pilot sign-off |
| Engineering | Cursor autonomous run | Fixes, tests, documentation |
| Staging verification | Cursor + Owner click-path | E2E evidence |

---

## Exact blocker for pilot sign-off

**FRZ-015:** **GO** — Owner configured Railway; live synthetic AURA verify 12/12 on staging. **FRZ-018:** **PARTIAL** — OAuth connected (Young Guns Plumbing); SCHEDULERS_ENABLED; 49 contacts; 0 `integration_sync_schedules` — Owner must reconnect Xero to seed auto-sync schedule.
