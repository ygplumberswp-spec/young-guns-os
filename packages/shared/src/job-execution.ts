/** UX-B technician mobile job execution contracts. */

export type JobExecutionPhase =
  | 'assigned'
  | 'accepted'
  | 'en_route'
  | 'on_site'
  | 'in_progress'
  | 'paused'
  | 'awaiting_customer'
  | 'awaiting_parts'
  | 'awaiting_approval'
  | 'work_continues'
  | 'ready_to_complete'
  | 'completed';

export type JobCrewRole =
  | 'crew_leader'
  | 'driver'
  | 'qualified'
  | 'semi_skilled'
  | 'assistant';

export type JobMaterialSource =
  | 'vehicle_stock'
  | 'warehouse_stock'
  | 'supplier_purchase'
  | 'customer_supplied';

export type JobMaterialLineStatus =
  | 'requested'
  | 'approved'
  | 'used'
  | 'partially_fulfilled'
  | 'returned'
  | 'wasted'
  | 'rejected'
  | 'cancelled';

export type JobVariationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type JobWorkflowAction =
  | 'accept'
  | 'en_route'
  | 'arrive'
  | 'start_work'
  | 'pause'
  | 'resume'
  | 'await_customer'
  | 'await_parts'
  | 'await_approval'
  | 'still_busy'
  | 'ready_to_complete'
  | 'complete'
  | 'reopen';

/** Allowed phase transitions for technician/office workflow. */
export const JOB_EXECUTION_TRANSITIONS: Record<JobWorkflowAction, readonly JobExecutionPhase[]> = {
  accept: ['assigned'],
  en_route: ['accepted', 'assigned', 'paused', 'work_continues'],
  arrive: ['en_route', 'accepted', 'work_continues'],
  start_work: [
    'on_site',
    'en_route',
    'accepted',
    'paused',
    'awaiting_customer',
    'awaiting_parts',
    'work_continues',
  ],
  pause: ['in_progress'],
  resume: ['paused'],
  await_customer: ['in_progress', 'on_site', 'paused', 'work_continues'],
  await_parts: ['in_progress', 'on_site', 'paused', 'work_continues'],
  await_approval: ['in_progress', 'ready_to_complete'],
  /** End current visit; keep canonical job open — never Ready for Invoicing. */
  still_busy: ['in_progress', 'on_site', 'paused', 'ready_to_complete', 'awaiting_approval'],
  ready_to_complete: [
    'in_progress',
    'awaiting_approval',
    'awaiting_customer',
    'awaiting_parts',
    'work_continues',
  ],
  /** Final COMPLETE only — not available from work_continues without ready_to_complete. */
  complete: ['ready_to_complete', 'in_progress', 'awaiting_approval'],
  reopen: ['completed'],
};

export function phaseToJobStatus(phase: JobExecutionPhase): 'scheduled' | 'in_progress' | 'completed' {
  if (phase === 'completed') return 'completed';
  if (
    phase === 'in_progress' ||
    phase === 'paused' ||
    phase === 'awaiting_customer' ||
    phase === 'awaiting_parts' ||
    phase === 'awaiting_approval' ||
    phase === 'work_continues' ||
    phase === 'ready_to_complete' ||
    phase === 'on_site'
  ) {
    return 'in_progress';
  }
  return 'scheduled';
}

export type JobCrewMemberSummary = {
  id: string;
  userId: string;
  userName: string;
  crewRole: JobCrewRole;
  isPrimary: boolean;
  assignedAt: string;
};

export type JobVehicleAssignmentSummary = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  licensePlate: string;
  assignedAt: string;
};

export type JobVariationSummary = {
  id: string;
  status: JobVariationStatus;
  title: string;
  siteCondition: string;
  explanation: string;
  labourEffect: string | null;
  materialEffect: string | null;
  proposedScope: string | null;
  createdByUserId: string;
  createdAt: string;
  authorizedAt: string | null;
};

export type JobMaterialLineSummary = {
  id: string;
  jobId: string;
  /** Present only on cross-job listings (e.g. the office pending-requests queue). */
  jobNumber?: string | null;
  description: string;
  quantity: string;
  unit: string;
  materialSource: JobMaterialSource;
  status: JobMaterialLineStatus;
  inventoryItemId: string | null;
  inventoryItemName: string | null;
  locationId: string | null;
  locationName: string | null;
  unitCostCents: number | null;
  lineTotalCents: number | null;
  fulfilledQuantity: string | null;
  quotedQuantity: string | null;
  clientActionId: string | null;
  approvedByUserId: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  returnReason: string | null;
  supplierReference: string | null;
  notes: string | null;
  recordedByUserId: string;
  recordedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobExecutionException =
  | 'late_arrival'
  | 'excessive_duration'
  | 'missing_evidence'
  | 'awaiting_parts'
  | 'callback_risk'
  | 'incomplete_compliance'
  | 'pending_variation';

export type JobCompletionGateResult = {
  canComplete: boolean;
  missing: string[];
  checklist: Record<string, boolean>;
};

export type JobCompletionSnapshotSummary = {
  id: string;
  jobId: string;
  completedByUserId: string;
  createdAt: string;
  snapshot: Record<string, unknown>;
};

export type AssignJobCrewRequest = {
  members: Array<{
    userId: string;
    crewRole: JobCrewRole;
    isPrimary?: boolean;
  }>;
  vehicleId?: string | null;
  /** Keep jobs.assignedUserId aligned with primary / crew leader. */
  primaryUserId?: string | null;
};

export type JobWorkflowTransitionRequest = {
  action: JobWorkflowAction;
  reason?: string | null;
  clientActionId?: string | null;
};

export type CreateJobVariationRequest = {
  title: string;
  siteCondition: string;
  explanation: string;
  labourEffect?: string | null;
  materialEffect?: string | null;
  proposedScope?: string | null;
  photoDocIds?: string[];
};

export type AuthorizeJobVariationRequest = {
  status: 'approved' | 'rejected';
  notes?: string | null;
};

export type RecordJobMaterialLineRequest = {
  description: string;
  quantity: number;
  unit?: string;
  materialSource: JobMaterialSource;
  inventoryItemId?: string | null;
  locationId?: string | null;
  quotedQuantity?: number | null;
  supplierReference?: string | null;
  notes?: string | null;
  /** When true (default for technicians), record as `requested` with no stock effect. */
  requestOnly?: boolean;
  clientActionId?: string | null;
};

export type AuthorizeJobMaterialLineRequest = {
  decision: 'approve' | 'reject' | 'partial';
  fulfilledQuantity?: number;
  reason?: string | null;
  clientActionId: string;
  /** Office may attach stock identity when the tech request omitted it. */
  inventoryItemId?: string | null;
  locationId?: string | null;
};

export type ReturnJobMaterialLineRequest = {
  quantity: number;
  reason: string;
  clientActionId: string;
};

export type SubmitGatedJobCompletionRequest = {
  workPerformedSummary: string;
  checklist: Record<string, boolean>;
  measurements?: string | null;
  diagnosis?: string | null;
  recommendation?: string | null;
  siteCondition?: string | null;
  outstandingDefects?: string | null;
  followUpRequired?: boolean;
  customerRepName: string;
  signatureDocId?: string | null;
  signatureUnavailableReason?: string | null;
  cocRequired: 'required' | 'not_required' | 'pending_classification';
  technicianDeclaration: boolean;
  safetyNotes?: string | null;
  customerVisibleUpdate?: string | null;
  clientActionId?: string | null;
};

export type ReopenJobRequest = {
  reason: string;
};

/** Office-facing evidence row (binary retrieval via jobs evidence content route). */
export type JobEvidenceOfficeSummary = {
  id: string;
  documentationType: string;
  title: string;
  evidencePhase: string | null;
  hasBinary: boolean;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  downloadPath: string | null;
};

/** Office-facing rollup of the crew, vehicle and readiness state for a job. */
export type JobExecutionSummary = {
  jobId: string;
  executionPhase: JobExecutionPhase;
  status: string;
  crew: JobCrewMemberSummary[];
  vehicle: JobVehicleAssignmentSummary | null;
  pendingVariations: JobVariationSummary[];
  completionGate: JobCompletionGateResult;
  /** Immutable completion snapshot when the job was completed via gated complete. */
  completionSnapshot: JobCompletionSnapshotSummary | null;
  labour: {
    entryCount: number;
    totalMinutes: number;
  };
  evidence: JobEvidenceOfficeSummary[];
};

/** Operational timeline event for Job 360 Activity tab. */
export type JobTimelineEventSummary = {
  id: string;
  action: string;
  fromPhase: JobExecutionPhase | null;
  toPhase: JobExecutionPhase | null;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  userId: string;
  userName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

/** Default checklist keys by broad job-type family. */
export function requiredChecklistForJobType(jobType: string | null | undefined): string[] {
  const t = (jobType ?? '').toLowerCase();
  const base = ['ppe_confirmed', 'site_safe_to_work', 'customer_briefed'];
  if (t.includes('gas') || t.includes('gyser') || t.includes('geyser') || t.includes('hot water')) {
    return [...base, 'gas_isolation_checked', 'leak_test_completed'];
  }
  if (t.includes('electrical') || t.includes('db ') || t.includes('coc')) {
    return [...base, 'isolation_confirmed', 'coc_assessment_recorded'];
  }
  return [...base, 'work_area_cleaned'];
}

export function evaluateCompletionGate(input: {
  jobType: string | null | undefined;
  workPerformedSummary: string | null | undefined;
  checklist: Record<string, boolean>;
  hasBeforePhoto: boolean;
  hasAfterPhoto: boolean;
  hasLabour: boolean;
  hasMaterialsOrExplicitNone: boolean;
  siteCondition: string | null | undefined;
  customerRepName: string | null | undefined;
  hasSignature: boolean;
  signatureUnavailableReason: string | null | undefined;
  cocRequired: string | null | undefined;
  technicianDeclaration: boolean;
  pendingVariationCount: number;
}): JobCompletionGateResult {
  const missing: string[] = [];
  const required = requiredChecklistForJobType(input.jobType);
  const checklist: Record<string, boolean> = { ...input.checklist };

  if (!input.workPerformedSummary?.trim()) missing.push('work_performed_summary');
  for (const key of required) {
    if (!checklist[key]) missing.push(`checklist:${key}`);
  }
  if (!input.hasBeforePhoto) missing.push('before_photo');
  if (!input.hasAfterPhoto) missing.push('after_photo');
  if (!input.hasLabour) missing.push('labour');
  if (!input.hasMaterialsOrExplicitNone) missing.push('materials');
  if (!input.siteCondition?.trim()) missing.push('site_condition');
  if (!input.customerRepName?.trim()) missing.push('customer_rep_name');
  if (!input.hasSignature && !input.signatureUnavailableReason?.trim()) {
    missing.push('signature_or_reason');
  }
  if (!input.cocRequired || input.cocRequired === 'pending_classification') {
    missing.push('coc_classification');
  }
  if (!input.technicianDeclaration) missing.push('technician_declaration');
  if (input.pendingVariationCount > 0) missing.push('pending_variations');

  return { canComplete: missing.length === 0, missing, checklist };
}
