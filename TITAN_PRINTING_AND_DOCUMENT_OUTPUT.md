# PRN-001 — Complete-App Printing and PDF Output (Binding Stub)

**Status:** **QUEUED** — pipeline entry only; supersedes prior PRINT-001 queue label  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Pipeline phase:** 7 (immediately after JOB-DEL-001)  
**Updated (UTC):** 2026-08-01  

---

## Purpose

Complete-app Preview / Print / Save PDF output for operational and financial documents using native Wi-Fi / AirPrint / browser printing and professional Young Guns Plumbing A4 templates — without printer IP configuration inside TITAN for normal use.

---

## Binding rules

| Rule | Enforcement |
|------|-------------|
| Native print only (default) | Wi-Fi / AirPrint / Android print / browser print — device confirms print success |
| No printer IP in TITAN | Office printer setup stays on device/OS |
| Role security first | RBAC + tenant isolation before any printable output renders |
| Version integrity | PDF/print uses immutable document snapshot or version ref |
| Sensitive doc audit | Job cards, invoices, COCs → `security_audit_logs` |
| Approved comms only | Email/WhatsApp via approved comms workflow when phase executes |
| Bulk print gated | Owner / authorized office staff only |
| Truthful failure UX | TITAN opens print UI; does not claim "printed" until device confirms |

---

## Document types (initial)

- Job card  
- Quote (YG A4, VAT, totals, signatures)  
- Invoice  
- Certificate of Compliance (COC)  
- Delivery note / PO  

---

## Staging evidence (when executed)

`diagnostic-output/191-prn-complete-app-print-verify.json` — one check per core document type.

---

## Gates

- **QUEUED** until pipeline/working-tree permit  
- Does **not** block Xero import recovery  
- Does **not** conflict with subagent `7443e5b5` JOB-DEL-001 lifecycle work  
- Sequenced immediately after JOB-DEL-001; independent of PHSL/GSL  
