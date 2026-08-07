import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCompletionReportHtml,
  defaultIncludedSections,
  normalizeIncludedSections,
  resolveCompletionReportMapAvailability,
  type CompletionReportSectionAvailability,
} from '@titan/shared';

describe('completion report service domain helpers', () => {
  it('defaults only available sections', () => {
    const sections: CompletionReportSectionAvailability[] = [
      {
        sectionId: 'customer_details',
        label: 'Customer',
        available: true,
        reason: null,
        defaultIncluded: true,
      },
      {
        sectionId: 'property_map',
        label: 'Map',
        available: false,
        reason: 'No coords',
        defaultIncluded: true,
      },
    ];
    assert.deepEqual(defaultIncludedSections(sections), ['customer_details']);
    assert.deepEqual(normalizeIncludedSections(['customer_details', 'property_map']), [
      'customer_details',
      'property_map',
    ]);
  });

  it('map availability stays honest without coordinates', () => {
    const result = resolveCompletionReportMapAvailability({
      propertyId: 'p1',
      latitude: null,
      longitude: null,
    });
    assert.equal(result.availability, 'unavailable_no_coordinates');
    assert.equal(result.placeUrl, null);
  });

  it('generated HTML includes work completed and map honesty note', () => {
    const html = buildCompletionReportHtml({
      title: 'Job done',
      reportNumber: 'CR-0002',
      generatedAt: '2026-08-03T10:00:00.000Z',
      includedSections: ['work_completed', 'property_map'],
      payload: {
        workCompleted: 'Installed new valve',
        map: {
          availability: 'unavailable_no_coordinates',
          placeUrl: null,
          note: 'Property coordinates are not available — map image omitted (coordinates are never invented).',
          latitude: null,
          longitude: null,
        },
      },
    });
    assert.ok(html.includes('Installed new valve'));
    assert.ok(html.includes('never invented'));
  });
});
