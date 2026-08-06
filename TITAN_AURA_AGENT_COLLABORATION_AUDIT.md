# AURA Agent Collaboration Audit

**Verdict: partial — rebuild not needed**  
**Status: documented only — not implementing yet**

Multi-agent collaboration already exists as **Agent Orchestration** (backend + DB + runtime handoffs). Gaps are product UI and a few automation stubs, not a greenfield rebuild. Peer-agent / auto-delegation product surfaces were not found as distinct concepts.

---

## Exists

| Area | Notes |
|------|--------|
| Agent Orchestration (API/DB/engine) | Definitions, sequential/parallel steps, triggers, runs, approvals, logs; handoffs via `handoffKeys`; worker-driven events |
| Single-agent runtime | `AgentRuntimeService` run/approve/execute; `read_orchestration_status` tool; orchestration context injected into prompts |
| AURA Agents UI | `/aura/agents` — profiles, capabilities, executions, approvals (`AuraTaskApprovalCard`) |
| AURA prompt awareness | Multi-agent seq/parallel + approval pause described in `packages/aura` prompts |
| Adjacent (not agent-peer) | `/ai-orchestration` (model/provider routing); n8n automation orchestration |

---

## Incomplete / stubbed

| Item | Notes |
|------|--------|
| Agent Orchestration web UI | No pages, nav, or `apps/web` API client for `/api/v1/agent-orchestration` |
| Prompt vs product | Prompts mention “agent orchestration settings” that do not exist in UI |
| `ask_aura_agent` / `run_ai_agent` | Workflow actions stubbed / preview-only — do not call agent runtime |
| Orchestration agent-key schema | Route Zod enum is a subset of `AGENT_REGISTRY` |
| Chat tools | No create/run/approve orchestration tools from AURA chat |
| Agents UI copy | Some “foundation milestone” wording may lag live runtime |

---

## Needs connecting (deferred)

1. Web UI + client for agent orchestration (CRUD, steps, triggers, runs, approvals)
2. Wire `ask_aura_agent` / `run_ai_agent` → `AgentRuntimeService` / orchestration engine
3. Align orchestration route agent keys with full `AGENT_REGISTRY`
4. Optional: chat tools + prompt/settings copy once UI lands
5. Refresh outdated foundation-milestone copy on agents pages

**Explicitly out of scope for current P0 work:** auto-delegation, peer agents, and orchestration UI implementation.

---

## Key paths

| Layer | Paths |
|-------|--------|
| Shared contracts | `packages/shared/src/agent-orchestration.ts`, `agent-runtime.ts`, `agents.ts` |
| AURA package | `packages/aura/src/` (`prompts.ts`, types, providers) |
| DB | `packages/db/src/schema/agent-orchestration.ts`; migration `packages/db/drizzle/0025_agent_orchestration.sql` |
| API / runtime | `apps/api/src/services/agent-orchestration.service.ts`, `agent-orchestration-engine.service.ts`, `agent-runtime.service.ts`, `agents.service.ts`, `aura.service.ts` |
| Routes | `apps/api/src/routes/agent-orchestration.ts`, `routes/agents.ts`, `routes/ai-orchestration.ts` |
| Worker | `apps/api/src/workers/automation.worker.ts` |
| Agents UI | `apps/web/src/pages/agents/*`, `features/agents/AgentsNav.tsx`, `features/aura/AuraTaskApprovalCard` |
| Missing | No `apps/web` client/pages for agent-orchestration |
