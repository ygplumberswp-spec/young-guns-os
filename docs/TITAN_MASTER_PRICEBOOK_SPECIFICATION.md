# TITAN PRICEBOOK-001 — Master Pricebook and AI Estimating Engine Specification

**Status:** RECORD ONLY — **not implemented**  
**Recorded (UTC):** 2026-08-06  
**Active blocker:** XERO-002 Gate sequence remains active — **do not implement PRICEBOOK-001 during Xero proof**  
**Placement:** Next major core-platform implementation **after XERO-002 closes** and **before DASH-002**

---

## Purpose

Create one **Master Pricebook** as TITAN’s single source of truth for:

- pricing · estimating · quotations · invoices · job cards · job costing
- material lists · purchasing · purchase orders · bills of quantities
- maintenance plans · construction estimates · AI-assisted takeoffs · profitability reporting

**No duplicate pricing systems are allowed.**

---

## Cross-links

| ID | Document / area |
|----|-----------------|
| [TITAN_PRICEBOOK_ARCHITECTURE.md](./TITAN_PRICEBOOK_ARCHITECTURE.md) | Technical architecture |
| [TITAN_AI_ESTIMATING_ENGINE_SPECIFICATION.md](./TITAN_AI_ESTIMATING_ENGINE_SPECIFICATION.md) | AI-EST-001, AI-EST-LEARN-001 |
| INV-PRICE-001 | Supplier Price List Import (child of AI-FIN-DOC-001) |
| AI-FIN-DOC-001 | AI Financial Capture Engine |
| AP-DOC-001 | Supplier Invoice Import |
| EXP-REC-001 | Receipt and Till-Slip Capture |
| BANK-IMPORT-001 | Manual bank statement import |
| DASH-002 | Customisable no-gap Dashboard grid |
| UI-THEME-001 | App-wide visual finishing |
| [TITAN_GAP_CLOSURE_PLAN.md](./TITAN_GAP_CLOSURE_PLAN.md) | Sequencing |
| [TITAN_ROADMAP.md](./TITAN_ROADMAP.md) | Locked platform sequence |

---

## 1. Core Master Pricebook

Every pricebook item must support:

| Field group | Attributes |
|-------------|------------|
| Identity | internal UUID, tenant/company ID, branch availability, unique company item code, Young Guns YGP code where applicable |
| Descriptions | item name, customer-facing description, internal description |
| Classification | category, subcategory, service type, item type, trade/industry, residential/commercial/construction |
| Labour | labour time, labour cost, labour skill level |
| Materials | material assembly, supplier cost, preferred supplier, alternate suppliers |
| Recovery | overhead recovery, call-out allocation, travel allocation where applicable |
| Pricing | markup rule, selling price, VAT treatment, gross profit, gross margin, estimated net contribution |
| Compliance | warranty, SANS requirements, COC requirements, testing requirements |
| Operations | required tools, required qualifications, installation instructions, safety instructions, before-photo requirement, after-photo requirement |
| Lifecycle | active/inactive, effective date, expiry date, version number, approval status |
| Audit | created by, approved by, change reason, complete audit history |

**Item types:** service item · labour item · material item · assembly · plumbing point · call-out · diagnostic · inspection · maintenance item · compliance item · optional add-on · discount rule · surcharge rule

---

## 2. Pricing truth

Keep these values **separate** — do not use interchangeably:

`supplier cost` · `material cost` · `labour cost` · `overhead allocation` · `travel allocation` · `subcontractor cost` · `direct job cost` · `estimated total cost` · `markup` · `customer selling price` · `VAT` · `gross profit` · `gross margin` · `estimated net contribution`

- Required formulas must be **centrally controlled and versioned**
- Young Guns rules: cost bands, fixed-price services, call-out inclusion, labour inclusion, VAT, configurable markup, minimum profit, minimum charge, emergency/after-hours surcharge, branch/regional adjustments
- **Never change existing document totals** when pricebook rules change

**Immutable price snapshot** on every quote, invoice, job card, PO and BOQ:

`item code` · `description` · `quantity` · `unit` · `cost basis` · `labour basis` · `markup rule used` · `selling price` · `VAT rate` · `total` · `pricebook version` · `approved override where applicable`

---

## 3. Residential service pricebook

Fixed-price service assemblies including: leak repairs, burst pipes, tap/mixer/toilet/basin/shower/bath work, geyser repair/replacement/compliance, PRV, vacuum breakers, expansion valves, drip trays, overflow pipes, blocked sinks/toilets/drains, rooter/snake, CCTV drain inspections, maintenance, emergency call-outs, inspections, COC-related work.

**Young Guns operating rules preserved:**

- No drain jetting unless later explicitly added
- Sink/toilet plunging only where applicable
- Outside blocked drains: snake/rooter and camera
- Check valves only in correct geyser/SANS contexts
- 350 mm flexi hoses where specified
- SANS 10254 geyser compliance items
- COC requirements remain explicit

Each assembly generates: quote line · job-card scope · technician checklist · labour allocation · material list · purchase requirement · invoice line · warranty wording · compliance checklist · recommended maintenance · before/after photo requirements

---

## 4. Construction point pricebook

Reusable plumbing-point assemblies: toilet, basin, shower, bath, kitchen sink, dishwasher, washing machine, outside tap, floor drain, urinal, bidet, geyser, gas geyser, heat pump, rainwater tank, booster pump, grease trap, commercial appliance, cold/hot/waste/vent points, ice-cream machine water point.

Each point stores: standard labour hours · labour stages · standard material list · pipe type/sizes/allowances · fitting allowances · valves · traps · consumables · chasing/core-drilling assumptions · excavation assumptions · testing · pressure testing · compliance · installation notes · rough-in / finishing / complete point price · profit margin · exclusions · assumptions

**Stages:** first fix · second fix · final connection · testing · commissioning · COC/compliance — quantities editable before quote approval.

---

## 5. Material assemblies

- Nested components (e.g. geyser replacement → geyser, drip tray, overflow, PRV, vacuum breakers, expansion valve, isolator checks, bonding, lagging, fittings, consumables, labour, disposal, compliance)
- Formula-based component quantities
- Substitutions require approval
- Supplier item mappings **separate** from internal TITAN items
- Alternate suppliers ranked by price, availability, quality
- Supplier cost change **must not** silently change selling prices — preview impact, Owner approval required

---

## 6. Supplier price integration (INV-PRICE-001)

Cross-link [INV-PRICE-001](./TITAN_GAP_CLOSURE_PLAN.md) — Supplier Price List Import.

Import must: upload CSV/XLSX · identify supplier · map SKU → TITAN item · show old vs new cost · % change · affected assemblies/margins · preview selling-price changes · flag unusual increases · detect duplicates · require approval · preserve cost history · effective dates · audit trail. **Never overwrite selling prices automatically.**

---

## 7. AI floor-plan estimator (AI-EST-001)

See [TITAN_AI_ESTIMATING_ENGINE_SPECIFICATION.md](./TITAN_AI_ESTIMATING_ENGINE_SPECIFICATION.md).

Uploads: PDF floor plans, plumbing/architectural drawings, scanned plans, plan revisions.

AURA assists: page classification · scale detection · fixture/symbol detection · counting · pipe-length estimation · BOQ · labour/material estimation · assembly matching · profit calculation · quote generation.

AI results show: detected item · quantity · page · location · confidence · evidence region · matched assembly · assumptions · exclusions · unresolved items.

User may always: add/remove points · change quantities · correct fixture type · change assembly/labour/material/pricing · override · add exclusions/notes · approve BOQ/quote.

**AI may never finalise or send a quote without approval.**

---

## 8. Human review workflow

States: `Uploaded` → `Analysing` → `Detection complete` → `Review required` → `Quantity review` → `Assembly review` → `Pricing review` → `Owner approved` → `Quote draft created` → `Quote approved` → `Quote sent`

AI recommendations must never bypass: **Draft → Review → Approve → Execute**

Every override records: previous value · new value · user · timestamp · reason · affected profit · affected material quantity · affected labour hours

---

## 9. AI learning (AI-EST-LEARN-001)

Post-completion compare: estimated vs actual labour, material, supplier cost, waste, travel, gross profit, duration, subcontractor cost.

AURA may **suggest** (not apply): labour-time · quantity · waste-factor · supplier · substitution · markup · assembly · regional · point-price adjustments — with evidence, sample size, confidence, financial impact, affected assemblies/branches, Owner approval, new pricebook version.

**Do not learn from:** incomplete · disputed · cancelled jobs · missing timesheets · unapproved expenses · unreconciled material · obvious data errors

---

## 10. Multi-use engine

Same pricebook records power: quotations · invoices · job cards · material lists · technician checklists · POs · supplier comparisons · BOQs · construction estimates · maintenance plans · recurring service agreements · AI estimates · reporting · job/branch/customer profitability · technician costing · warranty · compliance documentation.

**No module may create a separate uncontrolled selling price.**

---

## 11. Document integration

Integrates with: quote · invoice · service report · inspection report · maintenance report · COC · job card · purchase order · BOQ.

Customer-facing content may include: description · scope · exclusions · warranty · installation notes · maintenance · compliance · photographs · line totals.

**Internal costs, markup and margins must never appear on customer-facing documents.**

---

## 12. Job costing

Every job compares **Budget** (estimated labour, material, travel, subcontractors, overhead, profit) vs **Actual** (timesheets, materials issued, supplier invoices, till slips, vehicle costs, subcontractor bills, approved expenses, revenue, collected cash).

Status: estimated · committed · incurred · approved · paid · reconciled

Job profit must never be finalised from unapproved or unreconciled evidence.

---

## 13. SaaS and multi-tenant support

Platform master templates · tenant-owned pricebooks · company/branch/regional pricing · supplier-specific costs · labour rates · overhead models · markup rules · multi-currency · tax configuration · country compliance · industry templates · tenant item codes · import/export · API · webhooks · version control · role-based approvals.

**Tenant isolation:** costs · selling prices · margins · supplier agreements · assemblies · customers · documents · AI learning data — never visible cross-tenant.

---

## 14. Access control

| Role | Access |
|------|--------|
| Platform Owner | Full platform/template control |
| Company Owner | Full company pricebook; cost/profit visibility; approval authority |
| Admin | Permission-controlled management |
| Office Staff | Approved prices; prepare quotes; no unrestricted margin-rule changes |
| Technician | Approved job scope and allocated materials; no company-wide costs/margins unless permitted |
| Client | Customer description, quantity, selling price only |
| Supplier | No direct access unless future approved portal |

---

## 15. Version control

Every approved change creates a new version storing: version number · effective date · replaced version · change reason · changed components · cost/selling/margin change · approved by · approval time.

Existing documents remain on original snapshot. New documents use latest approved active version. Draft versions operational only when Owner explicitly selects for testing.

---

## 16. Import and export

CSV/XLSX import/export · API · supplier price import · template import · branch price copy.

Workflow: Upload → Validate → Map → Preview → Detect duplicates/conflicts → Review financial impact → Approve → Apply versioned batch. **No silent overwrites.**

---

## 17. Search and UX

Search by: YGP code · item code · description · category · supplier SKU · supplier · service type · assembly · SANS · COC · active/inactive · branch · region.

Quote building: Search → inspect scope → quantity → option/tier → review price → add to quote.

Support: favourites · recent items · recommended add-ons · three-tier options · maintenance add-ons · related compliance · substitutions · duplicate line warnings (non-blocking).

---

## 18. API and events

Tenant-scoped API: list/search · retrieve item/assembly · calculate price · preview impact · draft version · submit/approve · deactivate · import/export · create estimate/BOQ/quote snapshot.

Events: `pricebook.item.created` · `pricebook.item.updated` · `pricebook.version.approved` · `pricebook.cost.changed` · `pricebook.margin.warning` · `pricebook.import.completed` · `estimate.created` · `estimate.approved` · `estimate.variance.detected`

No event may expose costs/margins to unauthorised roles.

---

## 19. Performance

Fast catalogue search · indexed codes/categories/SKUs/versions · tenant-scoped cache keys · no full-catalogue load per quote · paginated results · lazy assembly expansion · targeted cache invalidation · bulk import processing · safe background recalculation · **no automatic recalculation of historical documents**

---

## 20. Phased implementation

| Phase | ID | Scope |
|-------|-----|-------|
| A | PRICEBOOK-001A | Core data model, versioning, RBAC, price calculation |
| B | PRICEBOOK-001B | Residential service catalogue and Young Guns YGP codes |
| C | PRICEBOOK-001C | Construction point assemblies and BOQ engine |
| D | PRICEBOOK-001D | Supplier cost integration and price-list imports |
| E | PRICEBOOK-001E | Quote, invoice, job-card, purchasing, job-cost integration |
| A | AI-EST-001A | Plan upload, storage, review workspace |
| B | AI-EST-001B | Fixture and plumbing-point detection |
| C | AI-EST-001C | Takeoff, BOQ, pricebook matching |
| D | AI-EST-001D | Professional quote generation with Owner approval |
| — | AI-EST-LEARN-001 | Estimate vs actual learning and recommendations |

**Do not implement any phase during active Xero proof.**

---

## 21. Existing partial implementation note

Checklist row **FIN-014 / YGP-001** — tenant-scoped pricebook table marked **PARTIALLY IMPLEMENTED** with `YOUNG_GUNS_APPROVED_FINANCE_PRICEBOOK` temp constants. PRICEBOOK-001 **supersedes and formalises** this foundation — no duplicate systems.

---

## 22. Implementation gate

| Gate | Rule |
|------|------|
| During XERO-002 | **Forbidden** — no pricebook code, pricing changes, quote/invoice/job/supplier record changes |
| After XERO-002 close | Owner sequences PRICEBOOK-001A as next major core-platform task |
| Before DASH-002 | PRICEBOOK foundation must be sequenced ahead of dashboard grid work |

---

*Record-only specification. No code, schema, pricing, or provider data was modified when this document was created.*
