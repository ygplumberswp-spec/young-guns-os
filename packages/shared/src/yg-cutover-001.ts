/**
 * YG-CUTOVER-001 — Owner cutover approval & final pre-production readiness.
 * No production deploy, migration, WhatsApp real-number migration, or live payments.
 */

import {
  YG_LIVE_PRODUCTION_FORBIDDEN_DB_REF,
  YG_LIVE_STAGING_API,
  YG_LIVE_STAGING_COMPANY_ID,
  YG_LIVE_STAGING_DB_REF,
  YG_LIVE_STAGING_WEB,
  YG_LIVE_XERO_TENANT_ID,
} from './yg-live-001.js';

export const YG_CUTOVER_STAGING_COMPANY_ID = YG_LIVE_STAGING_COMPANY_ID;
export const YG_CUTOVER_STAGING_WEB = YG_LIVE_STAGING_WEB;
export const YG_CUTOVER_STAGING_API = YG_LIVE_STAGING_API;
export const YG_CUTOVER_STAGING_DB_REF = YG_LIVE_STAGING_DB_REF;
export const YG_CUTOVER_PRODUCTION_FORBIDDEN_DB_REF = YG_LIVE_PRODUCTION_FORBIDDEN_DB_REF;
export const YG_CUTOVER_XERO_TENANT_ID = YG_LIVE_XERO_TENANT_ID;

/** Required individual account slots — do not invent people or shared logins. */
export type YgCutoverRequiredSlot = {
  slotId: string;
  roleFamily: 'Owner' | 'Admin' | 'Technician' | 'Client';
  canonicalInviteRole: string | null;
  minCount: number;
  provisioningPath: string;
  notes: string;
};

export const YG_CUTOVER_REQUIRED_USER_SLOTS: readonly YgCutoverRequiredSlot[] = [
  {
    slotId: 'owner',
    roleFamily: 'Owner',
    canonicalInviteRole: null,
    minCount: 1,
    provisioningPath: 'Existing Company Owner / Platform Owner account (not inviteable via team invite)',
    notes: 'Must be an individual Owner login — never a shared staff password.',
  },
  {
    slotId: 'admin-office',
    roleFamily: 'Admin',
    canonicalInviteRole: 'Manager',
    minCount: 1,
    provisioningPath: 'Team → Invite → Manager (or Dispatcher for schedule-heavy office)',
    notes: 'Admin/Office operational access without automatic Owner-only security powers.',
  },
  {
    slotId: 'technician',
    roleFamily: 'Technician',
    canonicalInviteRole: 'Technician',
    minCount: 1,
    provisioningPath: 'Team → Invite → Technician (one invite per real plumber)',
    notes: 'Each technician needs their own login for assigned Job Cards only.',
  },
  {
    slotId: 'client',
    roleFamily: 'Client',
    canonicalInviteRole: null,
    minCount: 0,
    provisioningPath: 'Portal invite from customer record when a real client needs portal access',
    notes: 'Optional for cutover; required before relying on client portal in production.',
  },
] as const;

export type YgCutoverUserAuditRow = {
  idPrefix: string;
  emailMasked: string | null;
  roleName: string;
  roleFamily: 'Owner' | 'Admin' | 'Technician' | 'Client' | 'Other';
  isActive: boolean;
  mfaConfigured: boolean | null;
  invitePending: boolean;
};

export type YgCutoverUserAuditResult = {
  status: 'verified' | 'stale_evidence' | 'blocked_no_credentials';
  companyId: string;
  auditedAt: string | null;
  users: readonly YgCutoverUserAuditRow[];
  roleCounts: Record<string, number>;
  missingSlots: readonly string[];
  p0Closed: boolean;
  note: string;
};

/**
 * Classify a DB/API role name into cutover role family.
 * Does not invent users — classification only.
 */
export function classifyYgCutoverRoleFamily(
  roleName: string | null | undefined,
): YgCutoverUserAuditRow['roleFamily'] {
  const name = (roleName ?? '').trim();
  if (
    name === 'Owner' ||
    name === 'Company Owner' ||
    name === 'Platform Owner'
  ) {
    return 'Owner';
  }
  if (
    name === 'Admin' ||
    name === 'Manager' ||
    name === 'Dispatcher' ||
    name === 'Accountant' ||
    name === 'Office'
  ) {
    return 'Admin';
  }
  if (name === 'Technician') return 'Technician';
  if (name === 'Client') return 'Client';
  return 'Other';
}

export function evaluateYgCutoverUserSlots(
  users: readonly YgCutoverUserAuditRow[],
): { missingSlots: string[]; p0Closed: boolean } {
  const active = users.filter((u) => u.isActive);
  const owners = active.filter((u) => u.roleFamily === 'Owner').length;
  const admins = active.filter((u) => u.roleFamily === 'Admin').length;
  const technicians = active.filter((u) => u.roleFamily === 'Technician').length;

  const missingSlots: string[] = [];
  if (owners < 1) missingSlots.push('owner');
  if (admins < 1) missingSlots.push('admin-office');
  if (technicians < 1) missingSlots.push('technician');

  return {
    missingSlots,
    p0Closed: missingSlots.length === 0,
  };
}

/** Mask login identifiers for reports — never print passwords/tokens. */
export function maskYgCutoverEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [user, domain] = email.split('@');
  if (!domain || !user) return '***';
  if (user.length <= 2) return `***@${domain}`;
  return `${user.slice(0, 1)}***${user.slice(-1)}@${domain}`;
}

export type YgCutoverAcceptanceStep = {
  id: string;
  role: 'Owner' | 'Admin' | 'Technician' | 'Client';
  order: number;
  title: string;
  action: string;
  passIf: string;
  failIf: string;
};

/** Non-technical Owner click-path — one action at a time. */
export const YG_CUTOVER_OWNER_CLICKPATH: readonly YgCutoverAcceptanceStep[] = [
  {
    id: 'owner-login',
    role: 'Owner',
    order: 1,
    title: 'Owner login',
    action: 'Open staging web → sign in with your Owner email (individual login)',
    passIf: 'You reach the Owner home/dashboard',
    failIf: 'Shared password login or wrong company',
  },
  {
    id: 'owner-dashboard',
    role: 'Owner',
    order: 2,
    title: 'Owner Dashboard',
    action: 'Confirm AURA and business pulse are near the top on desktop and phone width',
    passIf: 'Dashboard shows real Young Guns modules (not a blank demo)',
    failIf: 'Fake finance or missing AURA',
  },
  {
    id: 'owner-aura',
    role: 'Owner',
    order: 3,
    title: 'AURA',
    action: 'Ask: “What needs my attention today?”',
    passIf: 'Concise factual answer; incompleteness stated if sources incomplete',
    failIf: 'Invented jobs/invoices/profit',
  },
  {
    id: 'owner-customer',
    role: 'Owner',
    order: 4,
    title: 'Customer',
    action: 'Open CRM → open one real customer',
    passIf: 'Customer name/contact visible from TITAN records',
    failIf: 'Empty or wrong tenant customers',
  },
  {
    id: 'owner-property',
    role: 'Owner',
    order: 5,
    title: 'Property',
    action: 'From that customer, open/confirm a property/site',
    passIf: 'Site address context available for work',
    failIf: 'Property inventing / wrong customer linkage',
  },
  {
    id: 'owner-job',
    role: 'Owner',
    order: 6,
    title: 'Job',
    action: 'Open Jobs → open one real job (or create a controlled staging job if none)',
    passIf: 'Job linked to customer/property; status visible',
    failIf: 'Job without customer context',
  },
  {
    id: 'owner-dispatch',
    role: 'Owner',
    order: 7,
    title: 'Dispatch',
    action: 'Open Dispatch / Schedule for today',
    passIf: 'Assignments and schedule visible',
    failIf: 'Cannot see dispatch board',
  },
  {
    id: 'owner-job-card',
    role: 'Owner',
    order: 8,
    title: 'Technician Job Card',
    action: 'Open the job’s Job Card / execution view',
    passIf: 'Work description, checklist, evidence areas present',
    failIf: 'Job Card missing required field-work sections',
  },
  {
    id: 'owner-quote-invoice',
    role: 'Owner',
    order: 9,
    title: 'Quote / Invoice',
    action: 'Open Finance → Quotes or Invoices for a real document',
    passIf: 'Young Guns branding/contact; totals/VAT visible',
    failIf: 'Wrong company branding or silent Xero push',
  },
  {
    id: 'owner-finance',
    role: 'Owner',
    order: 10,
    title: 'Finance drill-down',
    action: 'Open Owner Financial Command / Cash / Profit Analytics',
    passIf: 'Known cash/profit; incomplete ≠ zero',
    failIf: 'Missing bank shown as R0 spent',
  },
  {
    id: 'owner-fleet',
    role: 'Owner',
    order: 11,
    title: 'Fleet',
    action: 'Open Fleet',
    passIf: 'Mapped vehicles; GPS freshness honest',
    failIf: 'Invented vehicle locations',
  },
  {
    id: 'owner-comms',
    role: 'Owner',
    order: 12,
    title: 'Communications',
    action: 'Open Communications Hub — review only',
    passIf: 'Gmail/WhatsApp channels distinguishable',
    failIf: 'You send a customer message during this check',
  },
  {
    id: 'owner-integrations',
    role: 'Owner',
    order: 13,
    title: 'Integrations',
    action: 'Open Integrations status',
    passIf: 'Xero = Young Guns Plumbing; WhatsApp still Test Number unless later approved',
    failIf: 'Wrong Xero organisation or real WhatsApp migrated without GO',
  },
] as const;

export const YG_CUTOVER_ADMIN_ACCEPTANCE: readonly YgCutoverAcceptanceStep[] = [
  {
    id: 'admin-login',
    role: 'Admin',
    order: 1,
    title: 'Admin login',
    action: 'Sign in with individual Admin/Office (Manager/Dispatcher) account',
    passIf: 'Lands in operational staff UI',
    failIf: 'Using Owner password or shared inbox login',
  },
  {
    id: 'admin-customer',
    role: 'Admin',
    order: 2,
    title: 'Customer',
    action: 'Find or create a customer',
    passIf: 'CRM customer record saved',
    failIf: 'Blocked from customers without Owner',
  },
  {
    id: 'admin-property',
    role: 'Admin',
    order: 3,
    title: 'Property',
    action: 'Confirm/create property for that customer',
    passIf: 'Site available for booking',
    failIf: 'Cannot attach site',
  },
  {
    id: 'admin-booking-job',
    role: 'Admin',
    order: 4,
    title: 'Booking → Job',
    action: 'Create booking/job for the property',
    passIf: 'Job exists and is schedulable',
    failIf: 'Job creation requires Owner login',
  },
  {
    id: 'admin-schedule',
    role: 'Admin',
    order: 5,
    title: 'Schedule + assign technician',
    action: 'Assign a Technician on Dispatch/Schedule',
    passIf: 'Technician assignment saved',
    failIf: 'Cannot assign without Owner',
  },
  {
    id: 'admin-documents',
    role: 'Admin',
    order: 6,
    title: 'Documents',
    action: 'Open/create quote or job document where authorised',
    passIf: 'Document available for office work',
    failIf: 'Unexpected Owner-only security wall on normal docs',
  },
  {
    id: 'admin-comms',
    role: 'Admin',
    order: 7,
    title: 'Communication',
    action: 'Open customer communication thread — draft only if needed',
    passIf: 'Can view/draft under Draft→Approve→Execute',
    failIf: 'Owner-only settings/integrations exposed as Admin default',
  },
] as const;

export const YG_CUTOVER_TECHNICIAN_ACCEPTANCE: readonly YgCutoverAcceptanceStep[] = [
  {
    id: 'tech-login',
    role: 'Technician',
    order: 1,
    title: 'Technician mobile login',
    action: 'Sign in on phone-width UI with individual Technician account',
    passIf: 'Mobile field experience opens',
    failIf: 'Owner dashboard or finance home',
  },
  {
    id: 'tech-today',
    role: 'Technician',
    order: 2,
    title: "Today's jobs / dispatch",
    action: 'Open today’s assigned jobs / schedule',
    passIf: 'Only assigned work listed',
    failIf: 'Full company job board with unrelated plumbers’ private jobs',
  },
  {
    id: 'tech-job-card',
    role: 'Technician',
    order: 3,
    title: 'Assigned Job Card',
    action: 'Open assigned Job Card → directions → start time → work details → materials → photos → checklist → signature → completion path',
    passIf: 'Field-work tools available for that visit',
    failIf: 'Missing Job Card essentials for completion',
  },
  {
    id: 'tech-forbid-finance',
    role: 'Technician',
    order: 4,
    title: 'Forbidden: finance',
    action: 'Try to open company finance / profit / Owner Financial Command',
    passIf: 'Denied or not navigable',
    failIf: 'Finance figures visible',
  },
  {
    id: 'tech-forbid-bank',
    role: 'Technician',
    order: 5,
    title: 'Forbidden: bank',
    action: 'Try to open bank / cash control / transactions',
    passIf: 'Denied',
    failIf: 'Bank transactions visible',
  },
  {
    id: 'tech-forbid-owner',
    role: 'Technician',
    order: 6,
    title: 'Forbidden: Owner dashboard',
    action: 'Try to open Owner dashboard / business analytics',
    passIf: 'Denied or redirected to field home',
    failIf: 'Owner command centre visible',
  },
  {
    id: 'tech-forbid-crm',
    role: 'Technician',
    order: 7,
    title: 'Forbidden: CRM list',
    action: 'Try to open full customer database / leads / sales pipeline',
    passIf: 'Denied',
    failIf: 'Full CRM list accessible',
  },
  {
    id: 'tech-forbid-settings',
    role: 'Technician',
    order: 8,
    title: 'Forbidden: settings / integrations',
    action: 'Try to open company settings / integrations',
    passIf: 'Denied',
    failIf: 'Integrations or company settings accessible',
  },
] as const;

export const YG_CUTOVER_CLIENT_ACCEPTANCE: readonly YgCutoverAcceptanceStep[] = [
  {
    id: 'client-login',
    role: 'Client',
    order: 1,
    title: 'Client portal login',
    action: 'Sign in with authorised client portal account',
    passIf: 'Customer portal home (not staff TITAN)',
    failIf: 'Staff OS navigation',
  },
  {
    id: 'client-own',
    role: 'Client',
    order: 2,
    title: 'Own records',
    action: 'Open own properties / jobs / quotes / invoices / payments / documents',
    passIf: 'Only that client’s authorised records',
    failIf: 'Internal costs, receipts, profit, or staff notes',
  },
  {
    id: 'client-deny-other',
    role: 'Client',
    order: 3,
    title: 'Deny other customer',
    action: 'Attempt to open another customer’s job/invoice by guessed URL/id if known',
    passIf: 'Denied / not found',
    failIf: 'Another customer’s data visible',
  },
] as const;

export type YgCutoverCompanyConfigItem = {
  id: string;
  label: string;
  blocksCutover: boolean;
  status: 'owner_config_required' | 'verified_in_code' | 'optional';
  detail: string;
};

export const YG_CUTOVER_COMPANY_CONFIG: readonly YgCutoverCompanyConfigItem[] = [
  {
    id: 'vat-number',
    label: 'VAT / registration number',
    blocksCutover: false,
    status: 'owner_config_required',
    detail: 'Non-P0 unless legal docs require it before issuing tax invoices in production.',
  },
  {
    id: 'operating-hours',
    label: 'Operating hours',
    blocksCutover: false,
    status: 'owner_config_required',
    detail: 'Publish in company preferences when ready.',
  },
  {
    id: 'logo',
    label: 'Company logo',
    blocksCutover: false,
    status: 'owner_config_required',
    detail: 'Upload for document branding polish — not a hard P0 if contact block present.',
  },
  {
    id: 'currency-tz',
    label: 'Currency / timezone / locale',
    blocksCutover: false,
    status: 'verified_in_code',
    detail: 'ZAR · Africa/Johannesburg · en-ZA defaults established.',
  },
] as const;

export const YG_CUTOVER_PROVIDER_READINESS = {
  xero: { status: 'PASS', note: 'LIVE-001 — Young Guns Plumbing org; no broad auto sync in this phase' },
  gmail: { status: 'PASS', note: 'LIVE-001 — manual Sync Now; automatic sync = P2' },
  cartrack: { status: 'PASS', note: 'LIVE-001 — mapped vehicles; GPS honesty required' },
  whatsappStagingTestNumber: {
    status: 'PASS',
    note: 'LIVE-001 — Meta Test Number only; not final YG number',
  },
  yocoTestMode: { status: 'PASS', note: 'LIVE-001 — test mode; live enablement = explicit Owner GO only' },
  debt: {
    realWhatsAppNumber: 'P1',
    whatsappCoexistence: 'P2 / Meta eligibility',
    whatsappHistoryImport: 'P2',
    gmailAutomaticSync: 'P2',
    yocoLivePayments: 'explicit Owner GO only',
  },
} as const;

export type YgCutoverProductionPrecheckItem = {
  id: string;
  label: string;
  detail: string;
};

/** Read-only production readiness — do not print secrets. */
export const YG_CUTOVER_PRODUCTION_PRECHECK: readonly YgCutoverProductionPrecheckItem[] = [
  {
    id: 'prod-db-identity',
    label: 'Production DB identity',
    detail: `Must NOT be staging ref ${YG_CUTOVER_STAGING_DB_REF}; refuse accidental use of known staging. Forbidden confuse-with-staging ref recorded as ${YG_CUTOVER_PRODUCTION_FORBIDDEN_DB_REF} in prior ops docs.`,
  },
  {
    id: 'migration-target',
    label: 'Migration target',
    detail: 'Production Postgres only after Owner GO; apply pending migrations once with verification queries.',
  },
  {
    id: 'backups',
    label: 'Backups',
    detail: 'Protected snapshot of DB + object storage before migration; restore tested or restore owner named.',
  },
  {
    id: 'env-vars',
    label: 'Environment variables',
    detail: 'APP_URL, API_PUBLIC_URL, NODE_ENV=production, SEED_DEV=false, provider gates default OFF until intentional.',
  },
  {
    id: 'auth',
    label: 'Auth configuration',
    detail: 'JWT secrets ≥32 chars; session cookies secure; MFA paths available where implemented.',
  },
  {
    id: 'domain',
    label: 'Domain / TLS',
    detail: 'Production web + API HTTPS domains confirmed.',
  },
  {
    id: 'callbacks',
    label: 'Callbacks / OAuth URLs',
    detail: 'Xero/Gmail/Meta/Yoco callbacks pointed at production API_PUBLIC_URL — not staging.',
  },
  {
    id: 'encryption-key',
    label: 'Encryption key',
    detail: 'INTEGRATIONS_ENCRYPTION_KEY present in secrets manager (value never printed).',
  },
  {
    id: 'provider-secrets',
    label: 'Provider secrets',
    detail: 'Stored encrypted; no secrets in git or chat logs.',
  },
  {
    id: 'workers-schedulers',
    label: 'Workers / schedulers desired state',
    detail: 'Record intentional WORKERS_ENABLED / SCHEDULERS_ENABLED / AUTOMATIONS_ENABLED before cutover.',
  },
  {
    id: 'user-invitations',
    label: 'User invitations',
    detail: 'P0: Owner + Admin/Office + Technician individual accounts provisioned and verified.',
  },
  {
    id: 'rollback-path',
    label: 'Rollback path',
    detail: 'Named restore point + criteria below; Owner on call.',
  },
] as const;

export type YgCutoverMigrationPhase =
  | 'PRECHECK'
  | 'PROTECTED_BACKUP'
  | 'MIGRATION'
  | 'VERIFICATION'
  | 'CONFIG'
  | 'USERS'
  | 'PROVIDERS'
  | 'SMOKE'
  | 'OWNER_ACCEPTANCE'
  | 'GO_OR_ROLLBACK';

export type YgCutoverMigrationStep = {
  phase: YgCutoverMigrationPhase;
  action: string;
  executeInThisPhase: false;
};

export const YG_CUTOVER_MIGRATION_PLAN: readonly YgCutoverMigrationStep[] = [
  {
    phase: 'PRECHECK',
    action: 'Confirm staging green, P0 users closed, no duplicate YG tenant, secrets/domains ready',
    executeInThisPhase: false,
  },
  {
    phase: 'PROTECTED_BACKUP',
    action: 'Take production DB + storage snapshot; record restore instructions',
    executeInThisPhase: false,
  },
  {
    phase: 'MIGRATION',
    action: 'Apply production migrations after explicit Owner GO only',
    executeInThisPhase: false,
  },
  {
    phase: 'VERIFICATION',
    action: 'Verify migration integrity / schema / critical tables',
    executeInThisPhase: false,
  },
  {
    phase: 'CONFIG',
    action: 'Confirm env, OAuth callbacks, gates, company prefs',
    executeInThisPhase: false,
  },
  {
    phase: 'USERS',
    action: 'Confirm individual Owner/Admin/Technician logins work in production',
    executeInThisPhase: false,
  },
  {
    phase: 'PROVIDERS',
    action: 'Reconnect/verify Xero/Gmail/Cartrack; keep WhatsApp real-number and Yoco live gated',
    executeInThisPhase: false,
  },
  {
    phase: 'SMOKE',
    action: 'Owner login + one job path + finance read + hub view — no customer broadcasts',
    executeInThisPhase: false,
  },
  {
    phase: 'OWNER_ACCEPTANCE',
    action: 'Execute YG_CUTOVER_OWNER_CLICKPATH on production after smoke',
    executeInThisPhase: false,
  },
  {
    phase: 'GO_OR_ROLLBACK',
    action: 'Owner signs GO or triggers rollback criteria',
    executeInThisPhase: false,
  },
] as const;

export const YG_CUTOVER_ROLLBACK_TRIGGERS = [
  'authentication failure',
  'tenant/RBAC leak',
  'finance mismatch',
  'migration integrity failure',
  'wrong Xero organisation',
  'document failure',
  'critical job workflow failure',
  'provider credential exposure',
  'significant data loss',
] as const;

export type YgCutoverDecisionCard = {
  p0Closed: 'YES' | 'NO';
  productionReady: 'YES' | 'NO';
  explicitOwnerApprovalRequired: 'YES';
  thisPromptIsNotApproval: true;
  verdict: 'READY' | 'NOT_READY' | 'BLOCKED';
  verdictLabel: string;
  blockers: readonly string[];
};

/**
 * Build Owner GO / NO-GO decision card.
 * This prompt is never interpreted as production approval.
 */
export function buildYgCutoverDecisionCard(input: {
  userAudit: YgCutoverUserAuditResult;
}): YgCutoverDecisionCard {
  const blockers: string[] = [];

  if (input.userAudit.status === 'blocked_no_credentials') {
    blockers.push(
      'Required Owner/user information unavailable — cannot verify or provision real individual Admin/Technician accounts without Owner roster + staging credentials',
    );
  }

  if (!input.userAudit.p0Closed) {
    for (const slot of input.userAudit.missingSlots) {
      blockers.push(`Missing required individual account slot: ${slot}`);
    }
  }

  if (input.userAudit.status === 'stale_evidence' && !input.userAudit.p0Closed) {
    blockers.push('Latest user evidence is stale; re-run staging user audit before Owner GO');
  }

  const p0Closed = input.userAudit.p0Closed && input.userAudit.status === 'verified' ? 'YES' : 'NO';
  const productionReady = p0Closed === 'YES' && blockers.length === 0 ? 'YES' : 'NO';

  let verdict: YgCutoverDecisionCard['verdict'] = 'NOT_READY';
  let verdictLabel = 'NOT READY — P0 cutover requirement remains';

  if (input.userAudit.status === 'blocked_no_credentials') {
    verdict = 'BLOCKED';
    verdictLabel = 'BLOCKED — required Owner/user information unavailable';
  } else if (productionReady === 'YES') {
    verdict = 'READY';
    verdictLabel = 'READY — Young Guns cutover ready for explicit Owner GO';
  }

  return {
    p0Closed,
    productionReady,
    explicitOwnerApprovalRequired: 'YES',
    thisPromptIsNotApproval: true,
    verdict,
    verdictLabel,
    blockers,
  };
}

/** Technician forbidden surfaces for cutover acceptance contracts. */
export const YG_CUTOVER_TECHNICIAN_FORBIDDEN_SURFACES = [
  'finance',
  'profit',
  'bank',
  'payroll',
  'owner_dashboard',
  'crm_list',
  'sales',
  'integrations',
  'settings',
  'reports',
  'unrelated_jobs',
] as const;

export function isYgCutoverTechnicianForbiddenSurface(surface: string): boolean {
  const key = surface.trim().toLowerCase().replace(/\s+/g, '_');
  return (YG_CUTOVER_TECHNICIAN_FORBIDDEN_SURFACES as readonly string[]).includes(key);
}
