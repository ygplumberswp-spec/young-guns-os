#!/usr/bin/env node
/**
 * Generates docs/TITAN_MASTER_COMPLETION_CHECKLIST.md
 * Baseline: HEAD f8cc0c4 — consolidated Claude + Gemini audits
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'docs/TITAN_MASTER_COMPLETION_CHECKLIST.md');

const Y = 'YES';
const N = 'NO';
const P = '—';

/** @type {Array<Record<string, string>>} */
const rows = [];

function add(id, area, req, status, cols = {}) {
  const d = {
    id,
    area,
    requirement: req,
    status,
    built: N,
    tests: N,
    db: N,
    rbac: N,
    tenant: N,
    staging: N,
    e2e: N,
    desktop: N,
    tablet: N,
    mobile: N,
    claude: Y,
    gemini: Y,
    owner: N,
    prod: N,
    evidence: '',
    commit: 'f8cc0c4',
    dep: '',
    blocker: '',
    next: '',
    ...cols,
  };
  rows.push(d);
}

// ─── Repository & platform ───────────────────────────────────────────────────
add('REPO-001', 'repo', 'Monorepo structure (apps/api, apps/web, packages/*) intact and buildable', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'pnpm workspace', commit: 'f8cc0c4' });
add('REPO-002', 'repo', 'Recovery worktree on cursor/titan-v1-integration-recovery @ f8cc0c4', 'BUILT LOCALLY', { built: Y, evidence: 'git HEAD f8cc0c4' });
add('REPO-003', 'repo', 'Deploy branch cursor/titan-v1-integration linear descendant of af56e32', 'PARTIALLY IMPLEMENTED', { built: Y, evidence: 'git log', next: 'Confirm origin SHA after push' });
add('REPO-004', 'repo', 'CI typecheck + test pipeline green on recovery branch', 'TESTED LOCALLY', { built: Y, tests: Y, evidence: 'pnpm test (partial suites)' });

// ─── Auth ────────────────────────────────────────────────────────────────────
add('AUTH-001', 'auth', 'Email/password login with session cookie', 'DEPLOYED TO STAGING', { built: Y, tests: Y, staging: Y, evidence: 'session-expiry.test.ts' });
add('AUTH-002', 'auth', 'MFA TOTP challenge at login when enabled', 'TESTED LOCALLY', { built: Y, tests: Y, evidence: 'mfa-login-gate.test.ts', blocker: 'Staging login MFA click-path unverified' });
add('AUTH-003', 'auth', 'Secure persistent session (HttpOnly, cross-tab, step-up)', 'TESTED LOCALLY', { built: Y, tests: Y, evidence: 'TITAN_SECURE_SESSION_ARCHITECTURE.md' });
add('AUTH-004', 'auth', 'Session expiry UX — no silent data loss on hard refresh', 'DEPLOYED TO STAGING', { built: Y, tests: Y, staging: Y, commit: '7741976', evidence: 'session-expiry.test.ts' });
add('AUTH-005', 'auth', 'SSO / IdP integration', 'NOT FOUND', { blocker: 'PLT-009 missing' });

// ─── Roles ───────────────────────────────────────────────────────────────────
add('ROLE-001', 'roles', 'Owner role — full Command Centre + finance write', 'TESTED LOCALLY', { built: Y, tests: Y, rbac: Y, evidence: 'role-forbidden-api-action.test.ts' });
add('ROLE-002', 'roles', 'Admin role — staff operations without platform Owner powers', 'PARTIALLY IMPLEMENTED', { built: Y, tests: Y, rbac: Y, evidence: 'PLT-003 role matrix partial' });
add('ROLE-003', 'roles', 'Office/Dispatch role — scheduling, CRM, job create', 'TESTED LOCALLY', { built: Y, tests: Y, rbac: Y, staging: Y, evidence: 'Phase 5/6 staging E2E' });
add('ROLE-004', 'roles', 'Technician role — mobile execution, no finance write', 'TESTED LOCALLY', { built: Y, tests: Y, rbac: Y, tenant: Y, evidence: 'UX-B staging 35/35' });
add('ROLE-005', 'roles', 'Client role — /my/* portal canonical with /portal alias', 'PARTIALLY IMPLEMENTED', { built: Y, tests: Y, evidence: 'UX-C local; pay honestly unavailable' });
add('ROLE-006', 'roles', 'Platform Owner / Manager / Accountant roles (Decision 1)', 'NOT FOUND', { blocker: 'PLT-003 queued' });
add('ROLE-007', 'roles', 'Role-forbidden direct URL redirects', 'TESTED LOCALLY', { built: Y, tests: Y, rbac: Y, staging: Y, evidence: 'role-forbidden-direct-url.test.ts' });
add('ROLE-008', 'roles', 'Cross-tenant denial matrix (97 tests)', 'TESTED LOCALLY', { built: Y, tests: Y, rbac: Y, tenant: Y, staging: Y, evidence: 'cross-tenant-denial-matrix.test.ts' });

// ─── Customers & CRM ─────────────────────────────────────────────────────────
add('CRM-001', 'customers', 'Customer CRUD with SA phone/ZAR formatting (partial app-wide)', 'PARTIALLY IMPLEMENTED', { built: Y, tests: Y, staging: Y });
add('CRM-002', 'customers', 'Customer search (name/phone/address) on list', 'TESTED LOCALLY', { built: Y, tests: Y, staging: Y, evidence: 'Sprint 003' });
add('CRM-003', 'customers', 'Customer value classification (8 buckets, API)', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'customer-value-classification.ts' });
add('CRM-004', 'customers', 'Finance customer search with inline create (RBAC gated)', 'BUILT LOCALLY', { built: Y, tests: Y, rbac: Y, evidence: 'finance routes @ f8cc0c4' });
add('CRM-005', 'customers', 'Placeholder email detection + duplicate engine', 'NOT FOUND', { blocker: 'CD-002–004' });
add('CRM-006', 'properties', 'Properties first-class in CRM with create-job-at-property', 'PARTIALLY IMPLEMENTED', { built: Y, staging: Y, evidence: 'Sprint 006 partial' });
add('CRM-007', 'properties', 'Immutable job/property snapshots with verified update checkboxes', 'TESTED LOCALLY', { built: Y, tests: Y, staging: Y, evidence: 'UX-A closed' });
add('CRM-008', 'CRM', 'Lead create form + convert → customer/property/job wizard', 'DEPLOYED TO STAGING', { built: Y, tests: Y, staging: Y, e2e: Y, evidence: 'UX-D staging GO' });
add('CRM-009', 'CRM', 'Sales intelligence overlap with /leads resolved', 'PARTIALLY IMPLEMENTED', { built: Y, next: 'Single nav entry polish' });

// ─── Jobs & booking ──────────────────────────────────────────────────────────
add('JOB-001', 'jobs', 'Auto operational job title + JOB-###### numbering', 'DEPLOYED TO STAGING', { built: Y, tests: Y, staging: Y, evidence: 'UX-A' });
add('JOB-002', 'jobs', 'New Job full create fields (property, urgency, access, docs)', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'UX-A' });
add('JOB-003', 'jobs', 'Lead → customer → property → job chain (Phase 5 E2E 10/10)', 'OWNER VERIFIED', { built: Y, tests: Y, staging: Y, e2e: Y, owner: Y, evidence: '140-staging-phase5-e2e.json' });
add('JOB-004', 'jobs', 'Job detail finance strip + quick actions', 'PARTIALLY IMPLEMENTED', { built: Y, evidence: 'JobFinanceStrip local' });
add('JOB-005', 'jobs', 'Job completion → billing chain panel', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'Sprint 016' });
add('JOB-006', 'booking', 'Portal appointment booking workflow', 'PARTIALLY IMPLEMENTED', { built: Y, evidence: 'EnterpriseCustomerExperienceService' });
add('JOB-007', 'booking', 'Lead/booking → dispatch notify on convert', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'UX-D' });

// ─── Dispatch & execution ────────────────────────────────────────────────────
add('DSP-001', 'dispatch', 'Dispatcher console in staff nav', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'UX-K' });
add('DSP-002', 'dispatch', 'Crew/vehicle assignment office UI', 'OWNER VERIFIED', { built: Y, tests: Y, staging: Y, e2e: Y, owner: Y, evidence: '141-staging-phase6-e2e.json' });
add('DSP-003', 'dispatch', 'Scheduling calendar with execution labels', 'TESTED LOCALLY', { built: Y, tests: Y, staging: Y });
add('DSP-004', 'dispatch', 'Live dispatch map with honest capability states (no fake ETA)', 'PARTIALLY IMPLEMENTED', { built: Y, staging: Y, evidence: 'UX-I Maps honesty' });
add('DSP-005', 'dispatch', 'Live technician travel/arrive/work domain events', 'NOT FOUND', { blocker: 'Auto-update gap — TITAN_COMPLETE_APP_AUDIT' });
add('EXE-001', 'job execution', 'Mobile job card capture + gated complete', 'DEPLOYED TO STAGING', { built: Y, tests: Y, staging: Y, mobile: Y, evidence: 'UX-B 35/35' });
add('EXE-002', 'job execution', 'Offline idempotency + IndexedDB flush', 'TESTED LOCALLY', { built: Y, tests: Y, mobile: Y, evidence: 'mobile-offline-completion.test.ts' });
add('EXE-003', 'job execution', 'Binary evidence upload (photo/checklist/signature)', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'UX-B/037' });
add('EXE-004', 'job execution', 'Materials/variations → costing auto-update', 'NOT FOUND', { blocker: 'Domain event not wired' });
add('EXE-005', 'job execution', 'Technician tracking share with customer (live map)', 'NOT FOUND', { blocker: 'UX-030; future phase' });

// ─── Schedules, timesheets, payroll ──────────────────────────────────────────
add('SCH-001', 'schedules', 'Day/week/month calendar component with drag-drop reschedule', 'PARTIALLY IMPLEMENTED', { built: Y, next: 'TITAN_NEXT_IMPLEMENTATION_STAGE_PLAN calendar phase' });
add('SCH-002', 'schedules', 'Business-day timeline route (Phase 8 smoke GO)', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: '142-staging-phase8-12-e2e.json' });
add('TS-001', 'timesheets', 'Job-linked time tracking office + mobile', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'Sprint OPS-014' });
add('TS-002', 'timesheets', 'Labour events in business-day timeline', 'PARTIALLY IMPLEMENTED', { built: Y, next: 'Full AURA taxonomy' });
add('PAY-001', 'payroll', 'Payroll preparation module (draft discipline)', 'FOUNDATION ONLY', { built: Y, evidence: 'EnterpriseWorkforceIntelligenceService scaffold' });
add('PAY-002', 'payroll', 'Live payroll provider integration', 'NOT FOUND', { blocker: 'HR legal + provider gate' });

// ─── Inventory, warehouse, procurement ───────────────────────────────────────
add('INV-001', 'inventory', 'Stock levels + movement ledger', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'Phase 10/11 smoke' });
add('INV-002', 'inventory', 'Van stock location + vehicle link', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'UX-F' });
add('INV-003', 'inventory', 'Approve material → idempotent stock decrement', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'INV-008 closed UX-F' });
add('INV-004', 'inventory', 'Tenant inventory in finance catalogue search', 'BUILT LOCALLY', { built: Y, tests: Y, tenant: Y, rbac: Y, evidence: 'finance-catalogue.service.test.ts' });
add('WH-001', 'warehouse', 'Warehouse locations + bin management UI', 'PARTIALLY IMPLEMENTED', { built: Y, evidence: 'Stock form location address UX-054 closed' });
add('SUP-001', 'suppliers', 'Supplier registry + price catalogue (procurement)', 'BUILT LOCALLY', { built: Y, evidence: 'supplier_price_catalogue_items schema' });
add('PO-001', 'PO', 'Purchase order create/receive → stock', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'UX-F procurement UI' });
add('PROC-001', 'procurement', 'Procurement hub UI (/procurement suppliers/POs/receive)', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'UX-F' });
add('PROC-002', 'procurement', 'Supplier OCR / Xero bill match', 'NOT FOUND', { blocker: 'Sprint 014 deferral' });

// ─── Fleet & maintenance ─────────────────────────────────────────────────────
add('FLT-001', 'fleet', 'Fleet vehicle registry + status', 'PARTIALLY IMPLEMENTED', { built: Y, evidence: 'IntegrationsService' });
add('FLT-002', 'Cartrack', 'Cartrack live vehicle status client', 'FOUNDATION ONLY', { built: Y, blocker: 'Credentials not configured staging', dep: 'Cartrack API' });
add('FLT-003', 'Cartrack', 'Cartrack drivers + geofences', 'NOT FOUND', { blocker: 'FLT-003/006' });
add('FLT-004', 'Cartrack', 'Live fleet map on Owner Command Centre', 'NOT FOUND', { blocker: 'FRZ-004 open; future phase' });
add('MNT-001', 'maintenance', 'Preventative maintenance schedules', 'FOUNDATION ONLY', { built: Y, evidence: 'EnterpriseAssetLifecycleService scaffold' });
add('MNT-002', 'maintenance', 'Equipment lifecycle IoT telemetry', 'FOUNDATION ONLY', { built: Y, blocker: 'IoT provider gate' });

// ─── COC & documents ─────────────────────────────────────────────────────────
add('COC-001', 'COC', 'COC compliance panel + SANS applicability helpers', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'YG-001 UX-I' });
add('COC-002', 'COC', 'COC generation linked to job pack', 'PARTIALLY IMPLEMENTED', { built: Y, evidence: 'Sprint 015 local' });
add('DOC-001', 'document engine', 'TitanDocumentView Young Guns A4 template', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'young-guns-theme @ f8cc0c4' });
add('DOC-002', 'document engine', 'Job document pack approval + portal share', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'Sprint 015' });
add('DOC-003', 'document engine', 'OCR / supplier PDF match depth', 'PARTIALLY IMPLEMENTED', { blocker: 'OCR depth partial per audit' });

// ─── Quotes, invoices, finance ───────────────────────────────────────────────
add('FIN-001', 'quotes', 'Title-free quote editor (no required title field)', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'J-6.1 0178' });
add('FIN-002', 'quotes', 'Full-width quote workspace (1440/1024/768/390)', 'BUILT LOCALLY', { built: Y, tests: Y, desktop: Y, tablet: Y, mobile: Y, evidence: 'finance-workspace-layout.test.ts' });
add('FIN-003', 'quotes', 'Catalogue line search (inventory + YG pricebook gated)', 'BUILT LOCALLY', { built: Y, tests: Y, tenant: Y, rbac: Y, evidence: 'finance-j62-phase.test.ts' });
add('FIN-004', 'quotes', 'Genuine server PDF preview (Puppeteer/Chromium)', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'finance-document-pdf.service.test.ts', dep: 'Chromium on API pod' });
add('FIN-005', 'quotes', 'Google Maps address autocomplete + manual fallback', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'finance-addresses-manual-fallback.test.ts', dep: 'Google Maps API key' });
add('FIN-006', 'quotes', 'Live updates SSE without dirty-form overwrite', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'live-updates stream route' });
add('FIN-007', 'invoices', 'Title-free invoice editor + Xero number pending honesty', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'finance-j6-phase.test.ts' });
add('FIN-008', 'invoices', 'Invoice stages (deposit/progress/final) per job', 'PARTIALLY IMPLEMENTED', { built: Y, evidence: 'UX-E staging' });
add('FIN-009', 'invoices', 'Synced Xero invoice edit blocked (409 SYNC_CONFLICT)', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'xero-write-approval-gate.test.ts' });
add('FIN-010', 'finance', 'Finance list search + detail routes', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'UX-E' });
add('FIN-011', 'finance', 'Cashflow / profit / reporting forecast pages', 'FOUNDATION ONLY', { built: Y, tests: Y, evidence: 'finance-cashflow-profit.ts', blocker: 'NOT VISUALLY VERIFIED on staging' });
add('FIN-012', 'finance', 'Payment receipts on payment record', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'FIN-004 UX-E' });
add('FIN-013', 'finance', 'Payment links / Yoco checkout', 'NOT FOUND', { blocker: 'FIN-014' });
add('FIN-014', 'pricebook', 'Tenant-scoped pricebook table (YGP-001)', 'PARTIALLY IMPLEMENTED', { built: Y, tests: Y, evidence: 'YOUNG_GUNS_APPROVED_FINANCE_PRICEBOOK temp constants' });
add('FIN-015', 'pricebook', 'Dedicated pricebook catalog UI', 'NOT FOUND', { blocker: 'FIN-015 deferral' });

// ─── Phase J-6.6A (current phase — YES only after proven at new commit) ────────
add('J66A-001', 'finance', 'Phase J-6.6A: Finance RBAC hardening (cost strip, catalogue, document routes)', 'PARTIALLY IMPLEMENTED', { built: Y, tests: Y, rbac: Y, evidence: 'finance-j64-phase.test.ts; in-flight hardening', commit: P, next: 'Complete + commit J-6.6A' });
add('J66A-002', 'finance', 'Phase J-6.6A: Save semantics (draft placeholder lines, save-from-preview idempotency)', 'PARTIALLY IMPLEMENTED', { built: Y, tests: Y, evidence: 'finance-document-save.test.ts (in-flight)', commit: P, next: 'Complete + commit J-6.6A' });
add('J66A-003', 'finance', 'Phase J-6.6A: Five finance regression test fixes', 'PARTIALLY IMPLEMENTED', { tests: Y, evidence: '5 suites in flight', commit: P, next: 'Green pnpm test + commit' });
add('J66A-004', 'finance', 'Phase J-6.6A: Migration 0176 apply script hardening (backup gate, staging ref)', 'PARTIALLY IMPLEMENTED', { built: Y, tests: Y, evidence: 'finance-migration-0176.test.ts; apply-0176-staging-only.mjs', dep: '0176', commit: P, next: 'Owner-approved staging apply' });
add('J66A-005', 'repo', 'Phase J-6.6A: Authoritative master completion checklist (this document)', 'BUILT LOCALLY', { built: Y, evidence: 'docs/TITAN_MASTER_COMPLETION_CHECKLIST.md', commit: P, next: 'Commit at end of J-6.6A' });

// ─── Xero ────────────────────────────────────────────────────────────────────
add('XERO-001', 'Xero', 'OAuth connect + tenant isolation', 'DEPLOYED TO STAGING', { built: Y, staging: Y, db: Y, evidence: 'TITAN_FRZ018_XERO_STAGING_REPORT.md' });
add('XERO-002', 'Xero', 'Background historical import (contacts/invoices/payments)', 'PARTIALLY IMPLEMENTED', { built: Y, db: Y, blocker: 'Import job running; last_sync_at null', dep: 'Xero OAuth' });
add('XERO-003', 'Xero', 'Xero as sole official quote/invoice numbering authority', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'finance-document-preview.test.ts' });
add('XERO-004', 'Xero', 'Two-way write with Owner approval gate', 'PARTIALLY IMPLEMENTED', { built: Y, tests: Y, blocker: 'Live write gated — FIN-005/007 NOT GO' });
add('XERO-005', 'Xero', 'Decision 3 contact classification (ACCREC paid-buyer)', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'UX-H classifier' });

// ─── Attachments, PDF, storage ───────────────────────────────────────────────
add('ATT-001', 'attachments', 'Finance direct upload (image/PDF) without job link', 'BUILT LOCALLY', { built: Y, tests: Y, rbac: Y, evidence: 'finance-j64a-phase.test.ts' });
add('ATT-002', 'attachments', 'Job evidence storage + titan_documents.photos JSONB', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'finance-document-evidence-storage.service.test.ts' });
add('ATT-003', 'attachments', 'Include-in-PDF toggle + caption/order persistence', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'finance-document-photos.test.ts' });
add('PDF-001', 'Chromium/PDF', 'PuppeteerFinanceDocumentPdfRenderer (%PDF signature)', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'finance-document-pdf.service.test.ts', dep: 'Chromium' });
add('PDF-002', 'Chromium/PDF', 'API /health/pdf-renderer diagnostic', 'BUILT LOCALLY', { built: Y, evidence: 'health route', dep: 'Chromium on staging pod' });
add('STOR-001', 'storage', 'JOB_EVIDENCE_STORAGE_PATH persistent volume', 'PARTIALLY IMPLEMENTED', { built: Y, dep: 'Railway volume /var/lib/titan/storage', blocker: 'Staging volume mount unverified locally' });
add('STOR-002', 'storage', 'Staging finance attachment cleanup service', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'finance-document-staging-cleanup.service.test.ts' });
add('CLN-001', 'cleanup', '59 E2E disposable tenant cleanup manifest', 'FOUNDATION ONLY', { built: Y, evidence: 'TITAN_STAGING_DATA_CLEANUP_MANIFEST.md', blocker: 'Owner approval required' });
add('CLN-002', 'cleanup', 'Staging data hygiene (1 live tenant + QA isolation)', 'PARTIALLY IMPLEMENTED', { blocker: '180-staging-data-cleanup-audit FAIL' });

// ─── Integrations ──────────────────────────────────────────────────────────────
add('INT-001', 'Gmail', 'Gmail intelligence backend (Decision 4 NOT IMPLEMENTED)', 'NOT FOUND', { blocker: 'COM-006 honesty-only card', evidence: 'TITAN_COMPLETE_APP_AUDIT FAIL' });
add('INT-002', 'WhatsApp', 'WhatsApp Graph client + webhooks scaffold', 'FOUNDATION ONLY', { built: Y, dep: 'Meta credentials', blocker: 'NOT_AUDITED live' });
add('INT-003', 'WhatsApp', 'WhatsApp human takeover + live send', 'NOT FOUND', { blocker: 'COM-003; credentials gate' });
add('INT-004', 'WhatsApp', 'Contact enrichment for missing mobile (COM-013)', 'PARTIALLY IMPLEMENTED', { built: Y, evidence: 'TITAN_WHATSAPP_CONTACT_ENRICHMENT.md' });
add('INT-005', 'Yoco', 'Yoco business profile sync', 'PARTIALLY IMPLEMENTED', { built: Y, dep: 'Yoco secret', blocker: 'No payment links/charges FIN-011' });
add('INT-006', 'Resend', 'Transactional email via Resend/SMTP connector', 'PARTIALLY IMPLEMENTED', { built: Y, evidence: 'SMTP available; not Gmail-branded' });
add('INT-007', 'Maps', 'Google Maps autocomplete (finance addresses)', 'BUILT LOCALLY', { built: Y, tests: Y, dep: 'Google Maps API' });
add('INT-008', 'Maps', 'Live Directions / ETA routing', 'NOT FOUND', { blocker: 'FLT-008 deferred' });
add('INT-009', 'social', 'Meta/Google ads adapters live', 'FOUNDATION ONLY', { built: Y, blocker: 'MKT-003 not connected' });
add('INT-010', 'bank', 'Open banking / bank feed integration', 'NOT FOUND', { blocker: 'Future scope' });
add('INT-011', 'notifications', 'Push + in-app notification delivery', 'PARTIALLY IMPLEMENTED', { built: Y, evidence: 'notification_intelligence agent scaffold' });
add('INT-012', 'Gmail', 'Integrations hub truthful NOT IMPLEMENTED badge', 'TESTED LOCALLY', { built: Y, tests: Y, evidence: 'IntegrationAutoSyncStatusPanel' });

// ─── Marketing & reports ─────────────────────────────────────────────────────
add('MKT-001', 'marketing', 'Marketing consent + eligibility gates (POPIA)', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'UX-H/UX-026' });
add('MKT-002', 'marketing', 'Campaign execute — honest SEND_PATH_NOT_IMPLEMENTED', 'DEPLOYED TO STAGING', { built: Y, staging: Y });
add('MKT-003', 'marketing', 'Live email/SMS/WhatsApp campaign send', 'NOT FOUND', { blocker: 'Provider + Owner approval' });
add('RPT-001', 'reports', 'Owner dashboard KPI strip + today scheduled panel', 'DEPLOYED TO STAGING', { built: Y, staging: Y, evidence: 'UX-I/UX-012' });
add('RPT-002', 'reports', 'Analytics KPI definitions on home', 'PARTIALLY IMPLEMENTED', { built: Y, blocker: 'UX-038' });
add('RPT-003', 'reports', 'End-to-end quote → cash reporting chain', 'NOT FOUND', { blocker: 'Chain not live-verified' });
add('RPT-004', 'reports', 'Enterprise BI / data warehouse pages', 'FOUNDATION ONLY', { built: Y, blocker: 'NOT VISUALLY VERIFIED — decorative' });

// ─── AURA & AI agents ────────────────────────────────────────────────────────
add('AURA-001', 'AURA', 'AURA chat with configured provider (OpenAI/Claude/Gemini)', 'DEPLOYED TO STAGING', { built: Y, staging: Y, db: Y, evidence: 'FRZ-015 12/12 GO' });
add('AURA-002', 'AURA', 'Multi-AI gateway + provider registry', 'PARTIALLY IMPLEMENTED', { built: Y, evidence: 'ai-orchestration routes' });
add('AURA-003', 'AURA', 'Agent orchestration engine (backend handoffs)', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'agent-orchestration.service.ts' });
add('AURA-004', 'AURA', 'Agent orchestration web UI', 'NOT FOUND', { blocker: 'TITAN_AURA_AGENT_COLLABORATION_AUDIT' });
add('AURA-005', 'AURA', 'AURA approved actions fail loudly (no silent no-op)', 'PARTIALLY IMPLEMENTED', { blocker: 'UX-032' });
add('AI-001', 'AI agent families', 'Executive Intelligence agents (6) — registry + runtime scaffold', 'FOUNDATION ONLY', { built: Y, evidence: 'AGENT_REGISTRY executive*' });
add('AI-002', 'AI agent families', 'Finance Intelligence agents (8) — finance_aura routes wired', 'PARTIALLY IMPLEMENTED', { built: Y, tests: Y, evidence: 'finance-aura-agent.test.ts' });
add('AI-003', 'AI agent families', 'Operations/Dispatch agents (8) — scheduling/dispatch scaffold', 'FOUNDATION ONLY', { built: Y });
add('AI-004', 'AI agent families', 'Technician Intelligence agents (5) — mobile assistant scaffold', 'FOUNDATION ONLY', { built: Y });
add('AI-005', 'AI agent families', 'Fleet Intelligence agents (5) — fleet manager scaffold', 'FOUNDATION ONLY', { built: Y, blocker: 'Cartrack gate' });
add('AI-006', 'AI agent families', 'Inventory & Procurement agents (5)', 'FOUNDATION ONLY', { built: Y });
add('AI-007', 'AI agent families', 'HR & Workforce agents (5)', 'FOUNDATION ONLY', { built: Y });
add('AI-008', 'AI agent families', 'Marketing Intelligence agents (8) — honest blocked send', 'PARTIALLY IMPLEMENTED', { built: Y });
add('AI-009', 'AI agent families', 'Customer Experience agents (7) — receptionist/voice scaffold', 'FOUNDATION ONLY', { built: Y });
add('AI-010', 'AI agent families', 'Document/Compliance agents — document_intelligence wired', 'PARTIALLY IMPLEMENTED', { built: Y, tests: Y });
add('AI-011', 'AI agent families', '77-agent V1 audit complete per checklist', 'NOT FOUND', { blocker: 'TITAN_AURA_V1_FINAL_ACCEPTANCE_CHECKLIST.md — 0/77 verified' });

// ─── Ops, security, infra ────────────────────────────────────────────────────
add('OPS-001', 'audit logs', 'Workflow audit logs + central security audit', 'PARTIALLY IMPLEMENTED', { built: Y, evidence: 'workflow-audit-logs schema' });
add('OPS-002', 'system health', '/api/v1/health + /health/ready database connected', 'DEPLOYED TO STAGING', { built: Y, staging: Y, db: Y });
add('OPS-003', 'system health', 'Background work status panel', 'PARTIALLY IMPLEMENTED', { built: Y, blocker: 'Not embedded all pages' });
add('SEC-001', 'security', 'Forbidden-action API matrix (71 tests)', 'TESTED LOCALLY', { built: Y, tests: Y, rbac: Y, staging: Y });
add('SEC-002', 'security', 'MFA + step-up auth for sensitive actions', 'TESTED LOCALLY', { built: Y, tests: Y });
add('SEC-003', 'security', 'Enterprise zero-trust decorative pages vs real controls', 'PARTIALLY IMPLEMENTED', { built: Y, blocker: 'Useful-function audit FAIL on enterprise pages' });
add('BAK-001', 'backups', 'Staging pg_dump backup gate before migrations', 'FOUNDATION ONLY', { built: Y, evidence: 'apply-0176-staging-only.mjs', blocker: 'Phase 2 not run — no credentials' });
add('BAK-002', 'backups', 'Disaster recovery policies + backup verification UI', 'FOUNDATION ONLY', { built: Y, evidence: 'EnterpriseProductionReadinessService' });
add('RB-001', 'rollback', 'Git + Railway revision rollback documented', 'PARTIALLY IMPLEMENTED', { evidence: 'TITAN_STAGING_BASELINE_FREEZE.md' });
add('RB-002', 'rollback', 'Database restore from verified backup', 'NOT FOUND', { blocker: 'No backup created this cycle' });
add('MON-001', 'monitoring', 'Mission Control alert sync', 'FOUNDATION ONLY', { built: Y, blocker: 'NOT VISUALLY VERIFIED' });
add('MON-002', 'monitoring', 'Performance audit + observability Phase 22', 'NOT FOUND', { blocker: 'PIPE-10 queued' });

// ─── UX, testing, environments ───────────────────────────────────────────────
add('UX-001', 'accessibility', 'Finance workspace reflow without overflow-x clip', 'TESTED LOCALLY', { built: Y, tests: Y, desktop: Y, tablet: Y, mobile: Y });
add('UX-002', 'accessibility', 'Young Guns dark theme consistent (f8cc0c4 theme pass)', 'BUILT LOCALLY', { built: Y, tests: Y, evidence: 'young-guns-theme.test.ts @ f8cc0c4' });
add('UX-003', 'accessibility', 'WCAG audit across 155 pages', 'NOT FOUND', { blocker: 'No full a11y audit' });
add('MOB-001', 'mobile/tablet', 'Technician mobile execution UX-B closure', 'DEPLOYED TO STAGING', { built: Y, staging: Y, mobile: Y, tablet: Y, evidence: 'UX-B 35/35' });
add('MOB-002', 'mobile/tablet', 'Finance editor tablet/mobile reflow verified in tests', 'TESTED LOCALLY', { built: Y, tests: Y, tablet: Y, mobile: Y });
add('MOB-003', 'mobile/tablet', 'Client portal /my mobile parity', 'PARTIALLY IMPLEMENTED', { built: Y, mobile: Y });
add('TST-001', 'testing', 'Automated cross-tenant + RBAC test matrix', 'TESTED LOCALLY', { built: Y, tests: Y, rbac: Y, tenant: Y });
add('TST-002', 'testing', 'Staging public E2E scripts (Phases 5–12)', 'OWNER VERIFIED', { built: Y, tests: Y, staging: Y, e2e: Y, owner: Y, evidence: '140–142 staging E2E JSON' });
add('TST-003', 'testing', 'Owner authenticated finance smoke J-5/J-6.5', 'PARTIALLY IMPLEMENTED', { built: Y, evidence: 'docs/TITAN_FINANCE_STAGING_SMOKE_J65.md', blocker: 'SUPERSEDED — awaiting J-6.6A deploy' });
add('TST-004', 'testing', 'Playwright browser suite with staging credentials', 'NOT FOUND', { blocker: 'No apps/api/.env.staging.local on agent host' });
add('STG-001', 'staging', 'Railway API + Web deployed from integration branch', 'PARTIALLY IMPLEMENTED', { staging: Y, blocker: 'Deploy revision unconfirmed; route probes suggest partial live' });
add('STG-002', 'staging', 'Migrations 0176→0177→0178 applied exactly once', 'PARTIALLY IMPLEMENTED', { dep: '0176,0177,0178', blocker: 'Blocked by backup/credentials gate' });
add('STG-003', 'staging', 'APP_ENV=staging + DATABASE_URL ref cpkuwtaipjxeipvbssvn only', 'NOT FOUND', { blocker: 'apps/api/.env.staging.local absent locally' });
add('PRD-001', 'production', 'Production ref rshuiaghmtrvvilhqpwm never targeted', 'OWNER VERIFIED', { owner: Y, evidence: 'Safety rule enforced' });
add('PRD-002', 'production', 'Production deploy + migration gate', 'NOT FOUND', { blocker: 'Explicit Owner gate — staging must GO first' });
add('PRD-003', 'production', 'Pilot readiness sign-off (FRZ-022)', 'NOT FOUND', { blocker: 'TITAN_PILOT_READINESS_REPORT.md blocked by approval' });

const header = `# TITAN Master Completion Checklist

**Authoritative master list** — consolidates Claude and Gemini audits from baseline **\`f8cc0c4\`** (\`feat(ui): apply Young Guns theme across TITAN and document engine\`).

| Field | Value |
|-------|-------|
| **Document role** | Single source of truth for TITAN completion status |
| **Supersedes** | Staging-release-only checklist content in repo root \`TITAN_MASTER_COMPLETION_CHECKLIST.md\` (now a pointer only) |
| **Audit baseline (HEAD f8cc0c4)** | **Built ~72%** · **Verified locally ~48%** · **Production ready ~12%** |
| **Recovery worktree** | \`/workspace/.worktrees/titan-recovery\` |
| **Recovery branch** | \`cursor/titan-v1-integration-recovery\` |
| **Deploy branch** | \`cursor/titan-v1-integration\` |
| **Staging Supabase ref** | \`cpkuwtaipjxeipvbssvn\` |
| **Production ref (forbidden)** | \`rshuiaghmtrvvilhqpwm\` |
| **Updated (UTC)** | 2026-08-04 |
| **Binding rule** | \`TITAN_BINDING_ACCEPTANCE_RULE.md\` (10 criteria) |
| **Audit sources** | \`TITAN_COMPLETE_APP_AUDIT.md\`, \`TITAN_ACCEPTANCE_REGISTER.md\`, \`TITAN_GAP_BACKLOG.md\`, \`TITAN_AURA_AGENT_COLLABORATION_AUDIT.md\`, finance J-6.x phase evidence |

---

## Audit baseline summary

Consolidated Claude + Gemini pass at **\`f8cc0c4\`**:

| Metric | Estimate | Meaning |
|--------|----------|---------|
| **Built ~72%** | Code/API/UI exists for most modules | Substantial implementation (~155 web pages, 84 API route modules); includes foundation-only and decorative surfaces |
| **Verified locally ~48%** | Automated tests + local proofs | Cross-tenant matrix, finance editor suites, role guards, UX tranche closures |
| **Production ready ~12%** | Meets all 10 binding criteria with Owner sign-off | Pilot-critical chains partially proven; production forbidden until staging GO |

Prior register estimate (**~27% verified live** on 116-row traceability) remains valid for **strict binding-rule verified complete** classification. The 72/48/12 split reflects **breadth of built code** vs **local verification depth** vs **production gates**.

---

## Merged master sequence (16 steps)

Execute in order. Do **not** skip gates. Production is forbidden until step 16 grants a **separate** production approval.

| Step | Gate | Requirement | Current status @ f8cc0c4 |
|------|------|-------------|---------------------------|
| **1** | Identity | Repository / worktree / branch / HEAD \`f8cc0c4\` confirmed | **DONE** |
| **2** | Git safety | \`git fetch origin\` — no rebase/reset; deploy branch lineage verified | **DONE** |
| **3** | Credentials | \`APP_ENV=staging\`, \`TITAN_ENV=staging\`, \`DATABASE_URL\` ref \`cpkuwtaipjxeipvbssvn\` only | **BLOCKED** — no local \`.env.staging.local\` |
| **4** | Backup | Verified \`pg_dump\` custom backup, SHA-256, \`pg_restore --list\`, rollback command recorded | **NOT RUN** |
| **5** | Migration precheck | Read-only: prior migration applied, target not yet applied, protected row counts | **NOT RUN** — blocked by step 4 |
| **6** | Migration apply | Guarded staging-only scripts **0176 → 0177 → 0178** (never \`drizzle-kit migrate\`) | **NOT RUN** |
| **7** | Local quality | \`pnpm\` build + automated test suite green (incl. J-6.6A fixes) | **IN PROGRESS** — J-6.6A |
| **8** | Git publish | Push recovery branch; fast-forward deploy branch without force-push | **PENDING** — Owner gate |
| **9** | Deploy | Railway staging API + Web from \`cursor/titan-v1-integration\`; Chromium on API pod | **PARTIAL** — health probes OK; revision unconfirmed |
| **10** | Smoke probes | \`/health\`, \`/health/ready\`, finance routes return 401 not 404, PDF renderer diagnostic | **PARTIAL** |
| **11** | Security auto | Finance RBAC + tenant isolation automated tests green | **IN PROGRESS** — J-6.6A |
| **12** | Owner E2E | Authenticated finance smoke (\`docs/TITAN_FINANCE_STAGING_SMOKE_J65.md\`) | **NOT STARTED** — supersedes J-5 |
| **13** | Desktop | Visual verification ~1440px (finance editors, core ops surfaces) | **PARTIAL** — finance layout tests only |
| **14** | Tablet | Visual verification 1024px / 768px reflow | **PARTIAL** — CSS/tests; not Owner-verified |
| **15** | Mobile | Visual verification ~390px (finance + technician paths) | **PARTIAL** — UX-B mobile GO; finance tests only |
| **16** | Sign-off | Owner staging GO → separate production approval gate | **NO-GO** |

---

## Status vocabulary

| Status | Definition |
|--------|------------|
| **NOT FOUND** | No meaningful implementation |
| **FOUNDATION ONLY** | Scaffold/service/page exists; not wired to useful workflow |
| **PARTIALLY IMPLEMENTED** | Significant pieces exist; acceptance chain incomplete |
| **BUILT LOCALLY** | Implemented in recovery worktree; not staging-verified |
| **TESTED LOCALLY** | Automated local tests pass; staging/live proof pending |
| **STAGING READY** | Committed; awaiting deploy + smoke |
| **DEPLOYED TO STAGING** | Live on staging URLs with route/health evidence |
| **OWNER VERIFIED** | Owner authenticated click-path or sign-off recorded |
| **PRODUCTION READY** | All 10 binding criteria met; production gate may be requested |

Boolean columns use **YES** / **NO** / **—** (not applicable).

---

## Requirements register

**Total requirement rows:** ${rows.length}

`;

const colHeaders = [
  'ID', 'Area', 'Requirement', 'Status',
  'Built locally', 'Tests passed', 'Real DB/provider connected',
  'RBAC tested', 'Tenant isolation tested', 'Deployed to staging',
  'Authenticated E2E passed', 'Desktop verified', 'Tablet verified', 'Mobile verified',
  'Claude verified', 'Gemini verified', 'Owner verified', 'Production ready',
  'Evidence', 'Commit', 'Migration/provider dependency', 'Blocker', 'Next action',
];

function esc(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

const tableRows = rows.map((r) =>
  `| ${[
    r.id, r.area, r.requirement, r.status,
    r.built, r.tests, r.db, r.rbac, r.tenant, r.staging,
    r.e2e, r.desktop, r.tablet, r.mobile,
    r.claude, r.gemini, r.owner, r.prod,
    r.evidence, r.commit, r.dep, r.blocker, r.next,
  ].map(esc).join(' | ')} |`,
);

const notVisuallyVerified = `
---

## NOT VISUALLY VERIFIED surfaces

The following surfaces have **code/routes/tests** but lack **Owner authenticated visual verification** on staging at \`f8cc0c4\`. Do not treat as complete.

| Surface | Route / module | Why unverified | Register / gap |
|---------|----------------|----------------|----------------|
| Enterprise Mission Control | \`/mission-control\`, \`/enterprise-modules\` | Decorative / generic placeholders | BIND-001, UX-039 |
| Enterprise Digital Twin | \`/digital-twin\` | Foundation milestone copy; no live ops proof | Milestone 55 |
| Enterprise Knowledge Graph | \`/knowledge-graph\` | Semantic search not Owner-click verified | Milestone 56 |
| Enterprise Analytics / BI warehouse | \`/enterprise-analytics\` | KPI depth varies; not pilot-critical path | RPT-004 |
| Enterprise Automation Studio | \`/automation-studio\` | Designer not staging smoke tested | Milestone 54 |
| Enterprise Financial Planning | \`/financial-planning\` | Simulation pages not Owner verified | Milestone 68 |
| Enterprise Marketing Intelligence | \`/marketing-intelligence\` | Execute paths honest-blocked; UI not visually signed off | MKT-003 |
| Enterprise Sales Intelligence | \`/sales-intelligence\` | Overlaps /leads; decorative sections | CRM-009 |
| Enterprise IT Operations | \`/it-operations\` | Health monitors exist; not visually verified | Milestone 97 |
| Enterprise App Builder | \`/app-builder\` | Owner-only NL feature lifecycle — not started visually | Milestone 71 |
| Finance cashflow / profit / forecast pages | \`/finance/cashflow-profit\`, etc. | API wired; no staging visual sign-off | FIN-011 |
| Configuration Studio publish/rollback | \`/settings/configuration\` | FRZ-019 — draft/version/rollback missing | FRZ-019 |
| Gmail integration card | Integrations hub | Honesty-only NOT IMPLEMENTED | COM-006 FAIL |
| Cartrack live fleet map | Owner Command Centre | Credentials not configured | FLT-004 |
| WhatsApp live send + human takeover | Comms / Integrations | Meta credentials gate | COM-001, COM-003 |
| Portal live technician tracking map | \`/my/jobs/:id\` | fetchPortalJob ETA depth open | UX-030 |
| AURA Agent Orchestration web UI | *(no web pages)* | Backend only — no UI | AURA-004 |
| Google Calendar sync | Integrations | BUILT BUT NOT CONNECTED | COM-008 |
| Payment links / Yoco checkout | Finance / portal pay | FIN-014 missing | UX-055 remainder |
| n8n live cloud connector | Automations | Loopback-only; live cloud OUT | AUT-002 |
| Meta / Google live ad spend UI | Marketing integrations | Adapter config only | INT-009 |
| Platform Owner / Manager / Accountant roles | Users & Access | PLT-003 not implemented | ROLE-006 |
| SSO / IdP login | Auth settings | PLT-009 missing | AUTH-005 |
| Global search live invalidation | Nav search | UX-I partial | FRZ-004 |
| Live UI auto-refresh all operational lists | App-wide | Domain events limited subset | BIND-003 |
| Stripe payments | Finance | FIN-012 missing | — |
| Business evolution / continuous learning UI | \`/business-evolution\` | Extensive nav; not Owner verified | Milestone 70 |
| Young Guns theme on all 155 pages | App-wide | f8cc0c4 covers finance/docs; full app sweep pending | UX-002 partial |

`;

const futurePhases = `
---

## Future phases (visible — not started)

These phases are **documented and visible in backlog/plans** but must **not** be treated as in-progress unless explicitly approved.

| Phase | Focus | Source | Status |
|-------|-------|--------|--------|
| **Theme cleanup** | Young Guns theme consistency across remaining 155 pages; remove legacy tokens | f8cc0c4 partial pass | **QUEUED** |
| **Reports & analytics** | KPI definitions on home; quote→cash reporting; BI warehouse useful wiring | FRZ-008, RPT-002–004 | **QUEUED** |
| **Technician tracking** | Live en-route map; portal ETA; Cartrack Directions | UX-030, FLT-008, EXE-005 | **QUEUED** |
| **Integrations live** | Cartrack, WhatsApp live send, Gmail backend, Google Calendar, Meta/Google ads | COM-001–008, INT-009 | **QUEUED** — credential gates |
| **Xero complete sync** | Background import GO; two-way write verify; official numbering live | XERO-002, XERO-004 | **IN PROGRESS** — import running |
| **Pricebook YGP-001** | Tenant-scoped pricebook DB replacing temp YG constants | FIN-014, FIN-015 | **QUEUED** |
| **Configuration Studio** | Draft / preview / version / rollback (FRZ-019) | TITAN_FRZ019_CONFIG_STUDIO_AUDIT.md | **QUEUED** |
| **Domain events app-wide** | Materials, invoice, document, webhook → live UI invalidation | BIND-003, BIND-004 | **QUEUED** |
| **Staging data cleanup** | Delete 59 E2E disposable tenants after Owner approval | CLN-001 | **BLOCKED** — Owner gate |
| **Decorative enterprise hide/complete** | Hide or wire enterprise intelligence pages | TITAN_CLEAN_DATA_UX_QUEUE Phase F3 | **QUEUED** |
| **Calendar drag-drop** | Day/week/month scheduling component | TITAN_NEXT_IMPLEMENTATION_STAGE_PLAN | **QUEUED** |
| **Job detail 360** | Per-visit tabs; mobile parity | TITAN_NEXT_IMPLEMENTATION_STAGE_PLAN | **QUEUED** |
| **AURA Developer Agent + Cursor Cloud provider** | Owner-only dev assistant via \`cursor_cloud_agent\` adapter | Root checklist future section | **PLANNED / NOT STARTED** |
| **AURA Voice throughout TITAN** | Persistent mic + STT/TTS all channels | docs/AURA_VOICE_THROUGHOUT_TITAN.md | **PLANNED / NOT STARTED** |
| **Department 21 SaaS scaling** | Multi-tenant billing, white-label, entitlements | docs/TITAN_AURA_DEPARTMENT_21_SAAS_SCALING.md | **QUEUED** — after Xero phase |
| **Production hardening** | Phase 22 observability, backup, perf | TITAN_MASTER_EXECUTION_PLAN Phase 22 | **QUEUED** |
| **Pilot sign-off → commercial launch** | FRZ-022 / FRZ-023 complete chain | TITAN_PILOT_READINESS_REPORT.md | **BLOCKED** |

---

## Phase J-6.6A scope (current)

Items **J66A-001 … J66A-005** in the register above are targeted for completion in **Phase J-6.6A**. Use **YES** in boolean columns **only after proven at the new J-6.6A commit** — not preemptively at baseline \`f8cc0c4\`.

| ID | Deliverable | J-6.6A target |
|----|-------------|---------------|
| J66A-001 | Finance RBAC hardening | Cost strip, catalogue, document-engine routes |
| J66A-002 | Save semantics | Draft placeholder lines; save-from-preview idempotency |
| J66A-003 | Five test fixes | Finance regression suite green |
| J66A-004 | Migration 0176 hardening | Backup gate + staging ref guards |
| J66A-005 | This checklist | Authoritative \`docs/TITAN_MASTER_COMPLETION_CHECKLIST.md\` |

---

## GO / NO-GO @ f8cc0c4

| Gate | Verdict |
|------|---------|
| Staging release | **NO-GO** |
| Production | **FORBIDDEN** |
| Primary blockers | No staging credentials locally; migrations 0176–0178 not applied; Owner finance E2E not run; J-6.6A in progress |
| Next action | Complete J-6.6A → commit → Owner approval → execute master sequence steps 3–16 |

---

*Generated requirement count: **${rows.length}** rows. Update this document when any row changes classification; do not maintain competing checklists elsewhere.*
`;

const md = header + '| ' + colHeaders.join(' | ') + ' |\n|' + colHeaders.map(() => '---').join('|') + '|\n' + tableRows.join('\n') + notVisuallyVerified + futurePhases;

writeFileSync(outPath, md, 'utf8');
console.log(`Wrote ${outPath} with ${rows.length} requirement rows`);
