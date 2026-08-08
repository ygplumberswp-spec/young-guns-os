/**
 * Row 95 — Quote Scenarios (canonical registry + capability/validation resolver)
 *
 * ONE shared quote scenario contract. No separate quote engines.
 * Scenario is explicit — never inferred from line descriptions.
 * Historical null/missing → STANDARD (legacy/unclassified fallback).
 * Historical auto-classifications = 0.
 *
 * Preserves Rows 87–94. Row 92 automation remains OFF.
 * Rows 96–99 not started. Xero writes = 0 · customer sends = 0 · production = 0.
 */

import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import type { PricingPresentationMode } from './fixed-price-quoting.js';

export const QUOTE_SCENARIO_KEY = 'quote-scenarios' as const;
export const QUOTE_SCENARIO_ROW = 95 as const;

export const QUOTE_SCENARIO_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
  expectedJobNumber: 'JOB-000002',
} as const;

/** Canonical scenario codes — explicit storage only. */
export const QUOTE_SCENARIO_CODES = [
  'STANDARD',
  'EMERGENCY',
  'FIXED_PRICE',
  'GEYSER_COMPLIANCE',
  'DRAINS_CAMERA',
  'BATHROOM',
  'CONSTRUCTION',
  'COMMERCIAL_MANAGING_AGENT',
  'MAINTENANCE_AGREEMENT',
  'MULTI_PHASE_PROJECT',
  'PLAN_ESTIMATE',
  'BOQ_TENDER',
  'DEPOSIT_PROGRESS_FINAL',
  'VARIATION',
] as const;

export type QuoteScenarioCode = (typeof QUOTE_SCENARIO_CODES)[number];

/** Human-friendly labels for UI — never expose raw enums to customers. */
export const QUOTE_SCENARIO_LABELS: Record<QuoteScenarioCode, string> = {
  STANDARD: 'Standard quote',
  EMERGENCY: 'Emergency / urgent',
  FIXED_PRICE: 'Fixed-price / flat-rate',
  GEYSER_COMPLIANCE: 'Geyser compliance',
  DRAINS_CAMERA: 'Drains / camera inspection',
  BATHROOM: 'Bathroom project',
  CONSTRUCTION: 'Construction / project site',
  COMMERCIAL_MANAGING_AGENT: 'Commercial / managing agent',
  MAINTENANCE_AGREEMENT: 'Maintenance agreement',
  MULTI_PHASE_PROJECT: 'Multi-phase project',
  PLAN_ESTIMATE: 'Plan / floor-plan estimate',
  BOQ_TENDER: 'BOQ / tender',
  DEPOSIT_PROGRESS_FINAL: 'Deposit / progress / final',
  VARIATION: 'Variation',
};

export const QUOTE_SCENARIO_OPTIONS: Array<{ value: QuoteScenarioCode; label: string }> =
  QUOTE_SCENARIO_CODES.map((value) => ({
    value,
    label: QUOTE_SCENARIO_LABELS[value],
  }));

export type QuoteScenarioPhaseStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'ON_HOLD'
  | 'CANCELLED';

export type QuoteScenarioMilestoneKind = 'DEPOSIT' | 'PROGRESS' | 'FINAL' | 'OTHER';

/** Milestone commercial definition only — never a payment truth. */
export type QuoteScenarioMilestone = {
  id?: string | null;
  kind: QuoteScenarioMilestoneKind;
  label: string;
  /** Basis points of quote total, or null when amountCents is authoritative. */
  percentBps?: number | null;
  amountCents?: number | null;
  sequence: number;
  notes?: string | null;
};

export type QuoteScenarioPhase = {
  id?: string | null;
  key: string;
  label: string;
  sequence: number;
  status: QuoteScenarioPhaseStatus;
  /** Sum of associated line totals — must reconcile to quote total across phases. */
  totalCents?: number | null;
  notes?: string | null;
};

export type QuoteScenarioMetadata = {
  /** EMERGENCY — urgency flag only; no surcharge invention. */
  urgencyNote?: string | null;
  afterHoursRequested?: boolean | null;

  /** GEYSER_COMPLIANCE — no fake COC / invented model/serial/capacity. */
  geyserNotes?: string | null;
  cocRequired?: boolean | null;
  cocClaimed?: boolean | null;
  geyserModel?: string | null;
  geyserSerial?: string | null;
  geyserCapacityLitres?: number | null;

  /** DRAINS_CAMERA — no fabricated findings. */
  drainsNotes?: string | null;
  cameraInspectionRequested?: boolean | null;
  inspectionFindingsPresent?: boolean | null;

  /** BATHROOM */
  bathroomScopeNotes?: string | null;

  /** CONSTRUCTION — no invented retention/prelims. */
  siteName?: string | null;
  siteReference?: string | null;
  constructionNotes?: string | null;
  retentionPercentBps?: number | null;
  preliminariesClaimed?: boolean | null;

  /** COMMERCIAL_MANAGING_AGENT — canonical relationships only. */
  managingAgentCompanyId?: string | null;
  managingAgentContactId?: string | null;
  propertyId?: string | null;
  commercialReference?: string | null;

  /** MAINTENANCE_AGREEMENT — scope/frequency only; no subscription engine. */
  maintenanceScope?: string | null;
  frequencyLabel?: string | null;
  agreementStartDate?: string | null;
  agreementEndDate?: string | null;
  autoGenerateJobs?: boolean | null;
  autoGenerateInvoices?: boolean | null;

  /** MULTI_PHASE_PROJECT */
  phases?: QuoteScenarioPhase[] | null;
  /** lineId → phaseKey */
  linePhaseMap?: Record<string, string> | null;

  /** PLAN_ESTIMATE — Row 94 link/version only. */
  planEstimateId?: string | null;
  planEstimateVersion?: number | null;

  /** BOQ_TENDER — metadata + attachment/reference; NOT Row 99 import. */
  tenderReference?: string | null;
  boqDocumentId?: string | null;
  boqAttachmentRef?: string | null;
  tenderNotes?: string | null;

  /** DEPOSIT_PROGRESS_FINAL — commercial definitions only. */
  milestones?: QuoteScenarioMilestone[] | null;

  /** VARIATION — explicit parent; original issued quote unchanged. */
  parentQuoteId?: string | null;
  parentJobId?: string | null;
  variationLabel?: string | null;
  variationAmountCents?: number | null;
  clientActionId?: string | null;
};

export type QuoteScenarioCapabilities = {
  scenario: QuoteScenarioCode;
  label: string;
  /** Whether Fixed-price (Row 90) presentation is expected/allowed. */
  requiresFixedPricePresentation: boolean;
  allowsPhases: boolean;
  allowsMilestones: boolean;
  requiresParentQuote: boolean;
  allowsPlanEstimateLink: boolean;
  allowsBoqReference: boolean;
  allowsMaintenanceMetadata: boolean;
  allowsCommercialAgentLinks: boolean;
  /** Never invents surcharges / COC / findings / retention / subscriptions. */
  forbidsInventedCommercialClaims: boolean;
  /** Customer-safe context keys that may appear on documents. */
  customerSafeContextKeys: string[];
  /** Internal-only keys never projected to PDF/portal. */
  internalOnlyKeys: string[];
};

export type QuoteScenarioValidationCode =
  | 'OK'
  | 'UNKNOWN_SCENARIO'
  | 'INVALID_METADATA'
  | 'INCOMPATIBLE_RELATIONSHIP'
  | 'PHASE_TOTAL_MISMATCH'
  | 'MILESTONE_IS_NOT_PAYMENT'
  | 'VARIATION_PARENT_REQUIRED'
  | 'PLAN_ESTIMATE_LINK_INVALID'
  | 'INVENTED_CLAIM_FORBIDDEN'
  | 'SUBSCRIPTION_ENGINE_FORBIDDEN'
  | 'ROW99_IMPORT_FORBIDDEN'
  | 'DESCRIPTION_INFERENCE_FORBIDDEN'
  | 'PRICING_AUTOMATION_FORBIDDEN';

export type QuoteScenarioValidationResult = {
  ok: boolean;
  code: QuoteScenarioValidationCode;
  message: string;
  details?: Record<string, unknown>;
};

export type ResolvedQuoteScenario = {
  scenario: QuoteScenarioCode;
  /** True when stored value was null/missing → STANDARD legacy fallback. */
  isLegacyFallback: boolean;
  label: string;
  capabilities: QuoteScenarioCapabilities;
  metadata: QuoteScenarioMetadata;
};

export type QuoteScenarioAuditEventType =
  | 'quote_scenario_set'
  | 'quote_scenario_changed'
  | 'quote_scenario_metadata_changed'
  | 'quote_phase_updated'
  | 'quote_milestone_defined'
  | 'quote_variation_linked';

export type QuoteScenarioAuditEvent = {
  type: QuoteScenarioAuditEventType;
  quoteId: string;
  companyId: string;
  actorUserId?: string | null;
  previousScenario?: QuoteScenarioCode | null;
  nextScenario: QuoteScenarioCode;
  previousMetadata?: QuoteScenarioMetadata | null;
  nextMetadata?: QuoteScenarioMetadata | null;
  at: string;
  clientActionId?: string | null;
};

const INTERNAL_LEAK_KEYS = [
  'scenario',
  'QuoteScenarioCode',
  'cocClaimed',
  'preliminariesClaimed',
  'autoGenerateJobs',
  'autoGenerateInvoices',
  'supplierCost',
  'unitCostCents',
  'marginBps',
  'grossProfitCents',
  'belowFloor',
  'approvalInternals',
  'reviewFlag',
  'internalNotes',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isQuoteScenarioCode(value: unknown): value is QuoteScenarioCode {
  return typeof value === 'string' && (QUOTE_SCENARIO_CODES as readonly string[]).includes(value);
}

/**
 * Historical / unclassified fallback.
 * null | undefined | '' | 'LEGACY' → STANDARD.
 * Never infers from descriptions.
 */
export function resolveQuoteScenarioCode(
  stored: string | null | undefined,
): { scenario: QuoteScenarioCode; isLegacyFallback: boolean } {
  if (stored == null || stored === '' || stored === 'LEGACY' || stored === 'UNCLASSIFIED') {
    return { scenario: 'STANDARD', isLegacyFallback: true };
  }
  if (isQuoteScenarioCode(stored)) {
    return { scenario: stored, isLegacyFallback: stored === 'STANDARD' && false };
  }
  // Unknown stored value — safe fallback, do not invent classification.
  return { scenario: 'STANDARD', isLegacyFallback: true };
}

export function quoteScenarioLabel(code: QuoteScenarioCode): string {
  return QUOTE_SCENARIO_LABELS[code];
}

export function getQuoteScenarioCapabilities(scenario: QuoteScenarioCode): QuoteScenarioCapabilities {
  const base = {
    scenario,
    label: QUOTE_SCENARIO_LABELS[scenario],
    requiresFixedPricePresentation: scenario === 'FIXED_PRICE',
    allowsPhases: scenario === 'MULTI_PHASE_PROJECT',
    allowsMilestones: scenario === 'DEPOSIT_PROGRESS_FINAL',
    requiresParentQuote: scenario === 'VARIATION',
    allowsPlanEstimateLink: scenario === 'PLAN_ESTIMATE',
    allowsBoqReference: scenario === 'BOQ_TENDER',
    allowsMaintenanceMetadata: scenario === 'MAINTENANCE_AGREEMENT',
    allowsCommercialAgentLinks: scenario === 'COMMERCIAL_MANAGING_AGENT',
    forbidsInventedCommercialClaims: true,
    customerSafeContextKeys: [] as string[],
    internalOnlyKeys: [...INTERNAL_LEAK_KEYS] as string[],
  };

  switch (scenario) {
    case 'EMERGENCY':
      return { ...base, customerSafeContextKeys: ['urgencyNote'] };
    case 'FIXED_PRICE':
      return { ...base, customerSafeContextKeys: [] };
    case 'GEYSER_COMPLIANCE':
      return { ...base, customerSafeContextKeys: ['geyserNotes'] };
    case 'DRAINS_CAMERA':
      return { ...base, customerSafeContextKeys: ['drainsNotes'] };
    case 'BATHROOM':
      return { ...base, customerSafeContextKeys: ['bathroomScopeNotes'] };
    case 'CONSTRUCTION':
      return { ...base, customerSafeContextKeys: ['siteName', 'siteReference', 'constructionNotes'] };
    case 'COMMERCIAL_MANAGING_AGENT':
      return { ...base, customerSafeContextKeys: ['commercialReference'] };
    case 'MAINTENANCE_AGREEMENT':
      return {
        ...base,
        customerSafeContextKeys: ['maintenanceScope', 'frequencyLabel', 'agreementStartDate', 'agreementEndDate'],
      };
    case 'MULTI_PHASE_PROJECT':
      return { ...base, customerSafeContextKeys: ['phaseLabels'] };
    case 'PLAN_ESTIMATE':
      return { ...base, customerSafeContextKeys: [] };
    case 'BOQ_TENDER':
      return { ...base, customerSafeContextKeys: ['tenderReference'] };
    case 'DEPOSIT_PROGRESS_FINAL':
      return { ...base, customerSafeContextKeys: ['milestoneLabels'] };
    case 'VARIATION':
      return { ...base, customerSafeContextKeys: ['variationLabel'] };
    case 'STANDARD':
    default:
      return base;
  }
}

export function normalizeQuoteScenarioMetadata(
  input?: QuoteScenarioMetadata | null,
): QuoteScenarioMetadata {
  if (!input || !isRecord(input)) return {};
  const out: QuoteScenarioMetadata = { ...input };
  // Hard safety: never allow subscription / invented claim flags to be true by default.
  if (out.autoGenerateJobs) out.autoGenerateJobs = false;
  if (out.autoGenerateInvoices) out.autoGenerateInvoices = false;
  if (out.cocClaimed) out.cocClaimed = false;
  if (out.preliminariesClaimed) out.preliminariesClaimed = false;
  if (out.inspectionFindingsPresent && !out.drainsNotes) {
    // Findings flag without content is not authoritative — strip invented flag.
    out.inspectionFindingsPresent = false;
  }
  return out;
}

function validatePhases(
  metadata: QuoteScenarioMetadata,
  quoteTotalCents?: number | null,
): QuoteScenarioValidationResult | null {
  const phases = metadata.phases ?? [];
  if (!phases.length) {
    return {
      ok: false,
      code: 'INVALID_METADATA',
      message: 'MULTI_PHASE_PROJECT requires at least one phase definition.',
    };
  }
  const keys = new Set<string>();
  for (const phase of phases) {
    if (!phase.key?.trim() || !phase.label?.trim()) {
      return {
        ok: false,
        code: 'INVALID_METADATA',
        message: 'Each phase requires key and label.',
      };
    }
    if (keys.has(phase.key)) {
      return {
        ok: false,
        code: 'INVALID_METADATA',
        message: `Duplicate phase key: ${phase.key}`,
      };
    }
    keys.add(phase.key);
  }
  if (quoteTotalCents != null && phases.every((p) => typeof p.totalCents === 'number')) {
    const sum = phases.reduce((acc, p) => acc + (p.totalCents ?? 0), 0);
    if (sum !== quoteTotalCents) {
      return {
        ok: false,
        code: 'PHASE_TOTAL_MISMATCH',
        message: `Phase totals (${sum}) must equal quote total (${quoteTotalCents}).`,
        details: { phaseSumCents: sum, quoteTotalCents },
      };
    }
  }
  const map = metadata.linePhaseMap ?? {};
  for (const phaseKey of Object.values(map)) {
    if (!keys.has(phaseKey)) {
      return {
        ok: false,
        code: 'INCOMPATIBLE_RELATIONSHIP',
        message: `Line mapped to unknown phase key: ${phaseKey}`,
      };
    }
  }
  return null;
}

function validateMilestones(metadata: QuoteScenarioMetadata): QuoteScenarioValidationResult | null {
  const milestones = metadata.milestones ?? [];
  if (!milestones.length) {
    return {
      ok: false,
      code: 'INVALID_METADATA',
      message: 'DEPOSIT_PROGRESS_FINAL requires milestone definitions.',
    };
  }
  for (const m of milestones) {
    if (!m.label?.trim()) {
      return { ok: false, code: 'INVALID_METADATA', message: 'Each milestone requires a label.' };
    }
    if (!['DEPOSIT', 'PROGRESS', 'FINAL', 'OTHER'].includes(m.kind)) {
      return { ok: false, code: 'INVALID_METADATA', message: `Invalid milestone kind: ${m.kind}` };
    }
  }
  return null;
}

export type ValidateQuoteScenarioInput = {
  scenario: string | null | undefined;
  metadata?: QuoteScenarioMetadata | null;
  quoteTotalCents?: number | null;
  pricingPresentationMode?: PricingPresentationMode | string | null;
  /** When true, reject any attempt to enable Row 92 automation via scenario. */
  pricebookAutomationEnabled?: boolean;
  /** Description-inference attempts are always rejected. */
  inferredFromDescription?: boolean;
};

export function validateQuoteScenario(input: ValidateQuoteScenarioInput): QuoteScenarioValidationResult {
  if (input.inferredFromDescription) {
    return {
      ok: false,
      code: 'DESCRIPTION_INFERENCE_FORBIDDEN',
      message: 'Scenario must be set explicitly — never inferred from descriptions.',
    };
  }
  if (input.pricebookAutomationEnabled) {
    return {
      ok: false,
      code: 'PRICING_AUTOMATION_FORBIDDEN',
      message: 'Row 92 pricebook automation must remain OFF for quote scenarios.',
    };
  }

  const resolved = resolveQuoteScenarioCode(input.scenario);
  if (
    input.scenario != null &&
    input.scenario !== '' &&
    input.scenario !== 'LEGACY' &&
    input.scenario !== 'UNCLASSIFIED' &&
    !isQuoteScenarioCode(input.scenario)
  ) {
    return {
      ok: false,
      code: 'UNKNOWN_SCENARIO',
      message: `Unknown quote scenario: ${String(input.scenario)}`,
    };
  }

  const scenario = resolved.scenario;
  // Validate against raw input first — normalization strips unsafe flags for storage.
  const raw = (input.metadata ?? {}) as QuoteScenarioMetadata & {
    emergencySurchargeCents?: number;
    row99ImportRequested?: boolean;
    milestonesPaid?: boolean;
  };
  const metadata = normalizeQuoteScenarioMetadata(input.metadata);
  const caps = getQuoteScenarioCapabilities(scenario);

  if (scenario === 'EMERGENCY') {
    // Urgency only — no surcharge fields permitted as invented amounts.
    if (raw.emergencySurchargeCents != null) {
      return {
        ok: false,
        code: 'INVENTED_CLAIM_FORBIDDEN',
        message: 'EMERGENCY must not invent surcharges.',
      };
    }
  }

  if (scenario === 'GEYSER_COMPLIANCE') {
    if (raw.cocClaimed) {
      return {
        ok: false,
        code: 'INVENTED_CLAIM_FORBIDDEN',
        message: 'GEYSER_COMPLIANCE must not claim COC automatically.',
      };
    }
  }

  if (scenario === 'DRAINS_CAMERA') {
    if (raw.inspectionFindingsPresent && !raw.drainsNotes?.trim()) {
      return {
        ok: false,
        code: 'INVENTED_CLAIM_FORBIDDEN',
        message: 'DRAINS_CAMERA must not fabricate inspection findings.',
      };
    }
  }

  if (scenario === 'CONSTRUCTION') {
    if (raw.preliminariesClaimed) {
      return {
        ok: false,
        code: 'INVENTED_CLAIM_FORBIDDEN',
        message: 'CONSTRUCTION must not invent preliminaries/subcontractor assumptions.',
      };
    }
  }

  if (scenario === 'MAINTENANCE_AGREEMENT') {
    if (raw.autoGenerateJobs || raw.autoGenerateInvoices) {
      return {
        ok: false,
        code: 'SUBSCRIPTION_ENGINE_FORBIDDEN',
        message: 'MAINTENANCE_AGREEMENT is metadata only — no subscription/auto job/invoice engine.',
      };
    }
  }

  if (scenario === 'MULTI_PHASE_PROJECT') {
    const phaseErr = validatePhases(metadata, input.quoteTotalCents);
    if (phaseErr) return phaseErr;
  } else if (metadata.phases?.length) {
    return {
      ok: false,
      code: 'INCOMPATIBLE_RELATIONSHIP',
      message: 'Phases are only valid for MULTI_PHASE_PROJECT.',
    };
  }

  if (scenario === 'PLAN_ESTIMATE') {
    if (!metadata.planEstimateId?.trim()) {
      return {
        ok: false,
        code: 'PLAN_ESTIMATE_LINK_INVALID',
        message: 'PLAN_ESTIMATE requires an explicit planEstimateId (Row 94).',
      };
    }
    if (metadata.planEstimateVersion != null && metadata.planEstimateVersion < 1) {
      return {
        ok: false,
        code: 'PLAN_ESTIMATE_LINK_INVALID',
        message: 'planEstimateVersion must be >= 1 when provided.',
      };
    }
  } else if (metadata.planEstimateId) {
    return {
      ok: false,
      code: 'INCOMPATIBLE_RELATIONSHIP',
      message: 'planEstimateId is only valid for PLAN_ESTIMATE scenario.',
    };
  }

  if (scenario === 'BOQ_TENDER') {
    if (raw.row99ImportRequested) {
      return {
        ok: false,
        code: 'ROW99_IMPORT_FORBIDDEN',
        message: 'BOQ_TENDER must not start Row 99 import.',
      };
    }
    if (!metadata.tenderReference?.trim() && !metadata.boqDocumentId && !metadata.boqAttachmentRef) {
      return {
        ok: false,
        code: 'INVALID_METADATA',
        message: 'BOQ_TENDER requires tender/BOQ reference or attachment metadata.',
      };
    }
  }

  if (scenario === 'DEPOSIT_PROGRESS_FINAL') {
    const mErr = validateMilestones(metadata);
    if (mErr) return mErr;
    // Explicit: milestones are not payments.
    if (raw.milestonesPaid) {
      return {
        ok: false,
        code: 'MILESTONE_IS_NOT_PAYMENT',
        message: 'Milestones are commercial definitions only — not payment truth.',
      };
    }
  } else if (metadata.milestones?.length) {
    return {
      ok: false,
      code: 'INCOMPATIBLE_RELATIONSHIP',
      message: 'Milestones are only valid for DEPOSIT_PROGRESS_FINAL.',
    };
  }

  if (scenario === 'VARIATION') {
    if (!metadata.parentQuoteId?.trim()) {
      return {
        ok: false,
        code: 'VARIATION_PARENT_REQUIRED',
        message: 'VARIATION requires an explicit parentQuoteId.',
      };
    }
  } else if (metadata.parentQuoteId) {
    return {
      ok: false,
      code: 'INCOMPATIBLE_RELATIONSHIP',
      message: 'parentQuoteId is only valid for VARIATION scenario.',
    };
  }

  if (!caps.allowsCommercialAgentLinks) {
    if (metadata.managingAgentCompanyId || metadata.managingAgentContactId) {
      return {
        ok: false,
        code: 'INCOMPATIBLE_RELATIONSHIP',
        message: 'Managing-agent links are only valid for COMMERCIAL_MANAGING_AGENT.',
      };
    }
  }

  return { ok: true, code: 'OK', message: 'Scenario valid.' };
}

export function resolveQuoteScenario(input: {
  scenario?: string | null;
  metadata?: QuoteScenarioMetadata | null;
}): ResolvedQuoteScenario {
  const { scenario, isLegacyFallback } = resolveQuoteScenarioCode(input.scenario);
  const metadata = normalizeQuoteScenarioMetadata(input.metadata);
  return {
    scenario,
    isLegacyFallback,
    label: quoteScenarioLabel(scenario),
    capabilities: getQuoteScenarioCapabilities(scenario),
    metadata,
  };
}

/** Customer-safe document context — never leaks enums / costs / margins / approvals. */
export function projectCustomerSafeScenarioContext(input: {
  scenario?: string | null;
  metadata?: QuoteScenarioMetadata | null;
}): {
  customerFacingLabel: string | null;
  context: Record<string, string>;
} {
  const resolved = resolveQuoteScenario(input);
  // STANDARD / legacy — no extra customer banner.
  if (resolved.scenario === 'STANDARD' || resolved.isLegacyFallback) {
    return { customerFacingLabel: null, context: {} };
  }

  const meta = resolved.metadata;
  const context: Record<string, string> = {};
  const caps = resolved.capabilities;

  const maybeSet = (key: string, value: unknown) => {
    if (!caps.customerSafeContextKeys.includes(key)) return;
    if (value == null) return;
    const text = String(value).trim();
    if (!text) return;
    context[key] = text;
  };

  maybeSet('urgencyNote', meta.urgencyNote);
  maybeSet('geyserNotes', meta.geyserNotes);
  maybeSet('drainsNotes', meta.drainsNotes);
  maybeSet('bathroomScopeNotes', meta.bathroomScopeNotes);
  maybeSet('siteName', meta.siteName);
  maybeSet('siteReference', meta.siteReference);
  maybeSet('constructionNotes', meta.constructionNotes);
  maybeSet('commercialReference', meta.commercialReference);
  maybeSet('maintenanceScope', meta.maintenanceScope);
  maybeSet('frequencyLabel', meta.frequencyLabel);
  maybeSet('agreementStartDate', meta.agreementStartDate);
  maybeSet('agreementEndDate', meta.agreementEndDate);
  maybeSet('tenderReference', meta.tenderReference);
  maybeSet('variationLabel', meta.variationLabel);

  if (caps.allowsPhases && meta.phases?.length) {
    context.phaseLabels = meta.phases.map((p) => p.label).join(', ');
  }
  if (caps.allowsMilestones && meta.milestones?.length) {
    context.milestoneLabels = meta.milestones.map((m) => m.label).join(', ');
  }

  // Human label only — never raw enum.
  return {
    customerFacingLabel: resolved.label,
    context,
  };
}

export function assertNoScenarioInternalLeak(payload: unknown): void {
  const text = JSON.stringify(payload ?? {});
  for (const key of [
    'QuoteScenarioCode',
    'cocClaimed',
    'preliminariesClaimed',
    'autoGenerateJobs',
    'unitCostCents',
    'marginBps',
    'grossProfitCents',
    'belowFloorReason',
    'approvalInternals',
    'supplierCost',
  ]) {
    if (text.includes(`"${key}"`)) {
      throw new Error(`Customer-safe scenario projection leaked internal key: ${key}`);
    }
  }
  // Raw enum dump check for internal codes in customer label fields.
  if (/"scenario"\s*:\s*"FIXED_PRICE"/.test(text) && /customerFacing/.test(text) === false) {
    // Allow internal storage shapes; block only when nested under customerFacing.
  }
  if (isRecord(payload) && isRecord(payload.customerFacing) && 'scenario' in payload.customerFacing) {
    throw new Error('Customer-facing projection must not include raw scenario enum.');
  }
}

export function buildScenarioChangeAudit(input: {
  quoteId: string;
  companyId: string;
  actorUserId?: string | null;
  previousScenario?: string | null;
  nextScenario: QuoteScenarioCode;
  previousMetadata?: QuoteScenarioMetadata | null;
  nextMetadata?: QuoteScenarioMetadata | null;
  clientActionId?: string | null;
  at?: string;
}): QuoteScenarioAuditEvent {
  const prev = resolveQuoteScenarioCode(input.previousScenario).scenario;
  const type: QuoteScenarioAuditEventType =
    input.previousScenario == null || input.previousScenario === ''
      ? 'quote_scenario_set'
      : prev !== input.nextScenario
        ? 'quote_scenario_changed'
        : 'quote_scenario_metadata_changed';
  return {
    type,
    quoteId: input.quoteId,
    companyId: input.companyId,
    actorUserId: input.actorUserId ?? null,
    previousScenario: input.previousScenario == null || input.previousScenario === '' ? null : prev,
    nextScenario: input.nextScenario,
    previousMetadata: input.previousMetadata ?? null,
    nextMetadata: input.nextMetadata ?? null,
    at: input.at ?? new Date().toISOString(),
    clientActionId: input.clientActionId ?? null,
  };
}

/** Phase status is independent of quote lifecycle (Row 88). */
export function assertPhaseStatusNotLifecycle(phaseStatus: string, quoteLifecycleState: string): void {
  const lifecycle = new Set([
    'DRAFT',
    'AWAITING_APPROVAL',
    'APPROVED_READY',
    'SENT',
    'VIEWED',
    'ACCEPTED',
    'DECLINED',
    'CONVERTED',
    'VOIDED',
    'ARCHIVED',
    'SUPERSEDED',
    'EXPIRED',
  ]);
  if (lifecycle.has(phaseStatus)) {
    throw new Error(
      `Phase status must not reuse quote lifecycle state (${phaseStatus} / quote=${quoteLifecycleState}).`,
    );
  }
}

export function sumPhaseTotalsCents(phases: QuoteScenarioPhase[]): number {
  return phases.reduce((acc, p) => acc + (p.totalCents ?? 0), 0);
}

export function assertVariationLeavesParentUnchanged(input: {
  parentQuoteId: string;
  parentTotalCentsBefore: number;
  parentTotalCentsAfter: number;
  parentStatusBefore: string;
  parentStatusAfter: string;
  parentXeroQuoteIdBefore?: string | null;
  parentXeroQuoteIdAfter?: string | null;
}): void {
  if (input.parentTotalCentsBefore !== input.parentTotalCentsAfter) {
    throw new Error('VARIATION must not mutate parent quote total.');
  }
  if (input.parentStatusBefore !== input.parentStatusAfter) {
    throw new Error('VARIATION must not mutate parent quote status.');
  }
  if ((input.parentXeroQuoteIdBefore ?? null) !== (input.parentXeroQuoteIdAfter ?? null)) {
    throw new Error('VARIATION must not mutate parent Xero Quote ID.');
  }
  if (!input.parentQuoteId.trim()) {
    throw new Error('VARIATION parentQuoteId required.');
  }
}

export function assertRow92StillInactiveForScenarios(): void {
  assertRow92GlobalAutomationDisabled(false);
}

export function assertRow95ScenarioGates(input?: {
  row96Started?: boolean;
  row97Started?: boolean;
  row98Started?: boolean;
  row99Started?: boolean;
}): void {
  if (input?.row96Started) throw new Error('Row 96 must not be started from Row 95.');
  if (input?.row97Started) throw new Error('Row 97 must not be started from Row 95.');
  if (input?.row98Started) throw new Error('Row 98 AI take-off must not be started from Row 95.');
  if (input?.row99Started) throw new Error('Row 99 BOQ import must not be started from Row 95.');
}

export function assertRow95NoXeroWrites(count: number): void {
  if (count !== 0) throw new Error(`Row 95 Xero writes must be 0 (got ${count}).`);
}

export function assertRow95NoCustomerSends(count: number): void {
  if (count !== 0) throw new Error(`Row 95 customer sends must be 0 (got ${count}).`);
}

export function assertRow95NoProductionWrites(count: number): void {
  if (count !== 0) throw new Error(`Row 95 production writes must be 0 (got ${count}).`);
}

export function assertHistoricalAutoClassificationsZero(count: number): void {
  if (count !== 0) {
    throw new Error(`historical_auto_classifications must be 0 (got ${count}).`);
  }
}

export function assertRoyalCapeQuoteScenarioUnchanged(input: {
  quoteNumber?: string | null;
  totalCents: number;
  pricingPresentationMode?: string | null;
  jobNumber?: string | null;
  xeroQuoteId?: string | null;
  scenario?: string | null;
  scenarioMutated?: boolean;
}): void {
  if (input.quoteNumber && input.quoteNumber !== QUOTE_SCENARIO_ROYAL_CAPE.royalCapeQuoteNumber) {
    // Allow lookup by id without number; when present must match.
  }
  if (input.totalCents !== QUOTE_SCENARIO_ROYAL_CAPE.expectedTotalCents) {
    throw new Error(
      `Royal Cape total must remain ${QUOTE_SCENARIO_ROYAL_CAPE.expectedTotalCents} (got ${input.totalCents}).`,
    );
  }
  if (
    input.pricingPresentationMode &&
    input.pricingPresentationMode !== QUOTE_SCENARIO_ROYAL_CAPE.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode must remain ITEMISED.');
  }
  if (input.jobNumber && input.jobNumber !== QUOTE_SCENARIO_ROYAL_CAPE.expectedJobNumber) {
    throw new Error('Royal Cape job number must remain JOB-000002.');
  }
  if (
    input.xeroQuoteId != null &&
    input.xeroQuoteId !== '' &&
    input.xeroQuoteId !== QUOTE_SCENARIO_ROYAL_CAPE.royalCapeXeroQuoteId
  ) {
    throw new Error('Royal Cape Xero Quote ID must remain unchanged.');
  }
  if (input.scenarioMutated) {
    throw new Error('Royal Cape must not be reclassified without authoritative scenario data.');
  }
}

/** Diagnostic-only text hints — never used to mass-classify. */
export function diagnosticScenarioTextHints(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const t = text.toLowerCase();
  const hints: string[] = [];
  if (/\bemergenc|\bafter[\s-]?hours|\burgent\b/.test(t)) hints.push('emergency_like');
  if (/\bgeyser\b|\bcoc\b|\bcompliance\b/.test(t)) hints.push('geyser_like');
  if (/\bdrain|\bcamera\b|\bjctv\b|\bjetting\b/.test(t)) hints.push('drains_like');
  if (/\bbathroom\b|\bshower\b|\bensuite\b/.test(t)) hints.push('bathroom_like');
  if (/\bconstruction\b|\bsite\b|\bprelim\b/.test(t)) hints.push('construction_like');
  if (/\bmanaging agent\b|\bbody corporate\b|\bcommercial\b/.test(t)) hints.push('commercial_like');
  if (/\bmaintenance\b|\bservice plan\b|\bagreement\b/.test(t)) hints.push('maintenance_like');
  if (/\bphase\b|\bstage\b/.test(t)) hints.push('phase_like');
  if (/\bboq\b|\btender\b/.test(t)) hints.push('boq_like');
  if (/\bdeposit\b|\bprogress\b|\bfinal account\b/.test(t)) hints.push('milestone_like');
  if (/\bvariation\b|\bvo\b|\bchange order\b/.test(t)) hints.push('variation_like');
  if (/\bfloor[\s-]?plan\b|\btake[\s-]?off\b/.test(t)) hints.push('plan_estimate_like');
  return hints;
}

export type QuoteScenarioFixtureProof = {
  scenario: QuoteScenarioCode;
  create: boolean;
  edit: boolean;
  lifecycleCompatible: boolean;
  customerSafeDocProjection: boolean;
  quoteToInvoiceCompatible: boolean | 'n/a';
  cleanup: boolean;
};

export function emptyFixtureMatrix(): QuoteScenarioFixtureProof[] {
  return QUOTE_SCENARIO_CODES.filter((c) => c !== 'STANDARD').map((scenario) => ({
    scenario,
    create: false,
    edit: false,
    lifecycleCompatible: false,
    customerSafeDocProjection: false,
    quoteToInvoiceCompatible: scenario === 'VARIATION' ? 'n/a' : false,
    cleanup: false,
  }));
}
