# TITAN Pilot Readiness Report

**Organisation:** Young Guns Plumbing  
**Product:** TITAN Business OS, powered by AURA  
**Updated (UTC):** 2026-08-01 — Phase 5 staging partial gate  
**Verdict:** **NOT PILOT-READY** (crew/vehicle chain open)

---

## Gate summary

| Gate | Status | Evidence | Blocker |
|------|--------|----------|---------|
| **Operational chain** | PARTIAL | Phase 5 lead→job **10/10 GO** on staging API | Phase 6 schedule/assign proof |
| **Security** | FAIL | Code-level RBAC; cross-tenant E2E incomplete | Phase 2 matrix |
| **Reliability** | PARTIAL | Offline/retry UX-B; backup dry-run documented | Restore proof on clone |
| **Financial** | PARTIAL | UX-E staging without live Xero | Xero OAuth + read sync |
| **Provider truth** | FAIL | No provider verified connected this cycle | Credentials + verification |

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
| Lead convert | **PASS** — Phase 5 staging E2E 10/10 (`TITAN_PHASE5_STAGING_REPORT.md`) |
| Schedule/assign | Partial — UX-D |
| Mobile execution | Staging UX-B closed prior commit |
| Finance chain | UX-E staging — no live Xero |
| Job pack | **Missing/incomplete** |

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

**Staging deployment of commit `8d35bfd` + lead conversion E2E with real SA address — requires Owner approval for staging deploy.**
