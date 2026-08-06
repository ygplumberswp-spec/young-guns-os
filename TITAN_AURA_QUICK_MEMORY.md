# TITAN AURA Quick Memory

Compact owner-facing control for permanent AURA company memory rules on the Executive Chat intelligence panel.

## UI

- One-line quick entry with **Save** on the right (`AuraQuickMemoryInput`)
- Placeholder: “Add a quick business rule for AURA…”
- **Enter** saves · **Shift+Enter** expands for longer notes
- Toast copy: “Saved to company memory.”
- Collapsed recent-rules list with edit, disable, and delete actions
- Premium navy styling via existing UX primitives (`PrimaryAction`, `StatusBadge`, `MoreMenu`)

## API

| Method | Route | Access |
|--------|-------|--------|
| GET | `/intelligence/memory` | `intelligence:read` or `intelligence:write` |
| POST | `/intelligence/memory` | Owner / legacy Admin only (`requireCompanyMemoryWrite`) |
| PATCH | `/intelligence/memory/:id` | Owner / legacy Admin only |
| DELETE | `/intelligence/memory/:id` | Owner / legacy Admin only |

Mutations also require `intelligence:write` and enforce tenant isolation via `companyId` on every query.

## Rules

- Duplicate rules rejected after normalization (trim, lowercase, collapsed whitespace)
- Audit fields: `createdByUserId`, `updatedByUserId`, timestamps
- Disabled rules (`enabled = false`) stay in the list but are excluded from AURA context
- Chat messages are **not** auto-saved; explicit Save (or approved agent `store_memory` task) only

## Migration

`packages/db/drizzle/0111_aura_memory_quick_entry.sql` adds `enabled` and `updated_by_user_id` to `aura_memory`.

## Tests

- `packages/shared/src/aura-memory-utils.test.ts` — dedupe normalization
- `packages/auth/src/rbac-matrix.test.ts` — `canWriteCompanyMemory`
- `apps/web/src/features/aura/aura-quick-memory.test.ts` — keyboard helpers
