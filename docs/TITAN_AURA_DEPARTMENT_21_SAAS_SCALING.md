# Department 21 — SaaS Scaling

**Status: ⬜ Approved — queued after Xero Complete Historical Sync is complete and Owner-approved. NOT
started. Do not begin Production Hardening or any later phase.**

This document records approved scope only. **No implementation exists for this department and none may
be started yet.** It is written so the work can be picked up later without re-deciding the
requirements.

The **Xero Complete Historical Sync & Financial Memory** phase may be active. Do not begin this work
alongside it, and do not touch Xero or Finance work-in-progress files while recording this scope. See
[`XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md`](./XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md).

---

APPROVED.

Begin Department 21 — SaaS Scaling ONLY after the Xero phase is complete and approved.

Do not begin Production Hardening or any later phase.

## Strict Rules

- Complete one department only.
- Preserve the existing architecture.
- Preserve tenant isolation, RBAC, audit logging and approvals.
- Do not touch completed departments.
- Do not delete recovery folders.
- Do not apply, pop or drop stashes.
- Do not modify unrelated migrations.
- No fake or demo data inside real tenants.
- No production deployment.
- Keep CPU and memory usage controlled.

## Scope

Build or complete:

### White Label
- Company name
- Logo
- Colours
- Domain settings
- Email branding
- Document branding
- Feature visibility by tenant
- Preserve TITAN platform identity for Platform Owner controls

### Subscription Management
- Plans
- Feature tiers
- Usage limits
- Trial states
- Subscription status
- Upgrade/downgrade preparation
- Cancellation lifecycle
- Grace periods
- Billing status

### Tenant Onboarding
- Company signup
- Setup wizard
- Trade/industry selection
- Company profile
- Owner creation
- Role setup
- Branding setup
- Integration checklist
- No automatic fake records

### Usage Analytics
- Active users
- Jobs
- Storage
- AI usage
- Integration usage
- Feature adoption
- Tenant health
- No exposure of one tenant to another

### Customer Success Tools
- Onboarding progress
- Health indicators
- Support requests
- Renewal risks
- Product-adoption signals
- Owner-visible tenant status

### SaaS Billing
- Billing-provider abstraction
- Subscription invoices
- Payment status
- Failed payment handling
- Billing history
- No uncontrolled charges
- Approval and provider confirmation

## Security

- Platform Owner controls remain protected.
- Tenant Owners see only their own company.
- Company data must never cross tenant boundaries.
- Billing and subscription data must be company-scoped.
- Technician and Client roles cannot manage SaaS settings.
- Audit every plan, billing and tenant-setting change.

## Verification

Run targeted checks:
- Shared build and tests
- DB build
- API typecheck/build
- Web typecheck/build
- Tenant-isolation tests
- Platform Owner access tests
- Tenant Owner access tests
- Billing-state tests
- Onboarding tests
- White-label tests
- No fake production records
- No data leakage

## Commit and Push

- Commit only Department 21.
- Push normally to `origin/cursor/titan-v1-integration`.
- Do not force push.

## Report

Report:
- Files added
- Files modified
- Routes
- Services
- Database schema
- Migration and journal decision
- White-label support
- Subscription lifecycle
- Onboarding
- Usage analytics
- Customer-success tools
- Billing
- RBAC and tenant isolation
- Tests and builds
- Commit hash
- Push status
- Branch synchronization
- Working-tree status

STOP and wait for Owner approval.
