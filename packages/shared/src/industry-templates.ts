/**
 * Industry Templates (Department 19).
 *
 * A template is configuration for the one shared TITAN core. It decides what a
 * trade calls things, which job types and checklists exist, what documents a
 * job needs and which approvals apply. It never becomes a second copy of the
 * platform and never carries business records.
 *
 * Invariants the rest of the department depends on:
 *  - A template configures existing capability. Every capability reference must
 *    name a module that already exists, so a template cannot smuggle in a new
 *    trade-specific fork of the product.
 *  - Templates hold structure and terminology only. Customer, job, quote and
 *    invoice records never live in a template, and creating one never writes
 *    records into a tenant.
 *  - A compliance requirement is only stated once a person has recorded the
 *    review. Otherwise it reads as requiring compliance review, never as a
 *    legal claim TITAN is making on the trade's behalf.
 *  - Plumbing is the live Young Guns configuration. Its template references the
 *    capabilities that already ship and never replaces or generalises them.
 *  - Anything that changes a live workflow needs Owner approval and lands as a
 *    new version. History is append-only.
 */

export const INDUSTRY_TEMPLATES_KEY = 'industry-templates' as const;
export const INDUSTRY_TEMPLATES_ROUTE = '/industry-templates' as const;

/* -------------------------------------------------------------------------- */
/* Trades                                                                      */
/* -------------------------------------------------------------------------- */

export type ItplTrade = 'plumbing' | 'electrical' | 'hvac' | 'construction' | 'other_trade';

export const ITPL_TRADES: readonly ItplTrade[] = [
  'plumbing',
  'electrical',
  'hvac',
  'construction',
  'other_trade',
] as const;

export const ITPL_TRADE_LABELS: Record<ItplTrade, string> = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  construction: 'Construction',
  other_trade: 'Another trade',
};

/**
 * How far a trade has actually been taken. Only plumbing is a live, verified
 * configuration: it is the trade this platform runs for its own business.
 * Everything else is an honest configuration shell.
 */
export type ItplSupportLevel =
  | 'supported'
  | 'requires_configuration'
  | 'requires_compliance_review'
  | 'unavailable';

export const ITPL_SUPPORT_LEVELS: readonly ItplSupportLevel[] = [
  'supported',
  'requires_configuration',
  'requires_compliance_review',
  'unavailable',
] as const;

export const ITPL_SUPPORT_LABELS: Record<ItplSupportLevel, string> = {
  supported: 'Supported and in use',
  requires_configuration: 'Requires configuration before use',
  requires_compliance_review: 'Requires compliance review before use',
  unavailable: 'Not available yet',
};

/**
 * The support level a trade starts at. Plumbing is the live configuration; the
 * others are structures and terminology that a person still has to complete.
 */
export const ITPL_TRADE_BASELINE_SUPPORT: Record<ItplTrade, ItplSupportLevel> = {
  plumbing: 'supported',
  electrical: 'requires_configuration',
  hvac: 'requires_configuration',
  construction: 'requires_configuration',
  other_trade: 'requires_configuration',
};

/** A new trade arrives as configuration, never as a separate application. */
export const ITPL_SINGLE_CORE_STATEMENT =
  'One shared TITAN core. A template configures the platform for a trade. It never creates a separate application, a separate database of business records or a trade-specific fork.';

export function itplTradeLabel(trade: ItplTrade, customLabel?: string | null): string {
  if (trade === 'other_trade') {
    const trimmed = customLabel?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : ITPL_TRADE_LABELS.other_trade;
  }
  return ITPL_TRADE_LABELS[trade];
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

/** The configurable areas a template may define. */
export type ItplSectionKey =
  | 'trade_workflows'
  | 'job_types'
  | 'service_categories'
  | 'equipment_types'
  | 'forms'
  | 'checklists'
  | 'reports'
  | 'compliance_requirements'
  | 'document_requirements'
  | 'quote_structure'
  | 'job_card_structure'
  | 'maintenance_schedules'
  | 'technician_skills'
  | 'terminology'
  | 'approval_requirements';

export const ITPL_SECTION_KEYS: readonly ItplSectionKey[] = [
  'trade_workflows',
  'job_types',
  'service_categories',
  'equipment_types',
  'forms',
  'checklists',
  'reports',
  'compliance_requirements',
  'document_requirements',
  'quote_structure',
  'job_card_structure',
  'maintenance_schedules',
  'technician_skills',
  'terminology',
  'approval_requirements',
] as const;

export const ITPL_SECTION_LABELS: Record<ItplSectionKey, string> = {
  trade_workflows: 'Trade workflows',
  job_types: 'Job types',
  service_categories: 'Service categories',
  equipment_types: 'Equipment types',
  forms: 'Forms',
  checklists: 'Checklists',
  reports: 'Reports',
  compliance_requirements: 'Compliance requirements',
  document_requirements: 'Document requirements',
  quote_structure: 'Quote structure',
  job_card_structure: 'Job card structure',
  maintenance_schedules: 'Maintenance schedules',
  technician_skills: 'Technician skills',
  terminology: 'Default terminology',
  approval_requirements: 'Approval requirements',
};

/**
 * Sections that change how work actually runs. Editing one needs Owner
 * approval before it can go live.
 */
export const ITPL_LIVE_WORKFLOW_SECTIONS: readonly ItplSectionKey[] = [
  'trade_workflows',
  'job_types',
  'compliance_requirements',
  'document_requirements',
  'quote_structure',
  'job_card_structure',
  'maintenance_schedules',
  'approval_requirements',
] as const;

export function isItplLiveWorkflowSection(section: ItplSectionKey): boolean {
  return ITPL_LIVE_WORKFLOW_SECTIONS.includes(section);
}

/**
 * Sections a technician may read so they can do the job. Everything else is
 * template architecture and stays with the Owner and administrators.
 */
export const ITPL_OPERATIONAL_SECTIONS: readonly ItplSectionKey[] = [
  'job_types',
  'service_categories',
  'equipment_types',
  'forms',
  'checklists',
  'document_requirements',
  'technician_skills',
  'terminology',
] as const;

/* -------------------------------------------------------------------------- */
/* Capability references                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Modules that already exist in TITAN. A template entry may point at one of
 * these and configure it. It may not name anything else, which is what stops a
 * template from describing a capability the platform does not have.
 */
export const ITPL_KNOWN_CAPABILITY_REFS: readonly string[] = [
  'crm',
  'properties',
  'leads',
  'jobs',
  'job_cards',
  'dispatch',
  'scheduling',
  'emergency_callouts',
  'quotes',
  'invoices',
  'finance',
  'documents',
  'photos',
  'inventory',
  'procurement',
  'fleet',
  'recurring_maintenance',
  'compliance',
  'quality',
  'communications',
  'portal',
  'reporting',
  'workforce',
] as const;

export function isItplKnownCapabilityRef(ref: string | null | undefined): boolean {
  if (ref === null || ref === undefined) return true;
  return ITPL_KNOWN_CAPABILITY_REFS.includes(ref);
}

/**
 * The plumbing capabilities Young Guns runs on today. The plumbing template
 * points at these; it does not reimplement any of them.
 */
export const ITPL_PLUMBING_CAPABILITY_REFS: readonly string[] = [
  'crm',
  'properties',
  'jobs',
  'job_cards',
  'dispatch',
  'scheduling',
  'emergency_callouts',
  'quotes',
  'invoices',
  'documents',
  'photos',
  'recurring_maintenance',
  'compliance',
] as const;

/* -------------------------------------------------------------------------- */
/* Business-record guard                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Field names that only ever appear on a real business record. A template that
 * carries one of these is trying to ship data, not configuration.
 */
const ITPL_BUSINESS_RECORD_FIELDS: readonly string[] = [
  'customerid',
  'customername',
  'clientid',
  'clientname',
  'jobid',
  'jobnumber',
  'quoteid',
  'quotenumber',
  'invoiceid',
  'invoicenumber',
  'leadid',
  'propertyid',
  'siteaddress',
  'phonenumber',
  'emailaddress',
  'idnumber',
  'vatnumber',
  'bankaccount',
  'accountnumber',
  'amountcents',
  'totalcents',
  'paymentreference',
];

function normaliseFieldName(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const ITPL_MAX_SCAN_DEPTH = 8;

/**
 * Walk a template definition looking for business-record shaped fields. Used
 * before a version is stored so a tenant's live data can never be smuggled
 * into, or seeded out of, a template.
 */
export function findItplBusinessRecordFields(value: unknown, depth = 0): string[] {
  if (depth > ITPL_MAX_SCAN_DEPTH) return [];
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => findItplBusinessRecordFields(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const found: string[] = [];
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (ITPL_BUSINESS_RECORD_FIELDS.includes(normaliseFieldName(key))) {
        found.push(key);
      }
      found.push(...findItplBusinessRecordFields(entry, depth + 1));
    }
    return found;
  }
  return [];
}

export function itplContainsBusinessRecords(value: unknown): boolean {
  return findItplBusinessRecordFields(value).length > 0;
}

/** Creating or activating a template never writes records into a tenant. */
export const ITPL_NO_TENANT_SEEDING_STATEMENT =
  'A template defines structure and terminology only. Creating, approving or activating one never writes a customer, property, job, quote or invoice into this company.';

/* -------------------------------------------------------------------------- */
/* Entries and sections                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A compliance claim is only a claim once a person has recorded the review.
 * TITAN never asserts on its own that a standard applies to a trade.
 */
export interface ItplComplianceClaim {
  reviewed: boolean;
  authority: string | null;
  reference: string | null;
  reviewedAt: string | null;
}

export const ITPL_COMPLIANCE_UNREVIEWED_NOTE =
  'Not reviewed. This is a placeholder for a requirement your compliance reviewer must confirm before it is relied on. TITAN does not assert that this standard applies.';

export interface ItplSectionEntry {
  key: string;
  label: string;
  /** An existing TITAN module this entry configures, when there is one. */
  capabilityRef: string | null;
  support: ItplSupportLevel;
  notes: string | null;
  compliance?: ItplComplianceClaim | null;
}

export interface ItplSection {
  section: ItplSectionKey;
  label: string;
  support: ItplSupportLevel;
  entries: ItplSectionEntry[];
}

export interface ItplTemplateDefinition {
  trade: ItplTrade;
  tradeLabel: string;
  sections: ItplSection[];
}

/**
 * Force an entry to be honest about itself: an unknown capability reference is
 * dropped, and an unreviewed compliance claim is downgraded and labelled.
 */
export function normaliseItplEntry(
  entry: ItplSectionEntry,
  section: ItplSectionKey,
): ItplSectionEntry {
  const capabilityRef = isItplKnownCapabilityRef(entry.capabilityRef) ? entry.capabilityRef : null;
  const unknownRefNote =
    entry.capabilityRef && !isItplKnownCapabilityRef(entry.capabilityRef)
      ? `References a capability that does not exist in TITAN (${entry.capabilityRef}). A template configures existing capability and cannot add a new one.`
      : null;

  if (section === 'compliance_requirements') {
    const claim: ItplComplianceClaim = entry.compliance ?? {
      reviewed: false,
      authority: null,
      reference: null,
      reviewedAt: null,
    };
    if (!claim.reviewed) {
      return {
        ...entry,
        capabilityRef,
        support: 'requires_compliance_review',
        notes: unknownRefNote ?? ITPL_COMPLIANCE_UNREVIEWED_NOTE,
        compliance: { ...claim, reviewed: false },
      };
    }
    return { ...entry, capabilityRef, notes: unknownRefNote ?? entry.notes, compliance: claim };
  }

  if (unknownRefNote) {
    return {
      ...entry,
      capabilityRef: null,
      support: 'requires_configuration',
      notes: unknownRefNote,
    };
  }

  return { ...entry, capabilityRef };
}

/** A section is only as strong as its weakest entry. */
export function resolveItplSectionSupport(entries: readonly ItplSectionEntry[]): ItplSupportLevel {
  if (entries.length === 0) return 'requires_configuration';
  const rank: Record<ItplSupportLevel, number> = {
    unavailable: 0,
    requires_compliance_review: 1,
    requires_configuration: 2,
    supported: 3,
  };
  let weakest: ItplSupportLevel = 'supported';
  for (const entry of entries) {
    if (rank[entry.support] < rank[weakest]) weakest = entry.support;
  }
  return weakest;
}

export function normaliseItplSection(section: ItplSection): ItplSection {
  const entries = section.entries.map((entry) => normaliseItplEntry(entry, section.section));
  // An empty compliance section means nobody has reviewed compliance for this
  // trade yet, which is a stronger caveat than "still needs configuring".
  const support =
    section.section === 'compliance_requirements' && entries.length === 0
      ? 'requires_compliance_review'
      : resolveItplSectionSupport(entries);
  return {
    section: section.section,
    label: ITPL_SECTION_LABELS[section.section] ?? section.label,
    support,
    entries,
  };
}

export function normaliseItplDefinition(
  definition: ItplTemplateDefinition,
): ItplTemplateDefinition {
  return {
    trade: definition.trade,
    tradeLabel: itplTradeLabel(definition.trade, definition.tradeLabel),
    sections: definition.sections.map(normaliseItplSection),
  };
}

/** Overall support for a template, never better than its weakest section. */
export function resolveItplTemplateSupport(
  definition: ItplTemplateDefinition,
): ItplSupportLevel {
  if (definition.sections.length === 0) return 'requires_configuration';
  return resolveItplSectionSupport(
    definition.sections.map((section) => ({
      key: section.section,
      label: section.label,
      capabilityRef: null,
      support: section.support,
      notes: null,
    })),
  );
}

/* -------------------------------------------------------------------------- */
/* Blueprints                                                                  */
/* -------------------------------------------------------------------------- */

function entry(
  key: string,
  label: string,
  capabilityRef: string | null,
  support: ItplSupportLevel,
  notes: string | null = null,
): ItplSectionEntry {
  return { key, label, capabilityRef, support, notes };
}

/**
 * The plumbing blueprint. Every entry points at a capability that already
 * ships, because this is the configuration the live business runs on. Nothing
 * here rebuilds a module and nothing here is a business record.
 */
export const ITPL_PLUMBING_BLUEPRINT: ItplTemplateDefinition = {
  trade: 'plumbing',
  tradeLabel: 'Plumbing',
  sections: [
    {
      section: 'trade_workflows',
      label: ITPL_SECTION_LABELS.trade_workflows,
      support: 'supported',
      entries: [
        entry('callout_to_invoice', 'Call-out through to invoice', 'jobs', 'supported'),
        entry('emergency_response', 'Emergency call-out response', 'emergency_callouts', 'supported'),
        entry('quote_first', 'Quote first, then schedule', 'quotes', 'supported'),
        entry('planned_maintenance', 'Planned maintenance visit', 'recurring_maintenance', 'supported'),
      ],
    },
    {
      section: 'job_types',
      label: ITPL_SECTION_LABELS.job_types,
      support: 'supported',
      entries: [
        entry('geyser', 'Geyser repair and replacement', 'jobs', 'supported'),
        entry('drains', 'Blocked drains', 'jobs', 'supported'),
        entry('leaks', 'Leak detection and repair', 'jobs', 'supported'),
        entry('burst_pipe', 'Burst pipe', 'jobs', 'supported'),
        entry('bathroom_renovation', 'Bathroom renovation', 'jobs', 'supported'),
        entry('construction_plumbing', 'Construction plumbing', 'jobs', 'supported'),
        entry('general_maintenance', 'General plumbing maintenance', 'jobs', 'supported'),
      ],
    },
    {
      section: 'service_categories',
      label: ITPL_SECTION_LABELS.service_categories,
      support: 'supported',
      entries: [
        entry('emergency', 'Emergency', 'dispatch', 'supported'),
        entry('repair', 'Repair', 'jobs', 'supported'),
        entry('installation', 'Installation', 'jobs', 'supported'),
        entry('maintenance', 'Maintenance', 'recurring_maintenance', 'supported'),
        entry('renovation', 'Renovation', 'jobs', 'supported'),
      ],
    },
    {
      section: 'equipment_types',
      label: ITPL_SECTION_LABELS.equipment_types,
      support: 'supported',
      entries: [
        entry('geyser_unit', 'Geyser', 'inventory', 'supported'),
        entry('drain_machine', 'Drain cleaning machine', 'inventory', 'supported'),
        entry('leak_detection_kit', 'Leak detection equipment', 'inventory', 'supported'),
        entry('service_vehicle', 'Service vehicle', 'fleet', 'supported'),
      ],
    },
    {
      section: 'forms',
      label: ITPL_SECTION_LABELS.forms,
      support: 'supported',
      entries: [
        entry('site_assessment', 'Site assessment', 'job_cards', 'supported'),
        entry('completion_signoff', 'Completion sign-off', 'job_cards', 'supported'),
      ],
    },
    {
      section: 'checklists',
      label: ITPL_SECTION_LABELS.checklists,
      support: 'supported',
      entries: [
        entry('pre_work_safety', 'Pre-work safety check', 'quality', 'supported'),
        entry('geyser_install', 'Geyser installation check', 'quality', 'supported'),
        entry('leave_site_clean', 'Leave-site condition check', 'quality', 'supported'),
      ],
    },
    {
      section: 'reports',
      label: ITPL_SECTION_LABELS.reports,
      support: 'supported',
      entries: [entry('job_completion_report', 'Job completion report', 'reporting', 'supported')],
    },
    {
      section: 'compliance_requirements',
      label: ITPL_SECTION_LABELS.compliance_requirements,
      support: 'supported',
      entries: [
        {
          key: 'coc_gas',
          label: 'Certificate of Compliance for gas work',
          capabilityRef: 'compliance',
          support: 'supported',
          notes:
            'Recorded in the existing Young Guns COC configuration. Classification per job is decided there, not here.',
          compliance: {
            reviewed: true,
            authority: 'Young Guns Plumbing COC configuration',
            reference: 'DEFAULT_YG_COC_SETTINGS.gasWorkRequiresCoc',
            reviewedAt: null,
          },
        },
        {
          key: 'coc_electrical',
          label: 'Certificate of Compliance for electrical work',
          capabilityRef: 'compliance',
          support: 'supported',
          notes:
            'Recorded in the existing Young Guns COC configuration. Classification per job is decided there, not here.',
          compliance: {
            reviewed: true,
            authority: 'Young Guns Plumbing COC configuration',
            reference: 'DEFAULT_YG_COC_SETTINGS.electricalWorkRequiresCoc',
            reviewedAt: null,
          },
        },
      ],
    },
    {
      section: 'document_requirements',
      label: ITPL_SECTION_LABELS.document_requirements,
      support: 'supported',
      entries: [
        entry('before_photos', 'Before photographs', 'photos', 'supported'),
        entry('after_photos', 'After photographs', 'photos', 'supported'),
        entry('signed_job_card', 'Signed job card', 'job_cards', 'supported'),
        entry('job_document_pack', 'Job document pack', 'documents', 'supported'),
      ],
    },
    {
      section: 'quote_structure',
      label: ITPL_SECTION_LABELS.quote_structure,
      support: 'supported',
      entries: [
        entry('labour_lines', 'Labour lines', 'quotes', 'supported'),
        entry('material_lines', 'Material lines', 'quotes', 'supported'),
        entry('callout_fee', 'Call-out fee', 'quotes', 'supported'),
      ],
    },
    {
      section: 'job_card_structure',
      label: ITPL_SECTION_LABELS.job_card_structure,
      support: 'supported',
      entries: [
        entry('work_performed', 'Work performed', 'job_cards', 'supported'),
        entry('materials_used', 'Materials used', 'job_cards', 'supported'),
        entry('customer_signature', 'Customer signature', 'job_cards', 'supported'),
      ],
    },
    {
      section: 'maintenance_schedules',
      label: ITPL_SECTION_LABELS.maintenance_schedules,
      support: 'supported',
      entries: [
        entry('annual_geyser_service', 'Annual geyser service', 'recurring_maintenance', 'supported'),
      ],
    },
    {
      section: 'technician_skills',
      label: ITPL_SECTION_LABELS.technician_skills,
      support: 'supported',
      entries: [
        entry('general_plumbing', 'General plumbing', 'workforce', 'supported'),
        entry('gas_work', 'Gas work', 'workforce', 'supported'),
        entry('leak_detection', 'Leak detection', 'workforce', 'supported'),
      ],
    },
    {
      section: 'terminology',
      label: ITPL_SECTION_LABELS.terminology,
      support: 'supported',
      entries: [
        entry('job', 'Job', null, 'supported'),
        entry('call_out', 'Call-out', null, 'supported'),
        entry('job_card', 'Job card', null, 'supported'),
        entry('technician', 'Plumber', null, 'supported'),
      ],
    },
    {
      section: 'approval_requirements',
      label: ITPL_SECTION_LABELS.approval_requirements,
      support: 'supported',
      entries: [
        entry('quote_approval', 'Customer approves the quote', 'quotes', 'supported'),
        entry('variation_approval', 'Owner approves a variation', 'quotes', 'supported'),
      ],
    },
  ],
};

/**
 * A starting shell for a trade that has not been configured yet. It names the
 * sections that need filling in and claims nothing about the trade.
 */
export function buildItplTradeShell(
  trade: ItplTrade,
  customLabel?: string | null,
): ItplTemplateDefinition {
  const support = ITPL_TRADE_BASELINE_SUPPORT[trade];
  return {
    trade,
    tradeLabel: itplTradeLabel(trade, customLabel),
    sections: ITPL_SECTION_KEYS.map((section) => ({
      section,
      label: ITPL_SECTION_LABELS[section],
      support:
        section === 'compliance_requirements' ? 'requires_compliance_review' : support,
      entries: [],
    })),
  };
}

/** Plumbing returns the live configuration; every other trade returns a shell. */
export function buildItplBlueprint(
  trade: ItplTrade,
  customLabel?: string | null,
): ItplTemplateDefinition {
  if (trade === 'plumbing') return normaliseItplDefinition(ITPL_PLUMBING_BLUEPRINT);
  return normaliseItplDefinition(buildItplTradeShell(trade, customLabel));
}

/* -------------------------------------------------------------------------- */
/* Versioning and approval                                                     */
/* -------------------------------------------------------------------------- */

export type ItplVersionStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

export const ITPL_VERSION_STATUSES: readonly ItplVersionStatus[] = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
] as const;

export type ItplTemplateStatus = 'draft' | 'active' | 'archived';

export const ITPL_TEMPLATE_STATUSES: readonly ItplTemplateStatus[] = [
  'draft',
  'active',
  'archived',
] as const;

/** Whether a change touches how work runs, or only how it reads. */
export type ItplChangeImpact = 'live_workflow' | 'presentation_only';

/**
 * Decide the impact of a change by comparing which sections differ. Anything
 * touching a live workflow section needs Owner approval.
 */
export function resolveItplChangeImpact(
  previous: ItplTemplateDefinition | null,
  next: ItplTemplateDefinition,
): ItplChangeImpact {
  if (!previous) return 'live_workflow';
  for (const section of ITPL_SECTION_KEYS) {
    const before = previous.sections.find((item) => item.section === section);
    const after = next.sections.find((item) => item.section === section);
    const changed = JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
    if (changed && isItplLiveWorkflowSection(section)) return 'live_workflow';
  }
  return 'presentation_only';
}

export function itplChangeRequiresApproval(impact: ItplChangeImpact): boolean {
  return impact === 'live_workflow';
}

/** A version may only go live once it has been approved. */
export function canItplVersionActivate(status: ItplVersionStatus): boolean {
  return status === 'approved';
}

export interface ItplVersionSummary {
  id: string;
  versionNumber: number;
  status: ItplVersionStatus;
  changeImpact: ItplChangeImpact;
  changeSummary: string;
  authoredByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface ItplActivationSummary {
  id: string;
  versionId: string;
  versionNumber: number;
  activatedByUserId: string | null;
  activatedAt: string;
  note: string | null;
}

export interface ItplTemplateSummary {
  id: string;
  templateKey: string;
  name: string;
  trade: ItplTrade;
  tradeLabel: string;
  status: ItplTemplateStatus;
  support: ItplSupportLevel;
  isActive: boolean;
  activeVersionNumber: number | null;
  latestVersionNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItplTemplateDetail extends ItplTemplateSummary {
  definition: ItplTemplateDefinition;
  versions: ItplVersionSummary[];
  activations: ItplActivationSummary[];
}

/* -------------------------------------------------------------------------- */
/* Access                                                                      */
/* -------------------------------------------------------------------------- */

export type ItplScope = 'owner_full' | 'admin_manage' | 'staff_read' | 'denied';

export interface ItplIdentity {
  roleName?: string | null;
  permissions?: string[] | null;
  userId?: string | null;
}

const OWNER_ROLE_NAMES = new Set(['owner', 'platform_owner', 'super_admin']);
const ADMIN_ROLE_NAMES = new Set(['admin', 'operations_manager', 'office_manager', 'manager']);

/** Clients never reach template configuration at all. */
const CLIENT_ROLE_FRAGMENTS = ['client', 'customer', 'portal'];

/** Technicians may read the operational sections but never edit architecture. */
const TECHNICIAN_ROLE_FRAGMENTS = ['technician', 'tech', 'driver', 'apprentice'];

function normaliseRole(roleName: string | null | undefined): string {
  return (roleName ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function isItplClientRole(roleName: string | null | undefined): boolean {
  const role = normaliseRole(roleName);
  if (!role) return false;
  if (OWNER_ROLE_NAMES.has(role) || ADMIN_ROLE_NAMES.has(role)) return false;
  return CLIENT_ROLE_FRAGMENTS.some((fragment) => role.includes(fragment));
}

export function isItplTechnicianRole(roleName: string | null | undefined): boolean {
  const role = normaliseRole(roleName);
  if (!role) return false;
  if (OWNER_ROLE_NAMES.has(role) || ADMIN_ROLE_NAMES.has(role)) return false;
  return TECHNICIAN_ROLE_FRAGMENTS.some((fragment) => role.includes(fragment));
}

export function resolveItplScope(identity: ItplIdentity): ItplScope {
  const role = normaliseRole(identity.roleName);
  const permissions = identity.permissions ?? [];

  // Role checks run before permissions so a wildcard cannot promote a client
  // into template administration or a technician into editing architecture.
  if (!role) return 'denied';
  if (isItplClientRole(role)) return 'denied';
  if (OWNER_ROLE_NAMES.has(role)) return 'owner_full';
  if (isItplTechnicianRole(role)) return 'staff_read';

  const canManage =
    permissions.includes('company:manage') ||
    permissions.includes('settings:write') ||
    permissions.includes('*');

  if (ADMIN_ROLE_NAMES.has(role) && canManage) return 'admin_manage';
  return identity.userId ? 'staff_read' : 'denied';
}

export function canReadItplTemplates(identity: ItplIdentity): boolean {
  return resolveItplScope(identity) !== 'denied';
}

/** Drafting and editing template architecture. */
export function canEditItplTemplates(identity: ItplIdentity): boolean {
  const scope = resolveItplScope(identity);
  return scope === 'owner_full' || scope === 'admin_manage';
}

/** Approving a live-workflow change and choosing the active template. */
export function canActivateItplTemplate(identity: ItplIdentity): boolean {
  return resolveItplScope(identity) === 'owner_full';
}

/** Platform-level trade controls stay with the platform owner. */
export function canManageItplPlatformControls(identity: ItplIdentity): boolean {
  return normaliseRole(identity.roleName) === 'platform_owner';
}

export function itplVisibleSections(scope: ItplScope): readonly ItplSectionKey[] {
  if (scope === 'denied') return [];
  if (scope === 'staff_read') return ITPL_OPERATIONAL_SECTIONS;
  return ITPL_SECTION_KEYS;
}

/** Trim a definition down to the sections a scope may see. */
export function filterItplDefinitionForScope(
  definition: ItplTemplateDefinition,
  scope: ItplScope,
): ItplTemplateDefinition {
  const allowed = new Set(itplVisibleSections(scope));
  return {
    ...definition,
    sections: definition.sections.filter((section) => allowed.has(section.section)),
  };
}

export interface ItplWithheldNotice {
  section: ItplSectionKey;
  label: string;
  reason: string;
}

export function buildItplWithheldNotices(scope: ItplScope): ItplWithheldNotice[] {
  const allowed = new Set(itplVisibleSections(scope));
  return ITPL_SECTION_KEYS.filter((section) => !allowed.has(section)).map((section) => ({
    section,
    label: ITPL_SECTION_LABELS[section],
    reason:
      scope === 'staff_read'
        ? 'Template architecture is managed by the Owner and administrators.'
        : 'You do not have access to industry templates.',
  }));
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export interface ItplSettings {
  /** Fixed true. A live-workflow change always needs Owner approval. */
  requireApprovalForLiveChanges: true;
  /** Fixed false. TITAN never asserts a compliance standard on its own. */
  allowUnreviewedComplianceClaims: false;
  /** Fixed false. Templates never write records into a tenant. */
  seedTenantRecords: false;
  /** Owner may let technicians read the operational sections. */
  technicianReadEnabled: boolean;
  notes: string | null;
}

export const ITPL_DEFAULT_SETTINGS: ItplSettings = {
  requireApprovalForLiveChanges: true,
  allowUnreviewedComplianceClaims: false,
  seedTenantRecords: false,
  technicianReadEnabled: true,
  notes: null,
};

export function normaliseItplSettings(input: Partial<ItplSettings> | null | undefined): ItplSettings {
  const source = input ?? {};
  return {
    // The three invariants are re-asserted rather than read, so a stored row
    // that was tampered with cannot switch them.
    requireApprovalForLiveChanges: true,
    allowUnreviewedComplianceClaims: false,
    seedTenantRecords: false,
    technicianReadEnabled: source.technicianReadEnabled ?? ITPL_DEFAULT_SETTINGS.technicianReadEnabled,
    notes: source.notes ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Catalog and dashboard                                                       */
/* -------------------------------------------------------------------------- */

export interface ItplCatalogEntry {
  trade: ItplTrade;
  label: string;
  support: ItplSupportLevel;
  supportLabel: string;
  /** What a person still has to do before this trade can be relied on. */
  guidance: string;
}

export function buildItplCatalog(): ItplCatalogEntry[] {
  return ITPL_TRADES.map((trade) => {
    const support = ITPL_TRADE_BASELINE_SUPPORT[trade];
    return {
      trade,
      label: ITPL_TRADE_LABELS[trade],
      support,
      supportLabel: ITPL_SUPPORT_LABELS[support],
      guidance:
        trade === 'plumbing'
          ? 'This is the live configuration this platform runs on. It points at capabilities that already exist.'
          : 'Structure and terminology only. Job types, checklists and documents need configuring, and every compliance requirement needs a reviewer before it is relied on.',
    };
  });
}

export interface ItplDashboard {
  scope: ItplScope;
  settings: ItplSettings;
  catalog: ItplCatalogEntry[];
  templates: ItplTemplateSummary[];
  activeTemplate: ItplTemplateDetail | null;
  pendingApprovalCount: number;
  withheld: ItplWithheldNotice[];
  singleCoreStatement: string;
  noSeedingStatement: string;
  generatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Requests                                                                    */
/* -------------------------------------------------------------------------- */

export interface CreateItplTemplateRequest {
  trade: ItplTrade;
  name: string;
  customTradeLabel?: string | null;
  /** Start from the blueprint for the trade, or from an empty shell. */
  useBlueprint?: boolean;
}

export interface SaveItplVersionRequest {
  definition: ItplTemplateDefinition;
  changeSummary: string;
}

export interface DecideItplVersionRequest {
  decision: 'approved' | 'rejected';
  note?: string | null;
}

export interface ActivateItplTemplateRequest {
  versionId: string;
  note?: string | null;
}

export interface UpdateItplSettingsRequest {
  technicianReadEnabled?: boolean;
  notes?: string | null;
}
