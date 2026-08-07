/**
 * Canonical finance document narrative content stored in titan_documents.content.
 * One source of truth — not duplicated in arbitrary notes fields.
 */

export const COC_EVIDENCE_ROLE = 'coc_certificate' as const;
export const COC_COMPLIANCE_TYPE = 'coc' as const;

export type FinanceDocumentWarrantyContent = {
  text: string;
  months?: number | null;
};

export type FinanceDocumentMaintenanceItem = {
  label?: string;
  description?: string;
};

export type FinanceDocumentMaintenanceContent = {
  text?: string | null;
  items?: FinanceDocumentMaintenanceItem[];
};

/** Narrative sections persisted on titan_documents.content (tenant-scoped). */
export type FinanceDocumentContent = {
  /** Invoice-only — never rendered on ordinary quotes. */
  workCompleted?: string | null;
  warranty?: FinanceDocumentWarrantyContent | null;
  recommendedMaintenance?: FinanceDocumentMaintenanceContent | null;
};

export type FinanceDocumentSectionsSnapshot = {
  content: FinanceDocumentContent;
  /** Genuine job evidence reference — invoice documents only. */
  cocDocumentationId: string | null;
};

export function emptyFinanceDocumentContent(): FinanceDocumentContent {
  return {};
}

export function normalizeFinanceDocumentContent(
  raw: FinanceDocumentContent | null | undefined,
): FinanceDocumentContent {
  if (!raw || typeof raw !== 'object') return {};
  const workCompleted = raw.workCompleted?.trim() || null;
  const warrantyText = raw.warranty?.text?.trim();
  const warranty =
    warrantyText && warrantyText.length > 0
      ? {
          text: warrantyText,
          months:
            typeof raw.warranty?.months === 'number' && raw.warranty.months > 0
              ? raw.warranty.months
              : null,
        }
      : null;
  const maintenanceText = raw.recommendedMaintenance?.text?.trim() || null;
  const maintenanceItems = (raw.recommendedMaintenance?.items ?? []).filter((item) =>
    (item.label ?? item.description ?? '').trim(),
  );
  const recommendedMaintenance =
    maintenanceText || maintenanceItems.length > 0
      ? { text: maintenanceText, items: maintenanceItems }
      : null;

  return {
    ...(workCompleted ? { workCompleted } : {}),
    ...(warranty ? { warranty } : {}),
    ...(recommendedMaintenance ? { recommendedMaintenance } : {}),
  };
}

export function isEligibleCocEvidenceMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  if (metadata.evidenceRole === COC_EVIDENCE_ROLE) return true;
  if (metadata.complianceType === COC_COMPLIANCE_TYPE) return true;
  return false;
}

export function financeDocumentContentToPreviewFields(content: FinanceDocumentContent): {
  workCompleted: string | null;
  warranty: FinanceDocumentWarrantyContent | null;
  recommendedMaintenance: FinanceDocumentMaintenanceContent | null;
} {
  const normalized = normalizeFinanceDocumentContent(content);
  return {
    workCompleted: normalized.workCompleted ?? null,
    warranty: normalized.warranty ?? null,
    recommendedMaintenance: normalized.recommendedMaintenance ?? null,
  };
}
