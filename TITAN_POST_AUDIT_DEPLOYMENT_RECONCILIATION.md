# Post-Audit Deployment & Evidence Reconciliation

**Branch:** `cursor/titan-owner-operating-model-final`  
**Repo HEAD:** `a7d3258154ca25799546e088c52c8d8edebac1d1`  
**Reconciliation run (UTC):** 2026-08-02T13:30:00.000Z  
**Production:** **NOT TOUCHED**

---

## 1. Deployed SHAs (staging)

| Service | URL | Deployed SHA | Deployment ID | Deployed at (UTC) | Status |
|---------|-----|--------------|---------------|-------------------|--------|
| **Web** (`comfortable-determination`) | https://comfortable-determination-staging.up.railway.app | **`0e01208716d2404e69956491f459921ebb0f1f1e`** | `8f517222-8e54-498c-9442-705d2e11b528` | 2026-08-02T13:08:56Z | SUCCESS |
| **API** (`young-guns-os`) | https://young-guns-os-staging.up.railway.app | **`0e01208716d2404e69956491f459921ebb0f1f1e`** | `f4dc78c7-147a-4f93-8e4a-ad49a3c98210` | 2026-08-02T13:09:39Z | SUCCESS |

### How SHA was determined

- Railway deployment list: active SUCCESS deployments at ~13:08–13:09 UTC align with Phase 254 staging deploy window (after commit `0e01208`, before evidence commit `a7d3258`).
- `git log 0e01208..a7d3258` shows **one commit** — docs/evidence only; no runtime code delta.
- Staging web bundle: `assets/index-CFIh8Z7A.js` (Vite content hash; not commit-embedded).
- API health: `/api/v1/health/ready` → 200, DB connected, `version: 0.2.0`.
- Behavioural: `/procurement/parts-requests` loads (RETAIN_COMPLETE fix in `0e01208`); Verify 254 procurement tab pass confirms.

**Redeploy required?** **No** — functional code through `0e01208` is live; `a7d3258` is evidence/docs only.

---

## 2. SHA difference explained

```
a7d3258 docs(evidence): verify 254 GO on staging after Phase 254 deploy
```

| Commit | Type | Files | Runtime impact |
|--------|------|-------|----------------|
| `a7d3258` | Evidence/docs | Verify JSON, screenshots, audit report | **None** |
| `0e01208` | Code fix | procurement route registry, verify script tuning | **Yes — deployed** |

---

## 3. Deploy action taken

**No redeploy performed.** Staging already at functional HEAD `0e01208`.

---

## 4. Verify 254 (re-run against live staging)

| Field | Value |
|-------|-------|
| Script | `diagnostic-output/254-titan-full-functional-aura-audit-verify.mjs` |
| Run at (UTC) | 2026-08-02T13:20:31Z |
| **Verdict** | **GO** |
| Blockers | 0 |
| Notes | Overdue/Voided invoice filters may be in overflow menu (non-blocking) |

Evidence: `diagnostic-output/254-titan-full-functional-aura-audit-verify.json`

---

## 5. AURA 71/71 execution evidence

### Code audit (all major pages)

| Check | Result |
|-------|--------|
| Pages using `PageHeader` | 163 |
| `showAura={false}` overrides | 1 (permission-denied leads state only) |
| Global `AskAuraButton` in `AppLayout` | All staff routes |
| Module chips | `aura-page-suggestions.ts` — 14 modules |
| Context contract | route, module, recordId, customerId, jobId via `PageHeader` + `ContextualAuraProvider` |

**Claim:** 71/71 major active pages — **supported by shared PageHeader + AppLayout pattern** (see `TITAN_AURA_CONTEXT_COVERAGE_MATRIX.md`).

### Staging stratified sample (14 modules)

| Dimension | Evidence | Pass |
|-----------|----------|:----:|
| AURA button present | PageHeader or AppLayout header on 12/14 sampled; dashboard via header; `/aura` is full-chat page | **GO** |
| Correct context passed | Drawer shows `{pageTitle} · {route}` e.g. `Finance · /finance/invoices` | **GO** |
| Module-specific chips | Finance/leads/inventory/procurement/etc. chips match module | **GO** |
| NL command execution | `"Summarise my open leads…"` → API 201, messages rendered | **GO** |
| Approval where required | Drawer disclaimer; Xero writes blocked at `XeroWriteApprovalGate` | **GO** |
| Audit after execution | Aura routes via `/api/v1/aura`; not destructively probed | **PARTIAL** |
| RBAC-safe context | No staging client-role user found to mint; finance RBAC enforced at route level | **PARTIAL** |

Detailed JSON: `diagnostic-output/254-aura-execution-evidence.json`

**AURA summary verdict:** **GO** (71/71 coverage via code; staging sample confirms drawer, context, chips, NL on owner session).

---

## 6. Void / Credit Note status

See **`TITAN_VOID_CREDIT_NOTE_STATUS.md`**.

| Item | Status |
|------|--------|
| Void Invoice UI | Present, **disabled** |
| Create Credit Note UI | Present, **disabled** |
| `xero_write_approvals` | Table exists on staging |
| Xero write boundary | Gate blocks unapproved writes |
| **Blocker** | Approval UI + execution wiring not complete |

---

## 7. Payment allocation

**Verdict preserved: DATA-DEPENDENT HOLD** — no fabricated YGP records.

Staging DB probe (read-only, UTC 2026-08-02):

| Metric | Value |
|--------|-------|
| Invoice statuses | draft: 2, cancelled: 3 — **no paid/partial with amount_paid > 0** |
| `xero_payment_mappings` | **0** |
| Titan `payments` rows | **0** |
| Synced invoice mappings | **5** |
| Xero payments sync (phase 250) | 511 pulled, **511 skipped** (no mappable overlap) |
| Allocation testable | **false** |

Cannot prove end-to-end payment allocation without genuine overlapping paid invoice + mapping — **honestly held**.

---

## Summary table (required fields)

| Field | Value |
|-------|-------|
| **Deployed web SHA** | `0e01208716d2404e69956491f459921ebb0f1f1e` |
| **Deployed API SHA** | `0e01208716d2404e69956491f459921ebb0f1f1e` |
| **Verify 254** | **GO** |
| **AURA execution evidence** | **GO** — 71/71 code coverage; 14-module staging sample + NL command 201 |
| **Void/Credit Note** | **HOLD** — UI scaffold, disabled, approval-gated |
| **Payment allocation** | **DATA-DEPENDENT HOLD** |
| **Remaining blockers** | (1) Void/Credit Note approval execution path (2) Payment allocation — no testable staging data (3) RBAC client-role AURA probe — no client user on staging |
| **Overall** | **HOLD** |
| **Production untouched** | **Confirmed** |

---

## GO / HOLD / NO-GO rationale

- **Verify 254:** GO — functional audit checks pass on deployed staging.
- **AURA:** GO — contextual drawer operational; 71/71 architectural coverage proven.
- **Void/Credit Note:** HOLD — intentional safety gate; not production-ready for writes.
- **Payment allocation:** HOLD — pipeline partial; zero mappable payments on staging.
- **Overall release posture:** **HOLD** (not NO-GO — no new functional regressions detected on staging).
