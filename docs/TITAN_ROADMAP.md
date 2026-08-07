# TITAN Platform Roadmap

**Status:** Authoritative sequencing reference  
**Last updated (UTC):** 2026-08-06  
**Worktree:** `/workspace/.worktrees/titan-recovery`  
**Deploy branch:** `cursor/titan-v1-integration`

---

## Active work (do not interrupt)

**XERO-002** — Controlled live proof gate sequence (Gates 5B–7 remaining).  
**Do not implement PRICEBOOK-001, DASH-002, or other major features during active Xero proof.**

See: [TITAN_XERO_002_LIVE_PROOF_PLAN.md](./TITAN_XERO_002_LIVE_PROOF_PLAN.md)

---

## Locked platform sequence

Execute in order after prior gates close. Production forbidden until explicit production approval.

| Order | ID | Name | Status |
|------:|-----|------|--------|
| **—** | **XERO-002** | **Complete Gates 5B–7 and close Xero integration proof** | **ACTIVE** |
| 1 | **PRICEBOOK-001** | **Master Pricebook foundation** | **RECORDED** — not implemented |
| 2 | **DASH-002** | **Customisable no-gap Dashboard grid** | Planned |
| 3 | **AI-FIN-DOC-001** | **AI Financial Capture Engine** | Recorded only |
| 3a | AP-DOC-001 | Supplier Invoice Import | Child — recorded |
| 3b | EXP-REC-001 | Receipt and Till-Slip Capture | Child — recorded |
| 3c | INV-PRICE-001 | Supplier Price List Import | Child — recorded |
| 4 | — | Full BrowserStack role and journey audit | Planned |
| 5 | — | Remaining integration and platform roadmap | Ongoing |
| 6 | **UI-THEME-001** | **App-wide visual finishing (Premium Dark Mode)** | Recorded only |
| 7 | — | Young Guns controlled pilot | Gate |
| 8 | — | Production hardening and launch | Gate |

---

## PRICEBOOK-001 phased delivery (after XERO-002 close)

| Phase | ID | Scope |
|-------|-----|-------|
| A | PRICEBOOK-001A | Core data model, versioning, RBAC, price calculation |
| B | PRICEBOOK-001B | Residential service catalogue and Young Guns YGP codes |
| C | PRICEBOOK-001C | Construction point assemblies and BOQ engine |
| D | PRICEBOOK-001D | Supplier cost integration (INV-PRICE-001) |
| E | PRICEBOOK-001E | Quote, invoice, job-card, purchasing, job-cost integration |

### AI estimating (sequenced after PRICEBOOK-001C foundation)

| Phase | ID | Scope |
|-------|-----|-------|
| A | AI-EST-001A | Plan upload, storage, review workspace |
| B | AI-EST-001B | Fixture and plumbing-point detection |
| C | AI-EST-001C | Takeoff, BOQ, pricebook matching |
| D | AI-EST-001D | Quote generation with Owner approval |
| — | AI-EST-LEARN-001 | Estimate vs actual learning |

**Documentation:**

- [TITAN_MASTER_PRICEBOOK_SPECIFICATION.md](./TITAN_MASTER_PRICEBOOK_SPECIFICATION.md)
- [TITAN_PRICEBOOK_ARCHITECTURE.md](./TITAN_PRICEBOOK_ARCHITECTURE.md)
- [TITAN_AI_ESTIMATING_ENGINE_SPECIFICATION.md](./TITAN_AI_ESTIMATING_ENGINE_SPECIFICATION.md)

---

## Completed / in-progress prerequisites

| ID | Status |
|----|--------|
| PERF-001 | Implemented — staging verified |
| XERO-003 | Implemented |
| BANK-IMPORT-001 / XERO-003A | Implemented |
| DASH-001 | Approved and closed |
| XERO-002 P0 implementation | Complete — live proof in progress |

---

## Cross-reference index

| Document | Purpose |
|----------|---------|
| [TITAN_GAP_CLOSURE_PLAN.md](./TITAN_GAP_CLOSURE_PLAN.md) | Gap tracking and enterprise priorities |
| [TITAN_MASTER_COMPLETION_CHECKLIST.md](./TITAN_MASTER_COMPLETION_CHECKLIST.md) | Requirement-level status |
| [TITAN_INTEGRATION_REGISTER.md](./TITAN_INTEGRATION_REGISTER.md) | Integration catalogue |
| [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md) | Agent workforce phases |

---

## Rules

1. **No duplicate pricing systems** — PRICEBOOK-001 is the sole pricing authority when implemented
2. **No implementation during XERO-002 proof** — record and sequence only
3. **PRICEBOOK-001 before DASH-002** — dashboard grid follows pricebook foundation
4. **Production** — `rshuiaghmtrvvilhqpwm` forbidden until explicit Owner production GO

---

*Roadmap updated 2026-08-06 to register PRICEBOOK-001, AI-EST-001, AI-EST-LEARN-001. No code changes.*
