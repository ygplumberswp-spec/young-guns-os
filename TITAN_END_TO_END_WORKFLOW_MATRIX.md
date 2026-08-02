# TITAN End-to-End Workflow Matrix

**Phase:** 254  
**Generated (UTC):** 2026-08-02T13:30:00.000Z  
**Branch:** `cursor/titan-owner-operating-model-final`

---

## 7.1 Lead-to-cash

| Stage | Status truth | Next action | Linkage | Dashboard | AURA | Verdict |
|-------|-------------|-------------|---------|-----------|------|---------|
| Lead | CRM DB | Qualify / Convert | Lead record | Leads count | Summarise chip | **GO** |
| Customer | CRM + Xero contact | Create job/quote | customerId | CRM 360 | History chip | **GO** |
| Property | CRM property | Job site | propertyId | — | — | **GO** |
| Quote | Xero read + TITAN | Send / Accept | jobId, customerId | Finance | Draft brief chip | **GO** |
| Job | TITAN DB | Schedule | quote optional | Jobs count | Readiness chip | **GO** |
| Schedule | Calendar | Dispatch | jobId | Scheduling | Recommend tech chip | **GO** |
| Field / Mobile | Mobile API | Complete checklist | jobId | — | — | **GO** |
| Invoice | Xero read | Record payment | jobId | Finance | Invoice state chip | **GO** |
| Payment | Xero read | Allocate | invoiceId | Receivables | **HOLD** — no overlapping paid invoice | **HOLD** |
| Paid in full | Ledger calc | Follow-up | customer balance | Dashboard | — | **HOLD** |

---

## 7.2 Schedule Job

| Step | Expected | Evidence | Verdict |
|------|----------|----------|---------|
| Open scheduling drawer | From job detail | JobSchedulePanel | **GO** |
| Save appointment | Updates job.scheduledAt | API PUT jobs | **GO** |
| Day/Week/Month views | Visible layout change | Verify 253 + 254 | **GO** |
| Live Dispatch | Fleet map link | Phase 240 | **GO** |
| Mobile technician | /mobile/jobs | Phase 238 | **GO** |
| Back preserves context | History step | back-navigation.ts | **GO** |

---

## 7.3 Procure-to-pay

| Stage | Route | Status | Verdict |
|-------|-------|--------|---------|
| Need | `/inventory/stock` | LIVE | **GO** |
| Request | `/procurement/parts-requests` | LIVE | **GO** |
| Compare | `/procurement/price-lists` | PARTIAL/HOLD | **HOLD** |
| Approve | `/procurement` pending POs | LIVE | **GO** |
| Order | `/procurement` approved | LIVE | **GO** |
| Bill/Match/Pay | Pipeline stages 8–11 | HOLD (honest) | **HOLD** |

---

## 7.4 Payment reconciliation

| Step | Verdict | Notes |
|------|---------|-------|
| Xero payment ingest | **GO** | Read-only staging |
| AURA candidate match UI | **HOLD** | No fake allocation data |
| Approval gate | **GO** | XeroWriteApprovalGate |
| Allocation update | **HOLD** | DATA-DEPENDENT — payment_mappings=0 |

**No Xero writes during audit.**
