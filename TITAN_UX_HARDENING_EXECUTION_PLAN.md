# TITAN UX Hardening — Phase 1 Execution Plan

**Branch:** `cursor/ux-hardening-phase1`  
**Worktree:** `../Titan-Aura-UX-Hardening`  
**Base:** `cursor/titan-frozen-scope-completion` @ 194177b  
**Scope:** Staging only — controlled UX refinement, no architecture rebuild

---

## Prior worker state

- Subagent `a66a8c0d` started audit but did **not** commit; branch did not exist.
- Fresh worktree created from current tip; no conflicting UX commits found.

---

## Current state vs directive gaps (prioritized)

| Priority | Gap | Current | Phase 1 action |
|----------|-----|---------|----------------|
| P0 | Session banner noise | Timer shows `expiring_soon` 2 min before JWT expiry even when refresh would succeed | Proactive silent refresh; warn only on failure; dismiss without logout |
| P0 | Sidebar active state | Teal accent (`#0d9488`) | Bright blue (`--titan-accent`) active highlight |
| P1 | Nav label drift | Dispatcher console, AURA Capabilities, Owner AI Chat, Automations, Mission Control, Users & Access | Rename per enterprise spec via `ux-labels.ts` + `role-experience.ts` |
| P1 | Duplicate dispatch entry | Dispatcher console in nav; Dispatch intelligence in enterprise index only | Rename nav to **Live Dispatch**; intelligence stays enterprise-only (hidden from primary nav) |
| P1 | Missing shared UX layer | Pages use `@titan/ui` directly with inconsistent patterns | Create `apps/web/src/components/ux/*` library |
| P1 | Finance invoices IA | Duplicate Finance + Invoices headings | PageHeader + Breadcrumbs; sort date desc; sync badge; mute cancelled |
| P2 | Jobs bulk actions | No selection scaffold | BulkActionBar + row MoreMenu scaffold |
| P2 | Inventory labels | "Movements" tab | Rename to **Stock history**; improve empty copy |
| P2 | Analytics tab overload | 11 flat tabs | CompactTabs (5 visible + More) + SummaryCardGrid on dashboard |
| P2 | Settings scatter | Direct links only | `/settings` hub scaffold |
| P3 | Cmd+K search | Header link only | SearchCommandPalette shell (phase 2 wiring) |
| DEFER | Full calendar drag-drop | Scheduling page basic | Scaffold PageHeader only |
| DEFER | Customer 360 | CRM detail exists | No change |
| DEFER | Full global search | Route exists | Palette shell only |
| DEFER | Enterprise decorative pages | Enterprise modules index honest | Hide from primary nav; no fake data injection |

---

## Shared components — create vs reuse

| Component | Action |
|-----------|--------|
| PageHeader | Wrap `@titan/ui` PageHeader with `ux-page-header` premium chrome |
| EmptyState | Wrap `@titan/ui` EmptyState |
| SummaryCardGrid | **Create** — grid wrapper for StatCard-like summaries |
| PrimaryAction | **Create** — bright blue CTA button styling |
| QuickActionsDropdown / MoreMenu | **Create** — simple mode default; advanced under More |
| CompactTabs | **Create** — max 5 visible tabs + overflow menu |
| StatusBadge | **Create** — semantic status pills |
| BulkActionBar | **Create** — select-all + role-filtered action slot |
| Breadcrumbs | **Create** — route-aware trail |
| SearchCommandPalette | **Create** — Cmd+K modal shell |
| ApprovalActionCard | **Create** — Draft→Approve→Execute card scaffold |
| AgentActivityCard | **Create** — real-data-only activity row |
| ActiveSidebarItem | **CSS** — update `.app-nav__link--active` in `index.css` |

---

## Nav merge / rename map

| Old label | New label | Href | Nav visibility |
|-----------|-----------|------|----------------|
| Dispatcher console | Live Dispatch | `/mobile-platform/dispatcher` | Visible |
| Dispatch intelligence | (unchanged) | `/dispatch-intelligence` | Enterprise modules only |
| Marketing | Marketing | `/marketing` | Visible (already correct) |
| AURA Capabilities | AURA Team | `/aura/agents` | Visible |
| Owner AI Chat | AURA Executive Chat | `/aura` | Visible |
| Automations | Automation Command Centre | `/automation` | Visible |
| Mission Control | Company Health | `/mission-control` | Visible |
| Users & Access | Team & Access | `/settings/team` | Visible |
| Search | Search | `/global-search` | Visible (Cmd+K scaffold) |
| Enterprise modules | Enterprise modules | `/enterprise-modules` | Platform owner / company manage |
| Developers, App builder, etc. | — | various | Hidden from primary nav (routes preserved) |

---

## Phase 1 page refactors (high traffic)

1. **Finance / Invoices** — Breadcrumbs, single title, columns, sync pending badge, cancelled row mute, date desc sort
2. **Jobs list** — BulkActionBar scaffold, row MoreMenu
3. **Inventory** — Stock history rename, empty state copy, Products default tab
4. **Analytics dashboard tab** — SummaryCardGrid + CompactTabs for section nav

---

## Conflict-safe file ownership

| Area | Files |
|------|-------|
| UX components | `apps/web/src/components/ux/**` |
| UX styles | `apps/web/src/components/ux/ux.css`, `apps/web/src/index.css` (nav active only) |
| Labels | `apps/web/src/lib/ux-labels.ts`, `packages/shared/src/role-experience.ts` |
| Nav filter | `apps/web/src/lib/role-experience.ts`, `apps/web/src/lib/nav-groups.ts` |
| Session | `apps/web/src/lib/auth-context.tsx`, `apps/web/src/components/SessionStatusBanner.tsx`, `apps/web/src/lib/api-client.ts` |
| Layout | `apps/web/src/layouts/AppLayout.tsx` |
| Pages | `InvoiceListPage`, `JobList`/`JobListPage`, `InventoryNav`, `AnalyticsPage`, `SettingsHubPage` |
| Routes | `apps/web/src/App.tsx` (settings hub only) |
| Tests | `session-expiry.test.ts`, `nav-honesty.test.ts`, new `ux-labels.test.ts` |

**Avoid:** `packages/db/**`, API services, migrations, Xero import, CV-001b paths.

---

## IN scope vs deferred

### IN scope (phase 1)
- Shared UX component library + CSS tokens alignment
- Session silent refresh + honest warning
- Nav renames, Live Dispatch, sidebar active blue, breadcrumbs on key pages
- Settings hub scaffold at `/settings`
- Cmd+K palette shell
- Pattern refactors: Invoices, Jobs, Inventory, Analytics dashboard
- Staging deploy + validation

### DEFERRED (phase 2+)
- Full calendar drag-drop scheduling
- Customer 360 consolidation
- Global search implementation beyond palette shell
- Full settings migration of all integration pages under `/settings/*`
- Enterprise intelligence page content refactors
- Production deploy

---

## Validation checklist

- [ ] `pnpm run typecheck`
- [ ] `pnpm --filter @titan/web run build`
- [ ] Web + session tests
- [ ] Lint on changed files
- [ ] Route grep — no broken paths
- [ ] Staging health `/api/v1/health/ready` 200

---

## ADDENDUM (2026-08-01) — Premium UX completion on `cursor/titan-frozen-scope-completion`

**Status:** In progress on completion branch (base commits `032f797` / `9c076a4`).  
**Supersedes:** parallel `cursor/ux-hardening-phase1` exploratory work — do not merge both.

### ADDENDUM 1 — AURA Executive Chat logo
- [ ] `AuraMark` SVG in `apps/web/src/brand/AuraMark.tsx` — same teal accent palette, larger sm/md/lg sizes
- [ ] Page header + empty state + assistant avatars on `/aura`
- [ ] Title aligned to `NAV_LABELS.auraExecutiveChat`

### ADDENDUM 2 — App speed audit + safe optimizations
- [ ] Baseline staging probes → `TITAN_PERFORMANCE_BASELINE.md`, `diagnostic-output/207-performance-audit-addendum.json`
- [ ] Safe wins: image lazy-load, cache policy for `background-work/status`, conversation fetch abort, post-change re-measure
- [ ] Honest backlog → `TITAN_PERFORMANCE_GAP_BACKLOG.md`

### ADDENDUM 3 — AURA/AI chat response UX
- [ ] Progressive status: Thinking → Reviewing records → Waiting for approval
- [ ] Input stays editable during reply; Send guarded; Cancel via AbortController
- [ ] Client idempotency key header + in-flight guards (no duplicate optimistic rows)
- [ ] Collapsed technical diagnostics panel (Server-Timing fields when returned)
- [ ] Streaming deferred — provider/API not wired for SSE yet

### ADDENDUM 4 — Verification evidence
- [ ] `TITAN_UX_ADDENDUM_COMPLETION_REPORT.md` with measured staging samples + remaining gaps

### ADDENDUM validation
- [ ] `pnpm run typecheck`
- [ ] `pnpm --filter @titan/web run build`
- [ ] Relevant aura + web tests
- [ ] Staging deploy (young-guns-os + comfortable-determination) — Owner approval before production
