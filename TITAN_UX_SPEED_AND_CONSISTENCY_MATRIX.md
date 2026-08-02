# TITAN UX Speed and Consistency Matrix

**Phase:** 254  
**Generated (UTC):** 2026-08-02T13:30:00.000Z

---

## Viewport matrix

| Viewport | Leads stats | Invoice filters | Procurement tabs | Header overlap | Scheduling | Verdict |
|----------|-------------|-----------------|------------------|----------------|------------|---------|
| 1440×1000 | 4-col grid | All tabs visible | Horizontal nav | None | GO | **PASS** |
| 1280×900 | 4-col grid | Overflow menu | OK | None | GO | **PASS** |
| 1024×768 | 2-col grid | Overflow | OK | None | GO | **PASS** |
| 768×1024 | 2-col grid | Stack toolbar | Scroll nav | None | GO | **PASS** |
| 375×812 | 1-col cards | Stack | Scroll | Fixed @254 | GO | **PASS** |

---

## Speed targets (staging sampled)

| Route | Click feedback | Skeleton/retained | Primary content | Verdict |
|-------|----------------|-------------------|-----------------|---------|
| `/` | immediate | ~200ms | ~1.2s | **GO** |
| `/leads` | immediate | ~250ms | ~1.4s | **GO** |
| `/finance/invoices` | immediate | ~280ms | ~1.8s | **GO** |
| `/scheduling` | immediate | ~300ms | ~2.0s | **GO** |
| `/procurement/flow` | immediate | ~260ms | ~1.5s | **GO** |
| `/fleet/live-map` | immediate | map lazy | ~2.5s provider | **HOLD** |

No infinite spinners observed on audited routes. Duplicate API requests mitigated via `useStaffCachedQuery` / staleTime.

---

## Consistency fixes @254

| Item | Fix |
|------|-----|
| Title Case | `ui-labels.ts` vocabulary + filter labels |
| Stat card spacing | `.stat-card` flex column gap |
| Page header actions | `.ux-page-header__actions` wrap |
| More menu destructive | Separator + red tone |
| Mobile header | Hide brand credit; stack user meta |

---

## Payment allocation

**HOLD** — DATA-DEPENDENT. Not a UX speed defect.
