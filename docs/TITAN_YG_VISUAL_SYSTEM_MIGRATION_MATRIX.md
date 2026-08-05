# TITAN × Young Guns Visual System — Migration Matrix

**Status:** DEFERRED — planning artifact only. Do **not** execute during an active functional phase.
**Owner direction date:** 2026-08-05
**Canonical phase:** `docs/TITAN_MASTER_COMPLETION_CHECKLIST.md` → **Deferred Phase: Young Guns Premium Dark Brand Visual System (YG-VIS)**
**Rule:** Visual work must not interrupt the approved TITAN master sequence. No business logic, routes, permissions, or architecture changes in this phase.

---

## 1. Audit snapshot (main @ documentation commit)

| Layer | Current state | Gap vs Owner YG-VIS standard |
|-------|---------------|------------------------------|
| `packages/ui/src/tokens.css` | Midnight navy + **electric teal/cyan** (`#22d3ee` / `#06b6d4`) | Must become Young Guns electric blue; teal is legacy conflict |
| `packages/ui/src/styles.css` | Shared Button / Input / Tab / Card primitives on `--titan-*` | Reusable — retoken only; keep API |
| `apps/web/src/index.css` | Large shell + feature CSS; multiple `rgba(34, 211, 238, …)` accents | Hardcoded teal must migrate to tokens |
| `apps/web/src/brand/TitanWordmark.tsx` | Chrome wordmark with teal stop | Align Y/G/P blue initials + electric blue |
| `packages/shared/src/young-guns-theme.ts` | **Absent on main** (exists on recovery lineage `f8cc0c4`) | Restore/align canonical token source when phase starts |
| Document engine / report shell | Partial Young Guns report work on recovery lineage | Preserve **white/pearl documents**; never force dark app theme onto PDFs |
| Slogan constant | `YOUNG_GUNS_SLOGAN` on recovery lineage | Official: **Your #2 Is Our #1 Priority.** Never `#2` / `#2` variant |

### Prior approved work (do not discard)

Recovery commit `f8cc0c4` already introduced:

- `--yg-*` tokens aliased to `--titan-*`
- `packages/shared/src/young-guns-theme.ts` + report shell
- Finance/document Young Guns pass + theme tests

**YG-VIS must reuse that foundation**, then complete the full-app sweep and align palette to the Owner-approved electric-blue direction below. Prefer aliasing existing `--titan-*` consumers over rewriting every class name.

---

## 2. Target colour tokens (Owner-approved direction)

Use central tokens only. Suggested CSS foundation (map into `--titan-*` aliases for compatibility):

| Token | Value | Role |
|-------|-------|------|
| `--yg-bg` | `#05070A` | App background (near-black / deep navy) |
| `--yg-surface` | `#0A0F18` | Main surfaces |
| `--yg-surface-raised` | `#101827` | Raised cards |
| `--yg-blue` | `#079CFF` | Primary electric blue |
| `--yg-blue-bright` | `#18B9FF` | Secondary / hover sky-electric |
| `--yg-blue-deep` | `#0568D8` | Deep accent / pressed |
| `--yg-white` | `#F7FAFC` | Primary text |
| `--yg-silver` | `#B8C2CF` | Secondary / chrome text |
| `--yg-muted` | `#7C8796` | Muted text |
| `--yg-border` | `#223247` | Dark chrome / blue-grey borders |
| Success | controlled green | Status only + label |
| Warning | amber | Status only + label |
| Error | red | Status only + label |
| Review stars | Google-style yellow | Documents / review prompts |

Where `f8cc0c4` names differ (`--yg-bg-app`, `--yg-blue-primary`, …), **keep one naming scheme** at phase start and alias the other — do not ship dual competing systems.

---

## 3. Migration matrix by surface

| Batch | Surface / shell | Primary files | Action | Water/chrome allowed? | Priority |
|-------|-----------------|---------------|--------|----------------------|----------|
| **B0** | Design tokens + shared primitives | `packages/ui/src/tokens.css`, `styles.css`, `button.tsx`, `input.tsx`, `tab-nav.tsx`, `stat-card.tsx`, `loading-state.tsx`, `layout.tsx` | Align palette; primary/secondary/destructive states; focus rings; remove teal | No water behind controls | **First** |
| **B0** | Canonical TS tokens | `packages/shared/src/young-guns-theme.ts` (+ tests) | Restore/align hex + slogan + WCAG helpers | N/A | **First** |
| **B1** | App shell / nav | `AppLayout.tsx`, `index.css` nav/auth, wordmark | Deep dark nav, electric-blue active, white titles, consistent radius/spacing | Controlled glow / chrome only | High |
| **B1** | Auth / login | `AuthLayout.tsx`, `.auth-stage*` | Premium branded login; slogan script OK here | Yes — controlled | High |
| **B2** | Owner Command Center + AURA | `pages/dashboard`, `pages/aura`, mission-control header only | Commanding, premium; restrained water accents | Header / empty / health only | High |
| **B3** | Finance lists + editors (UI chrome only) | `pages/finance`, finance CSS | Buttons/inputs/tables match shell; **no logic change** | No water behind tables/forms | High |
| **B3** | Documents / PDFs | report shell, preview HTML | Keep white/pearl docs, blue headings, YGP initials, yellow stars, genuine Yoco/QR/COC | Cover/header motifs only | High |
| **B4** | CRM / Jobs / Dispatch / Schedules | `pages/crm`, `leads`, `jobs`, `operations`, dispatch | Shell consistency; practical density | No | Medium |
| **B5** | Fleet / Technicians / Inventory / Warehouse / Suppliers | `pages/fleet`, `mobile`, `inventory`, `procurement` | Practical tech + warehouse clarity | No | Medium |
| **B6** | Marketing / Reports / Integrations / Settings | respective `pages/*` | Clean sections; marketing may use brand motifs | Marketing + report headers yes; settings no | Medium |
| **B7** | Client Portal | `PortalLayout.tsx`, `pages/portal` | Clean, trustworthy, simple — not complex | Minimal | High (usability) |
| **B7** | Technician mobile | `MobileLayout.tsx`, `pages/mobile` | Fast and practical; premium but not decorative | Minimal | High (usability) |
| **B8** | Charts / status badges / empty states | chart wrappers, badge CSS, empty illustrations | Labels + icons; restrained YG colours; honest empties | Empty-state art only | Medium |
| **B9** | Legacy teal purge + hardcoded colour sweep | `index.css`, wordmark, inline styles | Zero `#22d3ee` / `#06b6d4` / competing cyan | N/A | Gate |
| **B10** | Visual QA + Owner review | Desktop 1440, tablet 1024/768, mobile 390 | Quality checklist; stop for Owner before production | N/A | Final |

---

## 4. Component standard checklist

Standardize via central CSS / `@titan/ui` (no per-page one-off palettes):

| Component | Primary treatment |
|-----------|-------------------|
| Primary button | Solid electric blue, white text, hover/focus/disabled |
| Secondary button | Dark surface, blue/chrome border, white text |
| Destructive button | Controlled red soft/solid, accessible label |
| Inputs / selects / date pickers | Dark surface, chrome border, blue focus ring |
| Tables | Compact readable; no water backdrop |
| Cards | Subtle raised navy; thin border; minimal glow |
| Modals / drawers / tabs | Consistent radius, focus trap titles, blue active tab |
| Badges / alerts | Text label + colour; never colour alone |
| Empty / loading / skeletons | High-quality empties where useful; restrained motion |
| Charts / tooltips / pagination | Dark-readable; genuine data only |
| File upload / galleries / PDF preview | Chrome frames; PDF preview stays document-light |

**Do not use** teal/cyan legacy styling that conflicts with Young Guns blue.

---

## 5. Brand asset & copy rules

| Item | Approved value |
|------|----------------|
| Business | Young Guns Plumbing Cape Town |
| Phone | 066 234 6301 |
| Email | ygplumberswp@gmail.com |
| Location | Cape Town, Western Cape |
| Slogan | Your #2 Is Our #1 Priority. |
| Forbidden slogan | Your #2 Is Our #2 Priority. |
| Wordmark | Y, G, P initials blue; remaining letters white/silver |
| Logo | Approved assets only — no invented/AI logos |

Water/chrome: login, Owner dashboard header, AURA command surface, empty states, document covers, report headers, marketing, loading/system-health, onboarding, company branding. **Not** behind dense tables, form fields, invoice line editors, job cards, maps, settings, or compliance forms.

---

## 6. Execution gates (when phase is unlocked)

1. Audit tokens/components (this matrix) — **done as deferred prep**
2. Identify reusable approved styling — `@titan/ui` + `--titan-*` aliases
3. Identify legacy colours — teal/cyan on `main`; incomplete sweep vs `f8cc0c4`
4. Apply design system centrally (B0)
5. Update screens in controlled batches (B1–B8)
6. After **every** batch: typecheck, build, full tests
7. Visual checks at 1440 / 1024 / 768 / 390
8. Update this matrix + master checklist honestly
9. **Stop for Owner visual review before production**
10. No push/deploy/release of visual implementation without **explicit Owner approval**

### Explicit non-goals

- Do not rebuild the app
- Do not change business logic, routes, RBAC, or data contracts
- Do not introduce fake chart/demo data
- Do not mark YG-VIS complete until desktop, tablet, mobile, teal purge, contrast, and component consistency all pass

---

## 7. Completion visual test (per screen)

- Premium? Clean? Easy to understand?
- Consistent spacing? Obvious main action?
- Same TITAN product + Young Guns identity?
- Blue controlled (not neon overload)?
- Mobile usable?
- Avoids obviously AI-generated / cartoonish look?
