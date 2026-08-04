import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDocumentPhoto,
  addSection,
  assertReportHasNoFinancialContent,
  buildDefaultSections,
  buildLineItem,
  computeDocumentTotals,
  contrastRatio,
  COC_NOT_ATTACHED_LABEL,
  documentPhotosByRole,
  documentPhotoSourcePath,
  documentVariantLabel,
  findReportFinancialContent,
  normaliseDocumentPhotos,
  removeDocumentPhoto,
  reorderDocumentPhoto,
  replaceDocumentPhoto,
  setDocumentPhotoCaption,
  TITAN_DOCUMENT_VARIANTS,
  TITAN_REPORT_KINDS,
  DOCUMENT_COLOR_TOKENS,
  DOCUMENT_PRINT_TOKENS,
  DOCUMENT_TYPOGRAPHY,
  DOCUMENT_TYPOGRAPHY_FLOORS,
  DocumentEngineError,
  documentSectionLabel,
  moveSection,
  normaliseSectionPositions,
  removeLineItem,
  removeSection,
  reorderLineItems,
  resolveCocAttachment,
  resolveDocumentEditScope,
  setSectionVisibility,
  stripXeroOwnedFields,
  TITAN_DOCUMENT_TYPES,
  updateSection,
  validateDocumentTypography,
  YOUNG_GUNS_BANK_DETAILS,
  YOUNG_GUNS_CONTACT,
  type DocumentSection,
} from './document-engine.js';

function sections(): DocumentSection[] {
  return buildDefaultSections('invoice');
}

// ---------------------------------------------------------------------------
// Readability
// ---------------------------------------------------------------------------

test('shipped typography tokens satisfy every readability floor', () => {
  assert.deepEqual(validateDocumentTypography(), []);
});

test('typography validation rejects shrinking the document to force one page', () => {
  const tooSmall = { ...DOCUMENT_TYPOGRAPHY, body: 13, label: 11, sectionHeading: 15 };
  const violations = validateDocumentTypography(tooSmall);
  const tokens = violations.map((violation) => violation.token);

  assert.ok(tokens.includes('body'));
  assert.ok(tokens.includes('label'));
  assert.ok(tokens.includes('sectionHeading'));
});

test('typography validation rejects line heights outside 1.35 to 1.5', () => {
  assert.ok(
    validateDocumentTypography({ ...DOCUMENT_TYPOGRAPHY, lineHeightBody: 1.2 }).some(
      (violation) => violation.token === 'lineHeightBody',
    ),
  );
  assert.ok(
    validateDocumentTypography({ ...DOCUMENT_TYPOGRAPHY, lineHeightRelaxed: 1.8 }).some(
      (violation) => violation.token === 'lineHeightRelaxed',
    ),
  );
});

test('print tokens keep A4 portrait, a readable body size and a scannable QR', () => {
  assert.equal(DOCUMENT_PRINT_TOKENS.pageWidthMm, 210);
  assert.equal(DOCUMENT_PRINT_TOKENS.pageHeightMm, 297);
  assert.ok(DOCUMENT_PRINT_TOKENS.bodyPt >= DOCUMENT_TYPOGRAPHY_FLOORS.printBodyMinPt);
  assert.ok(DOCUMENT_PRINT_TOKENS.qrSizeMm >= 30);

  assert.ok(
    validateDocumentTypography(DOCUMENT_TYPOGRAPHY, {
      ...DOCUMENT_PRINT_TOKENS,
      qrSizeMm: 18,
    }).some((violation) => violation.token === 'print.qrSizeMm'),
  );
  assert.ok(
    validateDocumentTypography(DOCUMENT_TYPOGRAPHY, {
      ...DOCUMENT_PRINT_TOKENS,
      bodyPt: 8,
    }).some((violation) => violation.token === 'print.bodyPt'),
  );
});

test('document text clears WCAG AA contrast on the dark panels', () => {
  const { panelBackground, pageBackground, textBody, textPrimary, textMuted, labelBlue } =
    DOCUMENT_COLOR_TOKENS;

  // 4.5:1 for body copy, 3:1 for large headings.
  assert.ok(contrastRatio(textBody, panelBackground) >= 4.5);
  assert.ok(contrastRatio(textPrimary, panelBackground) >= 4.5);
  assert.ok(contrastRatio(textPrimary, pageBackground) >= 4.5);
  assert.ok(contrastRatio(textMuted, panelBackground) >= 4.5);
  assert.ok(contrastRatio(labelBlue, panelBackground) >= 3);
});

test('contrast helper matches known reference ratios', () => {
  assert.equal(Math.round(contrastRatio('#FFFFFF', '#000000')), 21);
  assert.equal(Math.round(contrastRatio('#FFFFFF', '#FFFFFF')), 1);
  assert.throws(() => contrastRatio('#GGG', '#000000'), /6-digit hex/);
});

// ---------------------------------------------------------------------------
// Company facts
// ---------------------------------------------------------------------------

test('bank and contact details match the Owner-confirmed values', () => {
  assert.equal(YOUNG_GUNS_BANK_DETAILS.accountName, 'Young Guns Plumbing');
  assert.equal(YOUNG_GUNS_BANK_DETAILS.bank, 'First National Bank');
  assert.equal(YOUNG_GUNS_BANK_DETAILS.accountNumber, '62847540459');
  assert.equal(YOUNG_GUNS_BANK_DETAILS.branchCode, '250655');
  assert.equal(YOUNG_GUNS_BANK_DETAILS.accountType, 'Cheque');

  assert.equal(YOUNG_GUNS_CONTACT.phone, '066 234 6301');
  assert.equal(YOUNG_GUNS_CONTACT.email, 'ygplumberswp@gmail.com');
  assert.equal(YOUNG_GUNS_CONTACT.website, 'younggunsplumbingcpt.co.za');
  assert.equal(YOUNG_GUNS_CONTACT.location, 'Cape Town, Western Cape');
});

test('no retired payment providers are offered', () => {
  const serialised = JSON.stringify({ YOUNG_GUNS_BANK_DETAILS, YOUNG_GUNS_CONTACT }).toLowerCase();
  assert.ok(!serialised.includes('snapscan'));
  assert.ok(!serialised.includes('zapper'));
});

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

test('every document type builds a densely ordered default section list', () => {
  for (const type of TITAN_DOCUMENT_TYPES) {
    const built = buildDefaultSections(type);
    assert.ok(built.length > 0, type);
    assert.deepEqual(
      built.map((section) => section.position),
      built.map((_, index) => index),
      type,
    );
    assert.equal(built[0]!.kind, 'branded_header', type);
    assert.equal(built.at(-1)!.kind, 'branded_footer', type);
    // Nothing is pre-filled with example content.
    assert.ok(built.every((section) => Object.keys(section.payload).length === 0), type);
  }
});

test('invoice, quote and report share the header, meta and footer frame', () => {
  const shared = ['branded_header', 'document_meta', 'customer_property', 'job_details', 'branded_footer'];
  for (const type of TITAN_DOCUMENT_TYPES) {
    const kinds = buildDefaultSections(type).map((section) => section.kind);
    for (const kind of shared) {
      assert.ok(kinds.includes(kind as never), `${type} is missing ${kind}`);
    }
  }
});

test('quotes carry scope and terms while invoices carry payment options', () => {
  const quoteKinds = buildDefaultSections('quote').map((section) => section.kind);
  const invoiceKinds = buildDefaultSections('invoice').map((section) => section.kind);

  assert.ok(quoteKinds.includes('scope_of_work'));
  assert.ok(quoteKinds.includes('terms_exclusions'));
  assert.ok(!quoteKinds.includes('payment_options'));

  assert.ok(invoiceKinds.includes('payment_options'));
  assert.ok(invoiceKinds.includes('coc_attachment'));
});

test('the engine produces exactly the five approved documents', () => {
  assert.deepEqual(
    TITAN_DOCUMENT_VARIANTS.map(documentVariantLabel),
    ['Quote', 'Invoice', 'Service Report', 'Inspection Report', 'Maintenance Report'],
  );
  assert.deepEqual([...TITAN_REPORT_KINDS], ['service', 'inspection', 'maintenance']);
});

test('the service report has every approved section in the approved order', () => {
  const kinds = buildDefaultSections('report', 'service').map((section) => section.kind);

  assert.deepEqual(kinds, [
    'branded_header',
    'document_meta',
    'customer_property',
    'job_details',
    'status_panel',
    'service_summary',
    'work_completed_checklist',
    'inspection_findings',
    'before_after_photos',
    'image_gallery',
    'coc_attachment',
    'parts_materials',
    'recommended_maintenance',
    'warranty',
    'sign_off',
    'contact_help',
    'review_request',
    'branded_footer',
  ]);
});

test('all three report kinds share the frame and carry no financial sections', () => {
  for (const reportKind of TITAN_REPORT_KINDS) {
    const sectionList = buildDefaultSections('report', reportKind);
    const kinds = sectionList.map((section) => section.kind);

    for (const required of [
      'branded_header',
      'customer_property',
      'job_details',
      'status_panel',
      'coc_attachment',
      'warranty',
      'sign_off',
      'contact_help',
      'review_request',
      'branded_footer',
    ]) {
      assert.ok(kinds.includes(required as never), `${reportKind} report is missing ${required}`);
    }

    for (const banned of ['line_items', 'totals', 'payment_options']) {
      assert.ok(!kinds.includes(banned as never), `${reportKind} report must not have ${banned}`);
    }
    assert.deepEqual(findReportFinancialContent(sectionList), [], reportKind);
  }
});

test('report kinds differ in emphasis without leaving the shared engine', () => {
  const service = buildDefaultSections('report', 'service').map((s) => s.kind);
  const inspection = buildDefaultSections('report', 'inspection').map((s) => s.kind);
  const maintenance = buildDefaultSections('report', 'maintenance').map((s) => s.kind);

  assert.ok(service.includes('work_completed_checklist'));
  assert.ok(service.includes('parts_materials'));

  assert.ok(inspection.includes('executive_summary'));
  assert.ok(inspection.includes('compliance'));
  assert.ok(!inspection.includes('parts_materials'));

  assert.ok(maintenance.includes('recommended_maintenance'));
  assert.ok(maintenance.includes('work_completed_checklist'));
});

test('a report carrying prices, VAT, banking or a payment link is rejected', () => {
  const base = buildDefaultSections('report', 'service');

  const withPrice = updateSection(base, 'report-service-parts_materials', {
    payload: { items: [{ description: 'PRV', quantity: 1, unitPriceCents: 85_000 }] },
  });
  const priceViolations = findReportFinancialContent(withPrice);
  assert.equal(priceViolations.length, 1);
  assert.match(priceViolations[0]!.reason, /unitPriceCents/);
  assert.throws(() => assertReportHasNoFinancialContent(withPrice), /may not contain pricing/);

  const withPaymentUrl = updateSection(base, 'report-service-contact_help', {
    payload: { paymentUrl: 'https://pay.yoco.com/r/abc' },
  });
  assert.throws(() => assertReportHasNoFinancialContent(withPaymentUrl), DocumentEngineError);

  const withBank = updateSection(base, 'report-service-sign_off', {
    payload: { accountNumber: '62847540459' },
  });
  assert.throws(() => assertReportHasNoFinancialContent(withBank), DocumentEngineError);

  const withVat = updateSection(base, 'report-service-service_summary', {
    payload: { summary: 'Geyser replaced', vatCents: 100 },
  });
  assert.throws(() => assertReportHasNoFinancialContent(withVat), DocumentEngineError);
});

test('adding a totals or payment section to a report is caught', () => {
  const withTotals = addSection(buildDefaultSections('report', 'service'), {
    id: 'sneaky-totals',
    kind: 'totals',
    title: null,
    visible: true,
    payload: {},
  });
  assert.throws(() => assertReportHasNoFinancialContent(withTotals), /may not appear on a report/);
});

test('a report with genuine operational content passes the financial check', () => {
  let current = buildDefaultSections('report', 'service');
  current = updateSection(current, 'report-service-service_summary', {
    payload: { summary: 'Replaced the failed 150L geyser and certified the installation.' },
  });
  current = updateSection(current, 'report-service-work_completed_checklist', {
    payload: { items: [{ label: 'Isolated water supply', done: true }] },
  });
  current = updateSection(current, 'report-service-parts_materials', {
    payload: { items: [{ description: 'Pressure control valve', quantity: 1, unit: 'ea' }] },
  });
  current = updateSection(current, 'report-service-inspection_findings', {
    payload: { rows: [{ item: 'Overflow pipe', finding: 'Corroded', action: 'Replaced' }] },
  });

  assert.deepEqual(findReportFinancialContent(current), []);
});

test('reports never expose financial sections as editable, even to the Owner', () => {
  const scope = resolveDocumentEditScope(owner, { type: 'report', status: 'draft' });
  for (const banned of ['line_items', 'totals', 'payment_options'] as const) {
    assert.ok(!scope.editableSectionKinds.includes(banned), banned);
  }
  assert.ok(scope.editableSectionKinds.includes('service_summary'));
  assert.ok(scope.editableSectionKinds.includes('parts_materials'));
});

test('sections can be added, moved, hidden and removed with dense positions', () => {
  let current = sections();
  const originalLength = current.length;

  current = addSection(current, {
    id: 'custom-site-notes',
    kind: 'custom',
    title: 'Site Notes',
    visible: true,
    payload: {},
  }, 3);
  assert.equal(current.length, originalLength + 1);
  assert.equal(current[3]!.id, 'custom-site-notes');

  current = moveSection(current, 'custom-site-notes', 0);
  assert.equal(current[0]!.id, 'custom-site-notes');
  assert.deepEqual(
    current.map((section) => section.position),
    current.map((_, index) => index),
  );

  current = setSectionVisibility(current, 'custom-site-notes', false);
  assert.equal(current.find((section) => section.id === 'custom-site-notes')!.visible, false);

  current = removeSection(current, 'custom-site-notes');
  assert.equal(current.length, originalLength);
  assert.deepEqual(
    current.map((section) => section.position),
    current.map((_, index) => index),
  );
});

test('the branded frame cannot be removed or hidden', () => {
  const current = sections();
  for (const kind of ['branded_header', 'document_meta', 'branded_footer'] as const) {
    const target = current.find((section) => section.kind === kind)!;
    assert.throws(() => removeSection(current, target.id), DocumentEngineError);
    assert.throws(() => setSectionVisibility(current, target.id, false), DocumentEngineError);
  }
});

test('unknown or duplicate sections are rejected', () => {
  const current = sections();
  assert.throws(() => removeSection(current, 'nope'), /not found/);
  assert.throws(() => moveSection(current, 'nope', 0), /not found/);
  assert.throws(() => updateSection(current, 'nope', { title: 'x' }), /not found/);
  assert.throws(
    () => addSection(current, { ...current[0]!, title: null, visible: true, payload: {} }),
    /already exists/,
  );
});

test('moving a section to an out-of-range position clamps instead of throwing', () => {
  const current = sections();
  const last = current.at(-1)!.id;
  const moved = moveSection(current, last, 9999);
  assert.equal(moved.at(-1)!.id, last);

  const front = moveSection(current, last, -5);
  assert.equal(front[0]!.id, last);
});

test('section titles are trimmed and blank titles fall back to the default label', () => {
  const current = updateSection(sections(), 'invoice-work_completed', { title: '  Scope Done  ' });
  assert.equal(current.find((s) => s.id === 'invoice-work_completed')!.title, 'Scope Done');

  const cleared = updateSection(current, 'invoice-work_completed', { title: '   ' });
  assert.equal(cleared.find((s) => s.id === 'invoice-work_completed')!.title, null);
  assert.equal(documentSectionLabel('work_completed'), 'Work Completed');
});

test('normalising positions preserves visual order from sparse input', () => {
  const sparse: DocumentSection[] = [
    { id: 'c', kind: 'custom', title: null, position: 90, visible: true, payload: {} },
    { id: 'a', kind: 'custom', title: null, position: 5, visible: true, payload: {} },
    { id: 'b', kind: 'custom', title: null, position: 40, visible: true, payload: {} },
  ];
  assert.deepEqual(
    normaliseSectionPositions(sparse).map((section) => section.id),
    ['a', 'b', 'c'],
  );
});

// ---------------------------------------------------------------------------
// Line items and totals
// ---------------------------------------------------------------------------

test('line items compute VAT in integer cents', () => {
  const line = buildLineItem(
    { id: 'l1', description: '150L Dewhot Geyser', quantity: 1, unitPriceCents: 695_000 },
    0,
  );
  assert.equal(line.lineSubtotalCents, 695_000);
  assert.equal(line.lineVatCents, 104_250);
  assert.equal(line.lineTotalCents, 799_250);
  assert.ok(Number.isInteger(line.lineVatCents));
});

test('line item validation rejects unusable input', () => {
  assert.throws(
    () => buildLineItem({ id: 'l', description: '   ', quantity: 1, unitPriceCents: 100 }, 0),
    /description is required/,
  );
  assert.throws(
    () => buildLineItem({ id: 'l', description: 'x', quantity: 0, unitPriceCents: 100 }, 0),
    /greater than zero/,
  );
  assert.throws(
    () => buildLineItem({ id: 'l', description: 'x', quantity: 1, unitPriceCents: 100.5 }, 0),
    /integer number of cents/,
  );
});

test('totals match the approved invoice arithmetic', () => {
  const lineItems = [
    { id: 'a', description: '150L Dewhot Geyser', quantity: 1, unitPriceCents: 695_000 },
    { id: 'b', description: 'Pressure Control Valve (PRV)', quantity: 1, unitPriceCents: 85_000 },
    { id: 'c', description: 'Vacuum Breaker', quantity: 2, unitPriceCents: 35_000 },
    { id: 'd', description: 'Geyser Installation Labour', quantity: 1, unitPriceCents: 250_000 },
    { id: 'e', description: 'Materials & Consumables', quantity: 1, unitPriceCents: 25_000 },
  ].map((input, index) => buildLineItem(input, index));

  const totals = computeDocumentTotals({
    lineItems,
    depositReceivedCents: 300_000,
    amountPaidCents: 0,
  });

  assert.equal(totals.subtotalCents, 1_125_000);
  assert.equal(totals.vatCents, 168_750);
  assert.equal(totals.totalCents, 1_293_750);
  assert.equal(totals.outstandingCents, 993_750);
  assert.equal(totals.currency, 'ZAR');
});

test('the invoice totals model has no discount row', () => {
  const lineItems = [buildLineItem({ id: 'a', description: 'x', quantity: 1, unitPriceCents: 1000 }, 0)];
  const totals = computeDocumentTotals({ lineItems });

  assert.ok(!('discountCents' in totals), 'discount was removed from the approved design');
  assert.deepEqual(Object.keys(totals).sort(), [
    'amountPaidCents',
    'currency',
    'depositReceivedCents',
    'outstandingCents',
    'subtotalCents',
    'totalCents',
    'vatCents',
  ]);
});

test('a fully settled invoice has no outstanding balance and never goes negative', () => {
  const lineItems = [buildLineItem({ id: 'a', description: 'x', quantity: 1, unitPriceCents: 1000 }, 0)];
  const totals = computeDocumentTotals({ lineItems, amountPaidCents: 5_000 });
  assert.equal(totals.outstandingCents, 0);
});

test('totals reject non-integer or negative money', () => {
  const lineItems = [buildLineItem({ id: 'a', description: 'x', quantity: 1, unitPriceCents: 1000 }, 0)];
  assert.throws(() => computeDocumentTotals({ lineItems, amountPaidCents: 10.5 }), /integer/);
  assert.throws(() => computeDocumentTotals({ lineItems, depositReceivedCents: -1 }), /negative/);
});

test('line items reorder and remove with dense positions', () => {
  const items = ['a', 'b', 'c'].map((id, index) =>
    buildLineItem({ id, description: id, quantity: 1, unitPriceCents: 100 }, index),
  );

  assert.deepEqual(
    reorderLineItems(items, 'c', 0).map((item) => item.id),
    ['c', 'a', 'b'],
  );
  assert.deepEqual(
    reorderLineItems(items, 'c', 0).map((item) => item.position),
    [0, 1, 2],
  );
  assert.deepEqual(
    removeLineItem(items, 'b').map((item) => [item.id, item.position]),
    [['a', 0], ['c', 1]],
  );
  assert.throws(() => removeLineItem(items, 'zzz'), /not found/);
  assert.throws(() => reorderLineItems(items, 'zzz', 0), /not found/);
});

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

function photoInput(id: string, role: 'before' | 'after' | 'additional') {
  return {
    id,
    documentationId: `doc-${id}`,
    jobId: 'job-1',
    role,
    fileName: `${id}.jpg`,
    mimeType: 'image/jpeg',
  };
}

test('photos upload, caption, reorder, replace and remove within their role', () => {
  let photos = addDocumentPhoto([], photoInput('b1', 'before'));
  photos = addDocumentPhoto(photos, photoInput('b2', 'before'));
  photos = addDocumentPhoto(photos, photoInput('a1', 'after'));

  assert.deepEqual(
    documentPhotosByRole(photos, 'before').map((photo) => photo.id),
    ['b1', 'b2'],
  );

  photos = setDocumentPhotoCaption(photos, 'b1', '  Corroded inlet  ');
  assert.equal(photos.find((photo) => photo.id === 'b1')!.caption, 'Corroded inlet');

  photos = reorderDocumentPhoto(photos, 'b2', 0);
  assert.deepEqual(
    documentPhotosByRole(photos, 'before').map((photo) => photo.id),
    ['b2', 'b1'],
  );
  assert.deepEqual(
    documentPhotosByRole(photos, 'before').map((photo) => photo.position),
    [0, 1],
  );
  // Reordering one role leaves the other untouched.
  assert.deepEqual(
    documentPhotosByRole(photos, 'after').map((photo) => photo.id),
    ['a1'],
  );

  photos = replaceDocumentPhoto(photos, 'b1', {
    documentationId: 'doc-b1-retake',
    jobId: 'job-1',
    fileName: 'b1-retake.jpg',
    mimeType: 'image/jpeg',
  });
  const replaced = photos.find((photo) => photo.id === 'b1')!;
  assert.equal(replaced.documentationId, 'doc-b1-retake');
  // The caption survives a replacement.
  assert.equal(replaced.caption, 'Corroded inlet');

  photos = removeDocumentPhoto(photos, 'b2');
  assert.deepEqual(
    documentPhotosByRole(photos, 'before').map((photo) => [photo.id, photo.position]),
    [['b1', 0]],
  );
});

test('a photo always resolves to a real stored evidence file', () => {
  const photos = addDocumentPhoto([], photoInput('p1', 'additional'));
  assert.equal(
    documentPhotoSourcePath(photos[0]!),
    '/api/v1/jobs/job-1/evidence/doc-p1/content',
  );
});

test('photos without stored evidence metadata are refused', () => {
  assert.throws(
    () => addDocumentPhoto([], { ...photoInput('p', 'before'), documentationId: '  ' }),
    /stored evidence metadata/,
  );
  assert.throws(
    () => addDocumentPhoto([], { ...photoInput('p', 'before'), jobId: '' }),
    /stored evidence metadata/,
  );
  assert.throws(
    () => addDocumentPhoto([], { ...photoInput('p', 'before'), role: 'sideways' as never }),
    /Unknown photo role/,
  );
  assert.throws(
    () =>
      replaceDocumentPhoto(addDocumentPhoto([], photoInput('p', 'before')), 'p', {
        documentationId: '',
        jobId: 'job-1',
        fileName: 'x.jpg',
        mimeType: 'image/jpeg',
      }),
    /stored evidence metadata/,
  );
});

test('finance direct photos require a tenant storage key', () => {
  assert.throws(
    () =>
      addDocumentPhoto([], {
        ...photoInput('p', 'additional'),
        documentationId: 'file-1',
        jobId: '00000000-0000-4000-8000-000000000001',
        source: 'finance_direct',
        storageKey: '',
      }),
    /storage key/,
  );
});

test('duplicate and unknown photos are refused', () => {
  const photos = addDocumentPhoto([], photoInput('p1', 'before'));
  assert.throws(() => addDocumentPhoto(photos, photoInput('p1', 'after')), /already exists/);
  assert.throws(() => removeDocumentPhoto(photos, 'nope'), /not found/);
  assert.throws(() => reorderDocumentPhoto(photos, 'nope', 0), /not found/);
  assert.throws(() => setDocumentPhotoCaption(photos, 'nope', 'x'), /not found/);
});

test('stored photos load back into dense visual order', () => {
  const stored = [
    { ...photoInput('b2', 'before'), caption: null, position: 40 },
    { ...photoInput('b1', 'before'), caption: null, position: 5 },
    { ...photoInput('a1', 'after'), caption: null, position: 99 },
  ];
  const normalised = normaliseDocumentPhotos(stored);
  assert.deepEqual(
    documentPhotosByRole(normalised, 'before').map((photo) => [photo.id, photo.position]),
    [['b1', 0], ['b2', 1]],
  );
  assert.deepEqual(
    documentPhotosByRole(normalised, 'after').map((photo) => [photo.id, photo.position]),
    [['a1', 0]],
  );
});

// ---------------------------------------------------------------------------
// Certificate of Compliance
// ---------------------------------------------------------------------------

test('a COC with a real stored file gets a working tenant-scoped download path', () => {
  const state = resolveCocAttachment({
    documentId: 'doc-1',
    jobId: 'job-1',
    fileName: 'COC-2025-0421.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 84_233,
    hasStoredFile: true,
  });

  assert.equal(state.status, 'attached');
  if (state.status !== 'attached') return;
  assert.equal(state.downloadPath, '/api/v1/jobs/job-1/evidence/doc-1/content');
  assert.equal(state.fileName, 'COC-2025-0421.pdf');
  assert.equal(state.mimeType, 'application/pdf');
});

test('a COC without stored bytes is reported as not attached, never faked', () => {
  const cases = [
    { documentId: 'doc-1', jobId: 'job-1', fileName: 'a.pdf', hasStoredFile: false },
    { documentId: null, jobId: 'job-1', fileName: 'a.pdf', hasStoredFile: true },
    { documentId: 'doc-1', jobId: null, fileName: 'a.pdf', hasStoredFile: true },
    { documentId: 'doc-1', jobId: 'job-1', fileName: '  ', hasStoredFile: true },
  ];
  for (const input of cases) {
    assert.equal(resolveCocAttachment(input).status, 'not_attached', JSON.stringify(input));
  }
  assert.equal(COC_NOT_ATTACHED_LABEL, 'Not attached');
});

test('COC download paths encode identifiers', () => {
  const state = resolveCocAttachment({
    documentId: 'doc/1',
    jobId: 'job 1',
    fileName: 'x.pdf',
    hasStoredFile: true,
  });
  assert.equal(state.status, 'attached');
  if (state.status !== 'attached') return;
  assert.equal(state.downloadPath, '/api/v1/jobs/job%201/evidence/doc%2F1/content');
});

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------

const owner = { roleName: 'Company Owner', permissions: ['*'] };
const accountant = {
  roleName: 'Accountant',
  permissions: ['finance:read', 'finance:write', 'documents:read', 'documents:write'],
};
const dispatcher = {
  roleName: 'Dispatcher',
  permissions: ['finance:read', 'documents:read', 'documents:write'],
};
const technician = {
  roleName: 'Technician',
  permissions: ['jobs:read', 'jobs:write', 'documents:read', 'documents:write'],
};
const draftInvoice = { type: 'invoice' as const, status: 'draft' as const };
const issuedInvoice = { type: 'invoice' as const, status: 'issued' as const };

test('the Owner may edit and issue a draft invoice', () => {
  const scope = resolveDocumentEditScope(owner, draftInvoice);
  assert.equal(scope.canEditWording, true);
  assert.equal(scope.canEditLineItems, true);
  assert.equal(scope.canManageSections, true);
  assert.equal(scope.canIssue, true);
  assert.equal(scope.canManagePaymentLinks, true);
  assert.equal(scope.lockedReason, null);
});

test('an accountant with finance write may issue; a dispatcher without it may not', () => {
  assert.equal(resolveDocumentEditScope(accountant, draftInvoice).canIssue, true);

  const dispatcherScope = resolveDocumentEditScope(dispatcher, draftInvoice);
  assert.equal(dispatcherScope.canIssue, false);
  assert.equal(dispatcherScope.canEditLineItems, false);
  assert.equal(dispatcherScope.canManagePaymentLinks, false);
  // Non-financial wording stays editable for office staff.
  assert.equal(dispatcherScope.canEditWording, true);
  assert.ok(!dispatcherScope.editableSectionKinds.includes('totals'));
  assert.ok(!dispatcherScope.editableSectionKinds.includes('payment_options'));
  assert.ok(dispatcherScope.editableSectionKinds.includes('work_completed'));
});

test('an assigned technician may add photos and work notes but touch no money', () => {
  const scope = resolveDocumentEditScope(
    { ...technician, isAssignedTechnician: true },
    draftInvoice,
  );

  assert.equal(scope.canAttachPhotos, true);
  assert.equal(scope.canAttachCoc, true);
  assert.equal(scope.canEditLineItems, false);
  assert.equal(scope.canEditFinancialFields, false);
  assert.equal(scope.canEditBankDetails, false);
  assert.equal(scope.canManagePaymentLinks, false);
  assert.equal(scope.canManageSections, false);
  assert.equal(scope.canIssue, false);

  assert.deepEqual([...scope.editableSectionKinds].sort(), [
    'before_after_photos',
    'image_gallery',
    'inspection_findings',
    'parts_materials',
    'service_summary',
    'work_completed',
    'work_completed_checklist',
    'work_performed',
  ]);
  // Nothing financial, and no template or section restructuring.
  for (const banned of ['line_items', 'totals', 'payment_options'] as const) {
    assert.ok(!scope.editableSectionKinds.includes(banned), banned);
  }
});

test('an unassigned technician gets no edit access at all', () => {
  const scope = resolveDocumentEditScope({ ...technician, isAssignedTechnician: false }, draftInvoice);
  assert.equal(scope.canAttachPhotos, false);
  assert.equal(scope.editableSectionKinds.length, 0);
  assert.ok(scope.lockedReason);
});

test('nobody may edit the bank details from the document engine', () => {
  for (const identity of [owner, accountant, dispatcher, { ...technician, isAssignedTechnician: true }]) {
    assert.equal(resolveDocumentEditScope(identity, draftInvoice).canEditBankDetails, false);
  }
});

test('an issued document is locked, and a new version is required to change it', () => {
  const scope = resolveDocumentEditScope(owner, issuedInvoice);
  assert.equal(scope.canEditWording, false);
  assert.equal(scope.canEditLineItems, false);
  assert.equal(scope.canManageSections, false);
  assert.match(scope.lockedReason ?? '', /new version/);
  // Payment links stay manageable after issue: that is when they exist.
  assert.equal(scope.canManagePaymentLinks, true);
});

test('a technician cannot edit an issued document', () => {
  const scope = resolveDocumentEditScope({ ...technician, isAssignedTechnician: true }, issuedInvoice);
  assert.equal(scope.canAttachPhotos, false);
  assert.match(scope.lockedReason ?? '', /issued/);
});

test('reports never expose line-item or payment-link editing', () => {
  const scope = resolveDocumentEditScope(owner, { type: 'report', status: 'draft' });
  assert.equal(scope.canEditLineItems, false);
  assert.equal(scope.canManagePaymentLinks, false);
  assert.equal(scope.canEditWording, true);
});

test('quotes never expose payment-link management', () => {
  const scope = resolveDocumentEditScope(owner, { type: 'quote', status: 'draft' });
  assert.equal(scope.canManagePaymentLinks, false);
  assert.equal(scope.canEditLineItems, true);
});

test('an actor with no document or finance permission is refused', () => {
  const scope = resolveDocumentEditScope({ roleName: 'Member', permissions: ['notifications:read'] }, draftInvoice);
  assert.equal(scope.canEditWording, false);
  assert.ok(scope.lockedReason);
});

// ---------------------------------------------------------------------------
// Xero protection
// ---------------------------------------------------------------------------

test('Xero-owned financial fields are dropped from edits once an invoice is synced', () => {
  const { patch, rejectedFields } = stripXeroOwnedFields(
    { title: 'Geyser Installation', totalCents: 999, xeroInvoiceNumber: 'INV-9', notes: 'ok' },
    { isXeroSynced: true },
  );

  assert.deepEqual(patch, { title: 'Geyser Installation', notes: 'ok' });
  assert.deepEqual(rejectedFields.sort(), ['totalCents', 'xeroInvoiceNumber']);
});

test('an unsynced invoice keeps full local control of its totals', () => {
  const { patch, rejectedFields } = stripXeroOwnedFields(
    { totalCents: 999 },
    { isXeroSynced: false },
  );
  assert.deepEqual(patch, { totalCents: 999 });
  assert.deepEqual(rejectedFields, []);
});
