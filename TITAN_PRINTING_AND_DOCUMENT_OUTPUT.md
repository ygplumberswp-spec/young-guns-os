# PRINT-001 — Printing and Document Output (Binding Stub)

**Status:** **QUEUED** — pipeline entry only; full implementation pending  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Pipeline phase:** 7 (after JOB-DEL-001)  
**Updated (UTC):** 2026-08-01  

---

## Purpose

Provide truthful Preview / Print / Save PDF / Email-WhatsApp output for operational and financial documents using native device printing and print-optimized layouts — without requiring printer IP configuration inside TITAN for normal use.

---

## Binding rules

| Rule | Enforcement |
|------|-------------|
| Native print only (default) | AirPrint, Android print, browser print — device confirms print success |
| No printer IP in TITAN | Office printer setup stays on device/OS; no TITAN printer host config for standard flows |
| Version integrity | PDF/print uses immutable document snapshot or version ref where applicable |
| Tenant isolation | Print/PDF/export scoped to authenticated tenant |
| Sensitive doc audit | Job cards, invoices, COCs, payroll-adjacent docs → `security_audit_logs` |
| Approved comms only | Email/WhatsApp share via existing approved comms workflow |
| Truthful failure UX | TITAN opens print UI; does not claim "printed" until user/device confirms |

---

## Document types (initial)

- Job card  
- Quote (YG A4 template, VAT, totals, signatures)  
- Invoice  
- Certificate of Compliance (COC)  
- Delivery note / PO (procurement)  

---

## Implementation deliverables (when phase executes)

- Shared print components (`PrintPreview`, bulk print gate)  
- `@media print` CSS + Young Guns A4 templates  
- PDF service scaffold (server primary, client fallback)  
- Per-document print templates  
- Bulk print (Owner/office, permission-gated)  
- Tests: permissions, page breaks, multi-page, bulk, duplicate-click  
- Staging evidence: `diagnostic-output/191-print-document-output-verify.json`  

---

## Gates

- Does **not** block Xero import recovery  
- Does **not** conflict with subagent `7443e5b5` JOB-DEL-001 lifecycle work  
- Soft dependency on YGP-001 for quote/invoice presentation  
- Sequenced after JOB-DEL-001; independent of PHSL/GSL  
