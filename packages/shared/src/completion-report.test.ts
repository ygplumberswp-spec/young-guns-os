import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompletionReportHtml,
  canEditCompletionReport,
  completionReportDeliveryNote,
  defaultIncludedSections,
  normalizeIncludedSections,
  nextCompletionReportAction,
  resolveCompletionReportMapAvailability,
  type CompletionReportSectionAvailability,
} from './completion-report.js';

test('normalizeIncludedSections drops unknowns and duplicates', () => {
  assert.deepEqual(
    normalizeIncludedSections(['customer_details', 'bogus', 'customer_details', 'invoice']),
    ['customer_details', 'invoice'],
  );
});

test('resolveCompletionReportMapAvailability never invents coordinates', () => {
  assert.equal(
    resolveCompletionReportMapAvailability({ propertyId: null }).availability,
    'unavailable_no_property',
  );
  assert.equal(
    resolveCompletionReportMapAvailability({
      propertyId: 'prop-1',
      latitude: null,
      longitude: null,
    }).availability,
    'unavailable_no_coordinates',
  );
  const withCoords = resolveCompletionReportMapAvailability({
    propertyId: 'prop-1',
    latitude: -33.9249,
    longitude: 18.4241,
  });
  assert.equal(withCoords.availability, 'place_url');
  assert.ok(withCoords.placeUrl?.includes('-33.9249'));
  assert.ok(withCoords.placeUrl?.includes('18.4241'));
});

test('defaultIncludedSections only picks available defaults', () => {
  const availability: CompletionReportSectionAvailability[] = [
    {
      sectionId: 'customer_details',
      label: 'Customer',
      available: true,
      reason: null,
      defaultIncluded: true,
    },
    {
      sectionId: 'invoice',
      label: 'Invoice',
      available: false,
      reason: 'No invoice',
      defaultIncluded: true,
    },
    {
      sectionId: 'property_map',
      label: 'Map',
      available: true,
      reason: null,
      defaultIncluded: false,
    },
  ];
  assert.deepEqual(defaultIncludedSections(availability), ['customer_details']);
});

test('completion report status helpers', () => {
  assert.equal(canEditCompletionReport({ status: 'draft' }), true);
  assert.equal(canEditCompletionReport({ status: 'sent' }), false);
  assert.equal(canEditCompletionReport({ status: 'cancelled' }), false);
  assert.deepEqual(nextCompletionReportAction('draft'), {
    label: 'Generate Report',
    nextStatus: 'generated',
  });
  assert.equal(nextCompletionReportAction('ready_to_send'), null);
});

test('buildCompletionReportHtml includes selected sections and omits map invent', () => {
  const html = buildCompletionReportHtml({
    title: 'Completion — Test Job',
    reportNumber: 'CR-0001',
    generatedAt: '2026-08-03T12:00:00.000Z',
    includedSections: ['customer_details', 'property_map', 'work_completed'],
    payload: {
      customer: {
        name: 'Acme',
        email: 'a@example.com',
        phone: null,
        contactPerson: null,
      },
      map: {
        availability: 'unavailable_no_coordinates',
        placeUrl: null,
        note: 'Property coordinates are not available — map image omitted (coordinates are never invented).',
        latitude: null,
        longitude: null,
      },
      workCompleted: 'Replaced geyser valve.',
    },
  });
  assert.ok(html.includes('Acme'));
  assert.ok(html.includes('Replaced geyser valve'));
  assert.ok(html.includes('never invented'));
  assert.ok(!html.includes('maps.googleapis.com/maps/api/staticmap'));
});

test('completionReportDeliveryNote is honest about Email Centre path', () => {
  assert.ok(
    completionReportDeliveryNote({
      status: 'generated',
      documentId: 'doc-1',
      emailDraftId: null,
    }).includes('Email Centre'),
  );
  assert.ok(
    completionReportDeliveryNote({
      status: 'generated',
      documentId: 'doc-1',
      emailDraftId: 'draft-1',
    }).includes('Approve then execute'),
  );
});
