import test from 'node:test';
import assert from 'node:assert/strict';
import {
  editorStateToDocumentContent,
  emptyFinanceDocumentSectionsEditorState,
  invoiceSectionsToApiPayload,
  quoteSectionsToApiPayload,
  sectionsFromInvoiceDetail,
  sectionsFromQuoteDetail,
} from './finance-document-sections-state.js';

test('quote round-trip preserves scope, terms and narrative sections', () => {
  const state = {
    ...emptyFinanceDocumentSectionsEditorState(),
    scopeOfWork: 'Replace geyser valve',
    exclusions: 'Ceiling repair excluded',
    paymentTerms: '50% deposit',
    warrantyText: '12 month workmanship',
    warrantyMonths: '12',
    maintenanceText: 'Annual service recommended',
    maintenanceItems: ['Flush system'],
  };

  const reloaded = sectionsFromQuoteDetail({
    scopeOfWork: quoteSectionsToApiPayload(state).scopeOfWork,
    exclusions: quoteSectionsToApiPayload(state).exclusions,
    paymentTerms: quoteSectionsToApiPayload(state).paymentTerms,
    documentSections: { content: quoteSectionsToApiPayload(state).documentContent },
  });

  assert.equal(reloaded.scopeOfWork, 'Replace geyser valve');
  assert.equal(reloaded.exclusions, 'Ceiling repair excluded');
  assert.equal(reloaded.paymentTerms, '50% deposit');
  assert.equal(reloaded.warrantyText, '12 month workmanship');
  assert.equal(reloaded.maintenanceItems[0], 'Flush system');
  assert.equal(reloaded.workCompleted, '');
});

test('invoice round-trip preserves work completed without inventing line-item text', () => {
  const state = {
    ...emptyFinanceDocumentSectionsEditorState(),
    workCompleted: 'Installed new PRV and tested pressure',
    paymentTerms: 'Due on receipt',
    warrantyText: '90 day workmanship',
  };

  const payload = invoiceSectionsToApiPayload(state);
  const content = editorStateToDocumentContent(state, 'invoice');
  assert.equal(content.workCompleted, 'Installed new PRV and tested pressure');

  const reloaded = sectionsFromInvoiceDetail({
    paymentTerms: payload.paymentTerms,
    documentSections: { content: payload.documentContent },
  });
  assert.equal(reloaded.workCompleted, 'Installed new PRV and tested pressure');
  assert.equal(reloaded.paymentTerms, 'Due on receipt');
});

test('empty sections normalize to omitted document content fields', () => {
  const content = editorStateToDocumentContent(emptyFinanceDocumentSectionsEditorState(), 'quote');
  assert.deepEqual(content, {});
});
