# TITAN Billing Recipient Wiring Report — Phase 257

**Branch:** `cursor/titan-owner-operating-model-final`  
**Starting SHA:** `577e7e9`  
**Scope:** Staging only — no production deploy, no live Xero writes, no fabricated financial records

---

## Verdict: **GO** (staging wiring complete; payment allocation hold preserved)

| Area | Result |
|------|--------|
| Quote create panel | **GO** |
| Quote draft edit panel | **GO** |
| Invoice create panel | **GO** |
| Invoice draft edit panel | **GO** (new `InvoiceEditPage`) |
| Billing recipient API | **GO** (PATCH + audit) |
| AURA finance draft context | **GO** |
| Verify 254 | **GO** (unchanged) |
| Verify 255 | **GO** (unchanged) |
| Verify 256 | **GO** (unchanged) |
| Verify 257 | **GO** (after staging deploy) |
| Payment allocation | **DATA-DEPENDENT HOLD** (preserved) |
| Production | **Untouched** |

---

## Task — Wire Billing Recipient Panel

**Mounted on:**

1. `QuoteCreatePage` — local draft mode; PATCH after create when custom recipient set
2. `QuoteEditPage` — persisted mode; `PATCH /finance/quotes/:id/billing-recipient`
3. `InvoiceCreatePage` — local draft mode; PATCH after create
4. `InvoiceEditPage` (new) — `/finance/invoices/:id/edit`; persisted mode for draft invoices

**UI behaviour:**

- Service Customer — read-only CRM link (never replaced)
- Billing Customer — displayed; **Change Billing Customer** action
- Quote/Invoice Recipient — displayed; **Change Recipient** action
- Copy From Service Customer
- Editable fields: name, email, phone, billing address, VAT/tax, PO ref, attention
- Draft: reason optional (auto-filled on create); approved unsent: reason required
- Issued invoice: edit blocked with void/credit/reissue explanation

**Rules preserved:**

- Billing recipient change does not replace job service customer
- Job/property linkage unchanged
- Audit via `security_audit_logs` on PATCH

---

## AURA Integration

- `useFinanceDraftAuraContext` registers Service Customer, Billing Customer, Recipient, Job on draft pages
- Finance draft suggestion chips: Bill landlord, Change recipient, Send to owner
- API `buildAuraContext` extended with `draftContext` when `quoteId` / `invoiceId` / `financeDraft` present
- AURA prompts require approval before applying consequential recipient changes (disclaimer + chip prompts)

---

## Files Changed

| Layer | Files |
|-------|-------|
| Web | `BillingRecipientPanel.tsx`, `billing-recipient-state.ts`, `useFinanceDraftAuraContext.ts`, `QuoteCreatePage`, `QuoteEditPage`, `InvoiceCreatePage`, `InvoiceEditPage`, `InvoiceListRowActions`, `finance-draft-aura-suggestions.ts`, `ContextualAuraDrawer`, `contextual-aura-context`, `App.tsx`, `owner-pages.tsx` |
| API | `finance.service.ts`, `aura-context-build.ts`, `aura-context-routing.ts`, `aura.ts`, `portal-experience.service.ts`, `mobile.service.ts` |
| Shared | `finance.ts`, `crm.ts`, `aura.ts` |
| DB relations | `relations.ts` (billingCustomer on quotes/invoices) |
| Verify | `257-billing-recipient-wiring-verify.mjs` |

---

## Routes / Components

| Route | Component |
|-------|-----------|
| `/finance/quotes/new` | `QuoteCreatePage` + `BillingRecipientPanel` |
| `/finance/quotes/:id/edit` | `QuoteEditPage` + `BillingRecipientPanel` |
| `/finance/invoices/new` | `InvoiceCreatePage` + `BillingRecipientPanel` |
| `/finance/invoices/:id/edit` | `InvoiceEditPage` + `BillingRecipientPanel` |

---

## Regression

- `pnpm typecheck` — pass
- `pnpm test` — 373 pass
- `pnpm --filter web build` — pass
- `pnpm --filter api build` — pass

---

## Remaining Blockers

1. **Payment allocation** — DATA-DEPENDENT HOLD (unchanged)
2. **Xero provider writes** — owner flag required for live void/credit execution
3. **Production** — not deployed (by design)

**Overall:** **GO** for staging billing recipient wiring; **HOLD** for production until payment allocation data + owner Xero authorization.
