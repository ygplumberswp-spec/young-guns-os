import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFinanceDocumentContent,
  isEligibleCocEvidenceMetadata,
  COC_EVIDENCE_ROLE,
  financeDocumentContentToPreviewFields,
} from './finance-document-content.js';

test('normalizeFinanceDocumentContent strips empty warranty and maintenance', () => {
  assert.deepEqual(normalizeFinanceDocumentContent({ warranty: { text: '  ' } }), {});
  assert.deepEqual(
    normalizeFinanceDocumentContent({
      warranty: { text: '12 month workmanship', months: 12 },
      recommendedMaintenance: { items: [{ label: 'Annual service' }] },
    }),
    {
      warranty: { text: '12 month workmanship', months: 12 },
      recommendedMaintenance: { text: null, items: [{ label: 'Annual service' }] },
    },
  );
});

test('isEligibleCocEvidenceMetadata accepts typed evidence roles only', () => {
  assert.equal(isEligibleCocEvidenceMetadata({ evidenceRole: COC_EVIDENCE_ROLE }), true);
  assert.equal(isEligibleCocEvidenceMetadata({ complianceType: 'coc' }), true);
  assert.equal(isEligibleCocEvidenceMetadata({ title: 'coc scan' }), false);
});

test('financeDocumentContentToPreviewFields maps work completed', () => {
  const fields = financeDocumentContentToPreviewFields({ workCompleted: 'Replaced valve' });
  assert.equal(fields.workCompleted, 'Replaced valve');
});
