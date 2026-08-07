import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPLETION_REPORT_SECTION_OPTIONS,
  defaultIncludedSections,
  resolveCompletionReportMapAvailability,
  type CompletionReportSectionAvailability,
} from '@titan/shared';

describe('completion report UI contracts', () => {
  it('exposes all customer-facing section options', () => {
    const ids = COMPLETION_REPORT_SECTION_OPTIONS.map((option) => option.value);
    assert.ok(ids.includes('customer_details'));
    assert.ok(ids.includes('property_map'));
    assert.ok(ids.includes('customer_signature'));
    assert.ok(ids.includes('payment_receipt'));
    assert.equal(ids.length, 18);
  });

  it('defaults selections from availability only', () => {
    const availability: CompletionReportSectionAvailability[] = [
      {
        sectionId: 'job_details',
        label: 'Job',
        available: true,
        reason: null,
        defaultIncluded: true,
      },
      {
        sectionId: 'coc',
        label: 'COC',
        available: false,
        reason: 'Missing',
        defaultIncluded: true,
      },
    ];
    assert.deepEqual(defaultIncludedSections(availability), ['job_details']);
  });

  it('map option stays honest without coords', () => {
    const map = resolveCompletionReportMapAvailability({ propertyId: 'x' });
    assert.equal(map.availability, 'unavailable_no_coordinates');
  });
});
