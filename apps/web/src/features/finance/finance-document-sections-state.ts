import type {
  FinanceDocumentContent,
  FinanceDocumentMaintenanceContent,
  FinanceDocumentWarrantyContent,
} from '@titan/shared';

export type FinanceDocumentSectionsEditorState = {
  scopeOfWork: string;
  exclusions: string;
  paymentTerms: string;
  workCompleted: string;
  warrantyText: string;
  warrantyMonths: string;
  maintenanceText: string;
  maintenanceItems: string[];
};

export function emptyFinanceDocumentSectionsEditorState(): FinanceDocumentSectionsEditorState {
  return {
    scopeOfWork: '',
    exclusions: '',
    paymentTerms: '',
    workCompleted: '',
    warrantyText: '',
    warrantyMonths: '',
    maintenanceText: '',
    maintenanceItems: [],
  };
}

export function sectionsFromQuoteDetail(input: {
  scopeOfWork?: string | null;
  exclusions?: string | null;
  paymentTerms?: string | null;
  documentSections?: { content: FinanceDocumentContent };
}): FinanceDocumentSectionsEditorState {
  const content = input.documentSections?.content ?? {};
  return {
    scopeOfWork: input.scopeOfWork ?? '',
    exclusions: input.exclusions ?? '',
    paymentTerms: input.paymentTerms ?? '',
    workCompleted: '',
    warrantyText: content.warranty?.text ?? '',
    warrantyMonths: content.warranty?.months ? String(content.warranty.months) : '',
    maintenanceText: content.recommendedMaintenance?.text ?? '',
    maintenanceItems: (content.recommendedMaintenance?.items ?? [])
      .map((item) => item.label ?? item.description ?? '')
      .filter(Boolean),
  };
}

export function sectionsFromInvoiceDetail(input: {
  paymentTerms?: string | null;
  documentSections?: { content: FinanceDocumentContent };
}): FinanceDocumentSectionsEditorState {
  const content = input.documentSections?.content ?? {};
  return {
    scopeOfWork: '',
    exclusions: '',
    paymentTerms: input.paymentTerms ?? '',
    workCompleted: content.workCompleted ?? '',
    warrantyText: content.warranty?.text ?? '',
    warrantyMonths: content.warranty?.months ? String(content.warranty.months) : '',
    maintenanceText: content.recommendedMaintenance?.text ?? '',
    maintenanceItems: (content.recommendedMaintenance?.items ?? [])
      .map((item) => item.label ?? item.description ?? '')
      .filter(Boolean),
  };
}

export function editorStateToDocumentContent(
  state: FinanceDocumentSectionsEditorState,
  kind: 'quote' | 'invoice',
): FinanceDocumentContent {
  const warrantyText = state.warrantyText.trim();
  const warranty: FinanceDocumentWarrantyContent | null = warrantyText
    ? {
        text: warrantyText,
        months: state.warrantyMonths.trim() ? Number(state.warrantyMonths) : null,
      }
    : null;

  const maintenanceItems = state.maintenanceItems
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label) => ({ label }));
  const maintenanceText = state.maintenanceText.trim();
  const recommendedMaintenance: FinanceDocumentMaintenanceContent | null =
    maintenanceText || maintenanceItems.length > 0
      ? { text: maintenanceText || null, items: maintenanceItems }
      : null;

  return {
    ...(kind === 'invoice' && state.workCompleted.trim()
      ? { workCompleted: state.workCompleted.trim() }
      : {}),
    ...(warranty ? { warranty } : {}),
    ...(recommendedMaintenance ? { recommendedMaintenance } : {}),
  };
}

export function quoteSectionsToApiPayload(state: FinanceDocumentSectionsEditorState) {
  return {
    scopeOfWork: state.scopeOfWork.trim() || null,
    exclusions: state.exclusions.trim() || null,
    paymentTerms: state.paymentTerms.trim() || null,
    documentContent: editorStateToDocumentContent(state, 'quote'),
  };
}

export function invoiceSectionsToApiPayload(state: FinanceDocumentSectionsEditorState) {
  return {
    paymentTerms: state.paymentTerms.trim() || null,
    documentContent: editorStateToDocumentContent(state, 'invoice'),
  };
}
