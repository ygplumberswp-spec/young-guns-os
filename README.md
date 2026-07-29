# TITAN-AURA-V1

Production-ready AI Business Operating System powered by **AURA AI**.

## Milestone 0 — Project Foundation

This repository contains the empty project foundation only:

- Monorepo scaffold (`pnpm` workspaces)
- API server with health checks
- Web app shell with placeholder routes
- Shared packages (`@titan/shared`, `@titan/ui`, `@titan/db`)
- Docker Compose for local Postgres and Redis
- CI pipeline (typecheck + build)

**Not included yet:** Route optimisation, other integrations, automation agents, or demo data.

## CRM (Milestone 6)

- `GET /api/v1/crm/stats` — customer count for dashboard
- `GET /api/v1/crm/customers` — list customers (tenant-scoped)
- `POST /api/v1/crm/customers` — create customer
- `GET /api/v1/crm/customers/:id` — customer detail + activity notes
- `PATCH /api/v1/crm/customers/:id` — update customer
- `POST /api/v1/crm/customers/:id/activities` — add activity note

Web routes: `/crm`, `/crm/new`, `/crm/:id`. AURA reads live CRM context for authorized users.

## Jobs (Milestone 7)

- `GET /api/v1/jobs/stats` — total and active job counts
- `GET /api/v1/jobs` — list jobs (tenant-scoped, linked to customers)
- `POST /api/v1/jobs` — create job
- `GET /api/v1/jobs/:id` — job detail
- `PATCH /api/v1/jobs/:id` — update job

Statuses: New, Scheduled, In Progress, Completed, Cancelled.

Web routes: `/jobs`, `/jobs/new`, `/jobs/:id`. AURA reads live jobs context for authorized users.

## Scheduling & Dispatch (Milestone 8)

- `GET /api/v1/scheduling/stats` — scheduled job count
- `GET /api/v1/scheduling/assignees` — team members available for assignment
- `GET /api/v1/scheduling/calendar?from=&to=` — scheduled jobs in date range
- `POST /api/v1/scheduling/jobs/:id/schedule` — schedule and assign a job
- `PATCH /api/v1/scheduling/jobs/:id/schedule` — update or clear schedule

Web route: `/scheduling` (week calendar). AURA reads live scheduling context for authorized users.

## Finance (Milestone 9)

- `GET /api/v1/finance/stats` — open quote count and revenue MTD
- `GET /api/v1/finance/quotes` — list quotes (tenant-scoped, linked to customers and optional jobs)
- `POST /api/v1/finance/quotes` — create quote
- `GET /api/v1/finance/invoices` — list invoices
- `POST /api/v1/finance/invoices` — create invoice
- `GET /api/v1/finance/payments` — list payment records
- `POST /api/v1/finance/payments` — record payment (updates invoice paid status)

Web routes: `/finance/quotes`, `/finance/invoices`, `/finance/payments` (with create forms). Dashboard shows open quotes and revenue MTD. AURA reads live finance context for authorized users.

## Inventory (Milestone 10)

- `GET /api/v1/inventory/stats` — product, location, low stock, and total unit counts
- `GET /api/v1/inventory/locations` — list warehouse locations (tenant-scoped)
- `POST /api/v1/inventory/locations` — create location
- `GET /api/v1/inventory/items` — list products
- `POST /api/v1/inventory/items` — create product
- `GET /api/v1/inventory/stock` — stock levels by product and location
- `POST /api/v1/inventory/stock` — set or update stock level

Web routes: `/inventory/products`, `/inventory/stock` (with create/set forms). AURA reads live inventory context for authorized users.

## Fleet (Milestone 11)

- `GET /api/v1/fleet/stats` — vehicle counts by status and assignment
- `GET /api/v1/fleet/assignees` — team members available for vehicle assignment
- `GET /api/v1/fleet/vehicles` — list vehicles (tenant-scoped)
- `POST /api/v1/fleet/vehicles` — create vehicle
- `GET /api/v1/fleet/vehicles/:id` — vehicle detail
- `PATCH /api/v1/fleet/vehicles/:id` — update vehicle and assignment

Web routes: `/fleet`, `/fleet/new`, `/fleet/:id`. AURA reads live fleet context for authorized users.

## Cartrack GPS (Milestone 12)

- `GET /api/v1/integrations/cartrack` — connection status (no secrets returned)
- `PUT /api/v1/integrations/cartrack` — save credentials and verify live connection
- `DELETE /api/v1/integrations/cartrack` — disconnect and clear credentials
- `GET /api/v1/integrations/cartrack/mappings` — external ↔ Titan vehicle mappings
- `PATCH /api/v1/integrations/cartrack/mappings/:id` — link mapping to a Titan vehicle
- `POST /api/v1/integrations/cartrack/sync` — sync vehicles and GPS positions from Cartrack

Web route: `/integrations/cartrack` (also `/settings/cartrack`). Requires `INTEGRATIONS_ENCRYPTION_KEY` on the API server. AURA reads fleet tracking context when Cartrack is connected.

## Communications (Milestone 13)

- `GET /api/v1/communications/stats` — message and template counts
- `GET /api/v1/communications/messages` — customer communication history
- `POST /api/v1/communications/messages` — log a communication record
- `GET /api/v1/communications/templates` — list message templates
- `POST /api/v1/communications/templates` — create message template

Web routes: `/communications/messages`, `/communications/templates` (with create forms). AURA reads live communications context for authorized users.

## Documents (Milestone 14)

- `GET /api/v1/documents/stats` — document and category counts
- `GET /api/v1/documents/categories` — list document categories
- `POST /api/v1/documents/categories` — create document category
- `GET /api/v1/documents/documents` — list document records
- `POST /api/v1/documents/documents` — register document metadata
- `GET /api/v1/documents/documents/:id` — get document detail
- `PATCH /api/v1/documents/documents/:id` — update document metadata

Web routes: `/documents`, `/documents/categories` (with create forms and detail view). AURA reads live documents context for authorized users. Metadata only — no file upload, OCR, or AI document processing in this milestone.

## Automation (Milestone 15)

- `GET /api/v1/automation/stats` — workflow and execution counts
- `GET /api/v1/automation/workflows` — list workflows
- `POST /api/v1/automation/workflows` — create workflow with triggers and actions
- `GET /api/v1/automation/workflows/:id` — get workflow detail
- `PATCH /api/v1/automation/workflows/:id` — update workflow metadata
- `POST /api/v1/automation/workflows/:id/triggers` — add trigger to workflow
- `POST /api/v1/automation/workflows/:id/actions` — add action to workflow
- `GET /api/v1/automation/executions` — list execution history
- `GET /api/v1/automation/workflows/:id/executions` — list executions for a workflow

Web routes: `/automation`, `/automation/executions` (with create form and detail view). AURA reads live automation context for authorized users. Configuration only — no workflow execution engine in this milestone.

## AURA Agents (Milestone 16)

- `GET /api/v1/agents/stats` — registry, profile, and execution counts
- `GET /api/v1/agents/registry` — available agent types
- `GET /api/v1/agents/tools` — tool framework catalog
- `GET /api/v1/agents/profiles` — list configured agent profiles
- `POST /api/v1/agents/profiles` — create agent profile
- `GET /api/v1/agents/profiles/:id` — get agent profile detail
- `PATCH /api/v1/agents/profiles/:id` — update agent profile
- `PUT /api/v1/agents/profiles/:id/permissions` — replace agent permissions
- `PUT /api/v1/agents/profiles/:id/tools` — replace tool grants
- `GET /api/v1/agents/executions` — list execution history
- `GET /api/v1/agents/profiles/:id/executions` — list executions for a profile

Web routes: `/aura/agents`, `/aura/agents/executions` (with configure form and profile detail). AURA reads live agent context for authorized users. Configuration only — no autonomous execution or full tool runtime in this milestone.

## Customer Portal (Milestone 17)

- `POST /api/v1/portal/auth/login` — portal user sign in
- `POST /api/v1/portal/auth/logout` — revoke portal session
- `POST /api/v1/portal/auth/refresh` — rotate portal session
- `GET /api/v1/portal/auth/me` — current portal user
- `GET /api/v1/portal/dashboard` — customer dashboard shell (portal auth)
- `GET /api/v1/portal/stats` — portal user counts (staff)
- `GET /api/v1/portal/users` — list portal users (staff)
- `POST /api/v1/portal/users` — provision portal user for a customer (staff)
- `GET /api/v1/portal/users/:id` — portal user detail (staff)
- `PATCH /api/v1/portal/users/:id` — update portal user or permissions (staff)
- `GET /api/v1/portal/permissions/catalog` — portal access permission catalog (staff)

Web routes: `/portal/login`, `/portal` (customer dashboard), `/settings/portal` (staff management). AURA reads live portal context for authorized staff. Foundation only — no payment gateway, WhatsApp bot, or AI customer support in this milestone.

## Integration Hub (Milestone 18)

- `GET /api/v1/integrations/hub/dashboard` — central integrations dashboard
- `GET /api/v1/integrations/hub/providers` — provider registry with connection status
- `GET /api/v1/integrations/hub/sync-jobs` — list sync job history
- `GET /api/v1/integrations/hub/sync-jobs/:id` — sync job detail
- `GET /api/v1/integrations/hub/webhooks/endpoints` — list webhook endpoints
- `POST /api/v1/integrations/hub/webhooks/endpoints` — create webhook endpoint (returns secret once)
- `PATCH /api/v1/integrations/hub/webhooks/endpoints/:id` — update webhook endpoint
- `DELETE /api/v1/integrations/hub/webhooks/endpoints/:id` — delete webhook endpoint
- `GET /api/v1/integrations/hub/webhooks/events` — list webhook event log

Web routes: `/integrations`, `/integrations/sync-jobs`, `/integrations/webhooks`, `/integrations/cartrack`. AURA reads live integration hub status for authorized users. Foundation only — no WhatsApp API, marketing integrations, or full webhook automation in this milestone.

## Business Integrations (Milestone 19)

- `GET /api/v1/integrations/xero` — Xero connection status
- `PUT /api/v1/integrations/xero` — save Xero custom connection credentials and verify organisation
- `DELETE /api/v1/integrations/xero` — disconnect Xero
- `POST /api/v1/integrations/xero/sync` — sync organisation metadata from live Xero API
- `GET /api/v1/integrations/email` — SMTP email connection status
- `PUT /api/v1/integrations/email` — save SMTP credentials and verify authentication
- `DELETE /api/v1/integrations/email` — disconnect email provider
- `POST /api/v1/integrations/email/sync` — re-verify SMTP connection
- `GET /api/v1/integrations/yoco` — Yoco connection status
- `PUT /api/v1/integrations/yoco` — save Yoco secret key and verify business profile
- `DELETE /api/v1/integrations/yoco` — disconnect Yoco
- `POST /api/v1/integrations/yoco/sync` — sync business profile from live Yoco API

Web routes: `/integrations/xero`, `/integrations/email`, `/integrations/yoco`. Credentials are encrypted at rest. Sync jobs are recorded in the Integration Hub. No demo connections — real API verification only.

## Real Xero Sync (Milestone 20)

- `GET /api/v1/integrations/xero/sync/status` — entity sync counters and outstanding totals
- `GET /api/v1/integrations/xero/sync/logs` — Xero sync audit log
- `POST /api/v1/integrations/xero/sync/customers` — push TITAN customers to Xero contacts
- `POST /api/v1/integrations/xero/sync/quotes` — push TITAN quotes to Xero
- `POST /api/v1/integrations/xero/sync/invoices` — push invoices and pull payment status from Xero
- `POST /api/v1/integrations/xero/sync/payments` — pull Xero payments and link to TITAN invoices
- `POST /api/v1/integrations/xero/sync/retry/:syncJobId` — retry a failed entity sync job

AURA reads Xero Accounting context when connected, including outstanding balances and unpaid invoices from synced records only. No demo accounting data is seeded.

## WhatsApp Business Integration (Milestone 21)

- `GET /api/v1/integrations/whatsapp` — connection status, message stats, and templates
- `PUT /api/v1/integrations/whatsapp` — connect WhatsApp Business API and verify credentials
- `DELETE /api/v1/integrations/whatsapp` — disconnect WhatsApp
- `POST /api/v1/integrations/whatsapp/test` — send a test message
- `POST /api/v1/integrations/whatsapp/templates` — create template
- `PATCH /api/v1/integrations/whatsapp/templates/:id` — update template
- `DELETE /api/v1/integrations/whatsapp/templates/:id` — delete template
- `GET /api/v1/whatsapp/messages` — list messages (optional `customerId` filter)
- `POST /api/v1/whatsapp/messages/send` — send message or create draft
- `POST /api/v1/whatsapp/messages/:id/approve` — approve and send draft
- `GET /api/v1/webhooks/whatsapp` — Meta webhook verification
- `POST /api/v1/webhooks/whatsapp` — receive inbound messages and delivery status updates

Web routes: `/integrations/whatsapp`. Customer pages include WhatsApp history and send button. Set `API_PUBLIC_URL` for webhook URL display. AURA reads WhatsApp conversation context and never sends automatically — draft first, user approves.

## AURA Operational Agents (Milestone 22)

- `POST /api/v1/agents/runs` — run an operational agent with tool execution and audit logging
- `GET /api/v1/agents/runs` — list agent runs
- `GET /api/v1/agents/runs/:runId` — agent run detail with tasks
- `GET /api/v1/agents/tasks` — list agent tasks (optional `status` filter)
- `POST /api/v1/agents/tasks/:taskId/approve` — approve and execute a pending task
- `POST /api/v1/agents/tasks/:taskId/reject` — reject a pending task
- `PATCH /api/v1/agents/tasks/:taskId` — edit task preview/payload before approval
- `GET /api/v1/recruiting/stats` — recruiting pipeline stats
- `GET/POST /api/v1/recruiting/candidates` — list/create candidates
- `GET/PATCH /api/v1/recruiting/candidates/:id` — candidate detail/update
- `GET/POST /api/v1/recruiting/applications` — list/create applications
- `PATCH /api/v1/recruiting/applications/:id` — update application status

Web routes: `/aura` (agent mode with approval cards), `/recruiting`. All mutating agent actions require explicit user approval. No autonomous destructive changes.

## Auth (Milestone 1)

- `POST /api/v1/auth/signup` — create company + first admin
- `POST /api/v1/auth/login` — sign in
- `POST /api/v1/auth/logout` — revoke session
- `POST /api/v1/auth/refresh` — rotate refresh token
- `GET /api/v1/auth/me` — current user (requires access token)

### AURA (Milestone 2+)

- `GET /api/v1/aura/conversations` — list conversations
- `POST /api/v1/aura/conversations` — create conversation
- `GET /api/v1/aura/conversations/:id` — get conversation + messages
- `POST /api/v1/aura/conversations/:id/messages` — send message (OpenAI when configured)
- `DELETE /api/v1/aura/conversations/:id` — delete conversation

Set `AURA_OPENAI_API_KEY` in `.env` (server only) to enable real AI responses.

### Company profile (Milestone 4)

- `GET /api/v1/company/profile` — get company profile
- `PATCH /api/v1/company/profile` — update profile (owner/admin)

### Team (Milestone 5)

- `GET /api/v1/team/members` — list company users
- `GET /api/v1/team/roles` — list assignable roles
- `GET /api/v1/team/invites` — list pending invites
- `POST /api/v1/team/invites` — create invite link
- `GET /api/v1/auth/invites/preview?token=` — preview invite
- `POST /api/v1/auth/accept-invite` — accept invite and join company

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker (optional, for local Postgres/Redis)

## Getting Started

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Start infrastructure
docker compose -f infra/docker/docker-compose.yml up -d

# Run database migrations
pnpm db:migrate

# Run API + web in development
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000
- Health: http://localhost:3000/api/v1/health

## Project Structure

```
apps/
  api/          Express API server
  web/          React + Vite frontend
packages/
  db/           Drizzle schema and migrations
  shared/       Shared types and constants
  ui/           Design system primitives
infra/
  docker/       Local development services
docs/           Architecture and milestone docs
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start API and web in parallel |
| `pnpm build` | Typecheck and build all packages |
| `pnpm typecheck` | Run TypeScript across workspace |
| `pnpm format` | Format with Prettier |

## Policy

- **Zero demo data** — the system starts empty by design
- **Milestone-driven** — features are added incrementally
- See [docs/MILESTONES.md](./docs/MILESTONES.md) for the implementation roadmap

## License

MIT
