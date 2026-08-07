/**
 * YG-LIVE-001 — Young Guns Live Implementation contracts.
 * Configuration, acceptance, cutover planning, and WhatsApp coexistence feasibility.
 * No production mutation. No real WhatsApp number migration.
 */

import { YOUNG_GUNS_REFERENCE_COMPANY_ID } from './finance-tenant-pricebook.js';
import { YOUNG_GUNS_BANK_DETAILS, YOUNG_GUNS_CONTACT } from './document-engine.js';
import {
  CAPE_TOWN_DEFAULT_LOCALE,
  CAPE_TOWN_DEFAULT_TIMEZONE,
  DEFAULT_YG_SERVICE_GEOGRAPHY,
} from './young-guns-ops.js';

export const YG_LIVE_STAGING_COMPANY_ID = YOUNG_GUNS_REFERENCE_COMPANY_ID;
export const YG_LIVE_STAGING_API = 'https://young-guns-os-staging.up.railway.app';
export const YG_LIVE_STAGING_WEB = 'https://comfortable-determination-staging.up.railway.app';
export const YG_LIVE_STAGING_DB_REF = 'cpkuwtaipjxeipvbssvn';
export const YG_LIVE_PRODUCTION_FORBIDDEN_DB_REF = 'rshuiaghmtrvvilhqpwm';
export const YG_LIVE_XERO_TENANT_ID = '20176b90-a093-4da1-a04e-8ae616f89fef';

export const YG_LIVE_TENANT_IDENTITY = {
  companyId: YG_LIVE_STAGING_COMPANY_ID,
  tradingName: YOUNG_GUNS_CONTACT.tradingName,
  tagline: YOUNG_GUNS_CONTACT.tagline,
  phone: YOUNG_GUNS_CONTACT.phone,
  email: YOUNG_GUNS_CONTACT.email,
  website: YOUNG_GUNS_CONTACT.website,
  location: YOUNG_GUNS_CONTACT.location,
  currency: 'ZAR',
  locale: CAPE_TOWN_DEFAULT_LOCALE,
  timezone: CAPE_TOWN_DEFAULT_TIMEZONE,
  vatRateDefaultBps: 1500,
  bank: YOUNG_GUNS_BANK_DETAILS,
  serviceGeography: DEFAULT_YG_SERVICE_GEOGRAPHY,
  /** Logo must be Owner-uploaded — not hardcoded. */
  logoStatus: 'owner_upload_required' as const,
  /** Multi-branch not modelled — single Cape Town operation. */
  branchModel: 'single_operation' as const,
} as const;

export type YgLiveConfigItemStatus =
  | 'verified_in_code'
  | 'verified_in_staging_evidence'
  | 'owner_config_required'
  | 'debt';

export type YgLiveTenantConfigItem = {
  id: string;
  label: string;
  status: YgLiveConfigItemStatus;
  detail: string;
};

/** Tenant configuration checklist — do not create a duplicate Young Guns company. */
export const YG_LIVE_TENANT_CONFIG_CHECKLIST: readonly YgLiveTenantConfigItem[] = [
  {
    id: 'canonical-company',
    label: 'Canonical Young Guns Plumbing company',
    status: 'verified_in_staging_evidence',
    detail: `Preserve company ${YG_LIVE_STAGING_COMPANY_ID}; never create a duplicate tenant.`,
  },
  {
    id: 'trading-name',
    label: 'Trading name',
    status: 'verified_in_code',
    detail: YOUNG_GUNS_CONTACT.tradingName,
  },
  {
    id: 'contact',
    label: 'Contact phone / email / website',
    status: 'verified_in_code',
    detail: `${YOUNG_GUNS_CONTACT.phone} · ${YOUNG_GUNS_CONTACT.email} · ${YOUNG_GUNS_CONTACT.website}`,
  },
  {
    id: 'currency-locale-tz',
    label: 'Currency / locale / timezone',
    status: 'verified_in_code',
    detail: 'ZAR · en-ZA · Africa/Johannesburg',
  },
  {
    id: 'vat-rate',
    label: 'VAT rate default',
    status: 'verified_in_code',
    detail: '15% (1500 bps) document-engine default',
  },
  {
    id: 'vat-number',
    label: 'Company VAT / registration number in preferences',
    status: 'owner_config_required',
    detail: 'Owner must confirm and store VAT/registration in company preferences.',
  },
  {
    id: 'operating-hours',
    label: 'Business hours',
    status: 'owner_config_required',
    detail: 'preferences.operatingHours is free-text — Owner must set published hours.',
  },
  {
    id: 'service-area',
    label: 'Service geography',
    status: 'verified_in_code',
    detail: 'Cape Town / Western Cape suburb defaults in young-guns-ops.',
  },
  {
    id: 'logo',
    label: 'Brand logo',
    status: 'owner_config_required',
    detail: 'Upload Young Guns logo into company media (logoFileId).',
  },
  {
    id: 'document-branding',
    label: 'Quote/invoice/report branding tokens',
    status: 'verified_in_code',
    detail: 'Young Guns theme + document engine contact/bank blocks.',
  },
  {
    id: 'xero-org',
    label: 'Xero organisation mapping',
    status: 'verified_in_staging_evidence',
    detail: `Young Guns Plumbing · tenant ${YG_LIVE_XERO_TENANT_ID} (LIVE-001 PASS).`,
  },
] as const;

export type YgLiveRole = 'Owner' | 'Admin' | 'Technician' | 'Client';

export type YgLiveAcceptanceStep = {
  id: string;
  role: YgLiveRole;
  title: string;
  clickPath: string;
  expect: string;
  mustNot: string;
};

/** Owner-executable acceptance pack — one action at a time, no developer commands. */
export const YG_LIVE_OWNER_ACCEPTANCE_CHECKLIST: readonly YgLiveAcceptanceStep[] = [
  {
    id: 'owner-dashboard',
    role: 'Owner',
    title: 'Open Owner dashboard',
    clickPath: 'Login as Owner → Home / Dashboard',
    expect: 'AURA near top; jobs/cash/alerts visible from real modules',
    mustNot: 'Fake finance figures or empty demo tenant',
  },
  {
    id: 'owner-aura',
    role: 'Owner',
    title: 'Ask AURA what needs attention',
    clickPath: 'Dashboard AURA or /aura → ask “What needs my attention today?”',
    expect: 'Concise answer from authorised YG sources; incompleteness stated honestly',
    mustNot: 'Invented invoices, jobs, or profit',
  },
  {
    id: 'owner-finance',
    role: 'Owner',
    title: 'Finance drill-down',
    clickPath: 'Owner Financial Command / Cash / Profit Analytics',
    expect: 'Known cash/profit from CASH/JPE/FIN; incomplete ≠ zero',
    mustNot: 'Technician-visible finance',
  },
  {
    id: 'owner-jobs-today',
    role: 'Owner',
    title: 'Jobs today / dispatch',
    clickPath: 'Dispatch / Schedule',
    expect: 'Today’s jobs and assignment status',
    mustNot: 'Duplicate job truth outside Jobs/Dispatch',
  },
  {
    id: 'owner-comms',
    role: 'Owner',
    title: 'Communications Hub',
    clickPath: 'Communications Hub',
    expect: 'Gmail + WhatsApp channels distinct; unread/context where present',
    mustNot: 'Sending customer messages during acceptance',
  },
  {
    id: 'owner-fleet',
    role: 'Owner',
    title: 'Fleet freshness',
    clickPath: 'Fleet',
    expect: 'Mapped vehicles; GPS live/last-synced/stale/unavailable honest',
    mustNot: 'Invented vehicle positions',
  },
  {
    id: 'owner-integrations',
    role: 'Owner',
    title: 'Integrations status',
    clickPath: 'Integrations',
    expect: 'Xero/Gmail/Cartrack/Yoco/WhatsApp Test Number status visible',
    mustNot: 'Broad Xero sync or real WhatsApp number migration',
  },
  {
    id: 'owner-approvals',
    role: 'Owner',
    title: 'Approvals queue',
    clickPath: 'Approvals / drafts awaiting decision',
    expect: 'Draft → Approve → Execute still required for consequential actions',
    mustNot: 'Silent autonomous sends or finance writes',
  },
  {
    id: 'admin-enquiry',
    role: 'Admin',
    title: 'Office enquiry → booking',
    clickPath: 'Login as Admin → CRM customer → property → booking/job → schedule',
    expect: 'Admin can run office workflow without Owner login',
    mustNot: 'Owner-only security/settings leakage unless explicitly permitted',
  },
  {
    id: 'admin-quote-invoice',
    role: 'Admin',
    title: 'Quote / invoice where authorised',
    clickPath: 'Finance documents for a real customer',
    expect: 'Young Guns branding/contact; totals/VAT visible',
    mustNot: 'Fake catalogue rows or silent Xero push',
  },
  {
    id: 'tech-mobile-login',
    role: 'Technician',
    title: 'Technician mobile login',
    clickPath: 'Mobile login as Technician',
    expect: 'Today’s assigned jobs / schedule first',
    mustNot: 'Owner dashboard, finance, CRM list, payroll, banking',
  },
  {
    id: 'tech-job-card',
    role: 'Technician',
    title: 'Complete Job Card path',
    clickPath: 'Open assigned job → Job Card → time/materials/photos/checklist/signature',
    expect: 'Field-work tools only for assigned visit',
    mustNot: 'Other technicians’ private jobs or company profit',
  },
  {
    id: 'client-portal',
    role: 'Client',
    title: 'Client portal own records',
    clickPath: 'Client portal login → jobs/quotes/invoices/documents',
    expect: 'Only that client’s authorised records',
    mustNot: 'Other clients, internal costs, staff notes, profit',
  },
] as const;

export type YgLiveWhatsappCoexistenceResult =
  | 'SUPPORTED'
  | 'NOT_SUPPORTED'
  | 'REQUIRES_META_ELIGIBILITY_CHECK'
  | 'BLOCKED_BY_PROVIDER';

/**
 * Meta supports WhatsApp Business App + Cloud API coexistence via Embedded Signup
 * (`featureType: whatsapp_business_app_onboarding`) for eligible numbers (app ≥ 2.24.17,
 * Tech Provider/Solution Partner, coexistence webhooks, SA commonly supported).
 *
 * TITAN today proves Meta Cloud API **Test Number** only and does **not** yet implement
 * Embedded Signup coexistence onboarding. Personal WhatsApp (consumer app) is a different
 * path and cannot use Business App coexistence without converting to WhatsApp Business App.
 *
 * Therefore Young Guns real-number onboarding is: REQUIRES_META_ELIGIBILITY_CHECK.
 */
export const YG_LIVE_WHATSAPP_COEXISTENCE = {
  result: 'REQUIRES_META_ELIGIBILITY_CHECK' as YgLiveWhatsappCoexistenceResult,
  metaOfficialSupport: true,
  metaFeatureType: 'whatsapp_business_app_onboarding',
  metaDocs:
    'https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users/',
  requiredWebhooks: ['history', 'smb_app_state_sync', 'smb_message_echoes'] as const,
  titanEmbeddedSignupCoexistenceImplemented: false,
  stagingConnectionKind: 'meta_cloud_api_test_number',
  isFinalYoungGunsBusinessNumber: false,
  hardStops: [
    'Do not deregister the live phone number',
    'Do not migrate via standard Cloud API SMS registration that removes Business App access',
    'Do not delete phone chats',
    'Do not disconnect working Test Number integration until coexistence path is proven',
    'Do not bulk-import personal/private history into CRM',
  ] as const,
  ownerPrerequisites: [
    'Confirm real number is on WhatsApp Business App (not only personal WhatsApp) v2.24.17+',
    'Confirm Meta Business verification / Tech Provider eligibility for TITAN app',
    'Owner GO for Embedded Signup coexistence build + staging dry-run before live number',
    'Decide whether to share up to ~6 months Business App chat history during onboarding',
    'Keep Business App installed; open at least every ~13 days after coexistence',
  ] as const,
  historyMigration: {
    providerSupportedWhenCoexistenceOnboarded: true,
    windowHint: 'Most recent ~6 months individual chats (Meta coexistence sync)',
    titanImporterImplemented: false,
    dedupeRequired: true,
    personalBulkImportForbidden: true,
  },
  personalNumberPath: {
    numberHintLocal: '066 234 6301',
    dualUse: true,
    coexistenceApplies: false,
    reason: 'Coexistence is for WhatsApp Business App accounts, not personal WhatsApp.',
    design: 'Use existing personal_whatsapp connection + explicit include/exclude + never auto-import private threads.',
  },
} as const;

/** Privacy-safe personal-number business capture design (existing architecture). */
export const YG_LIVE_PERSONAL_NUMBER_CAPTURE_DESIGN = {
  inboundPath: [
    'personal-number message',
    'authorised business conversation gate',
    'TITAN Communications Hub (personal_whatsapp path)',
    'Lead/Customer match when phone evidence unique',
    'Job/customer context when linked',
    'AURA summarise/draft',
    'DRAFT → APPROVE → EXECUTE reply',
  ] as const,
  includeSignals: [
    'explicitly_business_contact',
    'known_customer_phone_match',
    'lead_phone_match',
    'business_label_or_category',
    'owner_manual_include',
  ] as const,
  excludeSignals: [
    'private_personal_classification',
    'family_friend_keywords',
    'owner_manual_exclude',
    'exclude_from_titan',
    'insufficient_signal_default_private',
  ] as const,
  forbidden: [
    'auto-copy every chat into CRM',
    'unsafe inference of private threads as business',
    'unofficial WhatsApp scraping or session hijack',
    'bulk historical personal import',
  ] as const,
  ambiguityPolicy: 'review_required_never_guess',
} as const;

export type YgLiveCutoverPhase =
  | 'PRECHECK'
  | 'BACKUP'
  | 'PRODUCTION_MIGRATION'
  | 'CONFIG'
  | 'USERS'
  | 'PROVIDERS'
  | 'SMOKE_TEST'
  | 'OWNER_ACCEPTANCE'
  | 'ROLLBACK_CRITERIA';

export type YgLiveCutoverStep = {
  phase: YgLiveCutoverPhase;
  action: string;
  executeInThisPhase: false;
};

/** Prepare only — YG-LIVE-001 must not execute production cutover. */
export const YG_LIVE_CUTOVER_PLAN: readonly YgLiveCutoverStep[] = [
  {
    phase: 'PRECHECK',
    action:
      'Confirm staging green; migrations applied; no duplicate YG tenant; production DB ref refuse guards active',
    executeInThisPhase: false,
  },
  {
    phase: 'BACKUP',
    action: 'Snapshot production Postgres + object storage; record restore point',
    executeInThisPhase: false,
  },
  {
    phase: 'PRODUCTION_MIGRATION',
    action: 'Apply pending migrations to production after Owner GO only',
    executeInThisPhase: false,
  },
  {
    phase: 'CONFIG',
    action:
      'Set APP_URL/API_PUBLIC_URL/secrets/OAuth callbacks; currency ZAR; VAT; logo; operating hours; workers/schedulers flags',
    executeInThisPhase: false,
  },
  {
    phase: 'USERS',
    action:
      'Invite individual Owner/Admin/Technician/Client logins — no shared staff accounts; verify role matrix',
    executeInThisPhase: false,
  },
  {
    phase: 'PROVIDERS',
    action:
      'Reconnect Xero/Gmail/Cartrack; keep Yoco test until payment GO; WhatsApp real number only via approved coexistence path',
    executeInThisPhase: false,
  },
  {
    phase: 'SMOKE_TEST',
    action: 'Login + Owner dashboard + one job path + finance read + hub inbox — no customer broadcasts',
    executeInThisPhase: false,
  },
  {
    phase: 'OWNER_ACCEPTANCE',
    action: 'Execute YG_LIVE_OWNER_ACCEPTANCE_CHECKLIST end-to-end',
    executeInThisPhase: false,
  },
  {
    phase: 'ROLLBACK_CRITERIA',
    action:
      'Rollback if WhatsApp phone access at risk, wrong Xero org, role leak, finance mismatch, or production ambiguity',
    executeInThisPhase: false,
  },
] as const;

export const YG_LIVE_PRODUCTION_PREREQUISITES = [
  'Owner explicit GO for production mutation',
  'Migration state parity staging→production',
  'Environment variables from TITAN_PRODUCTION_ENVIRONMENT_VARIABLES.md',
  'Domains / TLS for web + API',
  'Secrets: JWT, encryption keys, provider credentials in secrets manager',
  'Provider OAuth callback URLs pointed at production',
  'Webhook endpoints enabled only when WEBHOOKS_ENABLED intentional',
  'Individual user invites for Owner/Admin/Technician (+ Client as needed)',
  'PAYMENT_PROCESSING_ENABLED remains false until Yoco live GO',
  'OUTBOUND_MESSAGES_ENABLED / WHATSAPP_ENABLED gated until coexistence proven',
  'Schedulers/workers enablement decision recorded',
  'WhatsApp real-number coexistence eligibility + Embedded Signup path ready',
  'Backups + rollback owner on call',
] as const;

export const YG_LIVE_WORKFLOW_CHAIN = [
  'Lead',
  'Customer',
  'Property',
  'Booking',
  'Job',
  'Dispatch',
  'Technician Job Card',
  'Work performed',
  'Time/materials/photos/receipts',
  'Completion',
  'Quote/Invoice as applicable',
  'Payment',
  'JPE',
  'CASH',
  'FIN',
  'Owner Dashboard',
] as const;

export function countYgLiveAcceptanceSteps(role?: YgLiveRole): number {
  if (!role) return YG_LIVE_OWNER_ACCEPTANCE_CHECKLIST.length;
  return YG_LIVE_OWNER_ACCEPTANCE_CHECKLIST.filter((s) => s.role === role).length;
}

export function isYgLiveHardStop(signal: string): boolean {
  const patterns = [
    /los(e|ing).*whatsapp.*phone/i,
    /delet(e|ing).*historical.*chat/i,
    /tenant duplication|duplicate.*young guns/i,
    /cross-role leak|role leak/i,
    /finance mismatch/i,
    /wrong xero/i,
    /incorrect customer ownership/i,
    /unsafe payment/i,
    /production ambiguity/i,
  ];
  return patterns.some((p) => p.test(signal));
}
