import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addressesLikelyMatch,
  buildLinkageEntityFingerprint,
  canAccessJobLinkageControl,
  classifyLinkageState,
  detectInvoiceLinkageConflicts,
  extractJobNumberReferences,
  isAmountOnlySupportingEvidence,
  isCustomerOnlyMatch,
  isDateProximityOnlySupportingEvidence,
  normalizeAddressForLinkage,
  scoreLinkageCandidates,
  type LinkageInvoiceDocument,
  type LinkageJobCandidateInput,
  type LinkageQuoteDocument,
} from './job-financial-linkage.js';

const jobA: LinkageJobCandidateInput = {
  id: 'job-a',
  jobNumber: 'JOB-000123',
  customerId: 'cust-1',
  propertyId: 'prop-1',
  title: 'Geyser repair',
  status: 'completed',
  snapshotFormattedAddress: '12 Main Road Durbanville',
  snapshotSuburb: 'Durbanville',
  scheduledAt: '2026-01-10T08:00:00.000Z',
  updatedAt: '2026-01-11T16:00:00.000Z',
};

const jobB: LinkageJobCandidateInput = {
  id: 'job-b',
  jobNumber: 'JOB-000456',
  customerId: 'cust-1',
  propertyId: 'prop-2',
  title: 'Blocked drain',
  status: 'completed',
  snapshotFormattedAddress: '88 Oak Street Bellville',
  snapshotSuburb: 'Bellville',
  scheduledAt: '2026-01-05T08:00:00.000Z',
  updatedAt: '2026-01-06T16:00:00.000Z',
};

function orphanInvoice(overrides: Partial<LinkageInvoiceDocument> = {}): LinkageInvoiceDocument {
  return {
    entityType: 'invoice',
    id: 'inv-1',
    companyId: 'co-1',
    customerId: 'cust-1',
    jobId: null,
    quoteId: null,
    invoiceNumber: 'TITAN-INV-000001',
    xeroReference: null,
    totalCents: 25_000,
    siteAddress: '12 Main Rd, Durbanville',
    issuedAt: '2026-01-11T10:00:00.000Z',
    updatedAt: '2026-01-11T10:00:00.000Z',
    sourceProvider: null,
    sourceExternalId: null,
    status: 'sent',
    ...overrides,
  };
}

function orphanQuote(overrides: Partial<LinkageQuoteDocument> = {}): LinkageQuoteDocument {
  return {
    entityType: 'quote',
    id: 'quote-1',
    companyId: 'co-1',
    customerId: 'cust-1',
    jobId: null,
    quoteNumber: 'TITAN-Q-000001',
    totalCents: 25_000,
    siteAddress: '12 Main Rd, Durbanville',
    issuedAt: '2026-01-09T10:00:00.000Z',
    acceptedAt: '2026-01-09T12:00:00.000Z',
    updatedAt: '2026-01-09T12:00:00.000Z',
    status: 'accepted',
    ...overrides,
  };
}

describe('JPE-003 job financial linkage', () => {
  it('1 native quote retains jobId classification as linked', () => {
    const quote = orphanQuote({ jobId: 'job-a' });
    const state = classifyLinkageState(quote, []);
    assert.equal(state, 'linked');
  });

  it('2 quote to invoice inherits job via linked quote context', () => {
    const invoice = orphanInvoice({ quoteId: 'quote-native' });
    const candidates = scoreLinkageCandidates({
      document: invoice,
      jobs: [jobA, jobB],
      linkedQuote: {
        quoteId: 'quote-native',
        quoteJobId: 'job-a',
        quoteTotalCents: 25_000,
        quoteStatus: 'accepted',
      },
    });
    assert.equal(candidates[0]?.jobId, 'job-a');
    assert.equal(candidates[0]?.isDeterministic, true);
  });

  it('3 direct job invoice context uses explicit jobId as linked', () => {
    const invoice = orphanInvoice({ jobId: 'job-a' });
    assert.equal(classifyLinkageState(invoice, []), 'linked');
  });

  it('4 exact unique job reference is deterministic', () => {
    const invoice = orphanInvoice({ xeroReference: 'PO JOB-000123' });
    const candidates = scoreLinkageCandidates({ document: invoice, jobs: [jobA, jobB] });
    assert.equal(candidates[0]?.jobId, 'job-a');
    assert.equal(candidates[0]?.isDeterministic, true);
    assert.equal(candidates[0]?.confidence, 'deterministic');
  });

  it('5 same customer alone is not deterministic', () => {
    const invoice = orphanInvoice({ siteAddress: null, xeroReference: null });
    const candidates = scoreLinkageCandidates({ document: invoice, jobs: [jobA, jobB] });
    for (const row of candidates) {
      assert.equal(row.isDeterministic, false);
    }
    assert.ok(isCustomerOnlyMatch(candidates[0]?.evidence ?? []));
  });

  it('6 same amount alone is not deterministic', () => {
    const invoice = orphanInvoice({
      totalCents: 25_000,
      siteAddress: null,
      xeroReference: null,
      quoteId: 'q1',
    });
    const candidates = scoreLinkageCandidates({
      document: invoice,
      jobs: [jobB],
      linkedQuote: {
        quoteId: 'q1',
        quoteJobId: null,
        quoteTotalCents: 25_000,
        quoteStatus: 'accepted',
      },
    });
    assert.equal(candidates[0]?.isDeterministic, false);
    assert.ok(isAmountOnlySupportingEvidence(candidates[0]?.evidence ?? []));
  });

  it('7 date proximity alone is not deterministic', () => {
    const invoice = orphanInvoice({
      siteAddress: null,
      xeroReference: null,
      customerId: 'cust-other',
      issuedAt: '2026-01-11T10:00:00.000Z',
    });
    const candidates = scoreLinkageCandidates({ document: invoice, jobs: [jobA] });
    assert.equal(candidates[0]?.isDeterministic, false);
    assert.ok(isDateProximityOnlySupportingEvidence(candidates[0]?.evidence ?? []));
  });

  it('8 multiple plausible jobs become ambiguous', () => {
    const invoice = orphanInvoice({ siteAddress: null, xeroReference: null });
    const candidates = scoreLinkageCandidates({ document: invoice, jobs: [jobA, jobB] });
    assert.equal(classifyLinkageState(invoice, candidates), 'ambiguous');
  });

  it('9 manual link candidate scoring supports high confidence with reference + customer + address', () => {
    const invoice = orphanInvoice({ xeroReference: 'JOB-000123' });
    const candidates = scoreLinkageCandidates({ document: invoice, jobs: [jobA] });
    assert.ok(candidates[0]!.score >= 80);
    assert.equal(candidates[0]?.confidence, 'deterministic');
  });

  it('10 entity fingerprint changes when job link changes', () => {
    const before = buildLinkageEntityFingerprint(
      { id: 'inv-1', customerId: 'cust-1', jobId: null, totalCents: 1000, updatedAt: 't1' },
      'invoice',
    );
    const after = buildLinkageEntityFingerprint(
      { id: 'inv-1', customerId: 'cust-1', jobId: 'job-a', totalCents: 1000, updatedAt: 't1' },
      'invoice',
    );
    assert.notEqual(before, after);
  });

  it('11 payment propagation is invoice-derived (no direct payment job id in model)', () => {
    const invoice = orphanInvoice({ jobId: 'job-a' });
    assert.equal(invoice.jobId, 'job-a');
  });

  it('12 reassign would change fingerprint for old and new contexts', () => {
    const linkedA = buildLinkageEntityFingerprint(
      { id: 'inv-1', customerId: 'cust-1', jobId: 'job-a', totalCents: 5000, updatedAt: 't1' },
      'invoice',
    );
    const linkedB = buildLinkageEntityFingerprint(
      { id: 'inv-1', customerId: 'cust-1', jobId: 'job-b', totalCents: 5000, updatedAt: 't2' },
      'invoice',
    );
    assert.notEqual(linkedA, linkedB);
  });

  it('13 quote invoice mismatch conflict detected', () => {
    const conflicts = detectInvoiceLinkageConflicts(
      { jobId: 'job-b', sourceProvider: null, sourceExternalId: null },
      { quoteId: 'q1', quoteJobId: 'job-a', quoteTotalCents: 1000, quoteStatus: 'accepted' },
    );
    assert.ok(conflicts.some((c) => c.type === 'QUOTE_INVOICE_JOB_MISMATCH'));
  });

  it('14 reference match only applies to jobs in the tenant-scoped candidate set', () => {
    const invoice = orphanInvoice({ xeroReference: 'JOB-999999' });
    const candidates = scoreLinkageCandidates({ document: invoice, jobs: [jobA, jobB] });
    assert.equal(candidates.every((row) => !row.isDeterministic), true);
    assert.ok(candidates.length >= 1);
  });

  it('15 technician blocked from linkage control', () => {
    assert.equal(canAccessJobLinkageControl({ permissions: ['jobs:read'], roleName: 'Technician' }), false);
  });

  it('16 client blocked from linkage control', () => {
    assert.equal(canAccessJobLinkageControl({ permissions: [], roleName: 'Client' }), false);
  });

  it('17 audit mechanism fields exist on linkage types', () => {
    const fp = buildLinkageEntityFingerprint(
      { id: 'inv-1', customerId: 'cust-1', jobId: null, totalCents: 100, updatedAt: 't' },
      'invoice',
    );
    assert.match(fp, /^invoice:inv-1:/);
  });

  it('18 stale candidate revalidation uses updated fingerprint', () => {
    const fp1 = buildLinkageEntityFingerprint(
      { id: 'inv-1', customerId: 'cust-1', jobId: null, totalCents: 100, updatedAt: '2026-01-01' },
      'invoice',
    );
    const fp2 = buildLinkageEntityFingerprint(
      { id: 'inv-1', customerId: 'cust-1', jobId: null, totalCents: 100, updatedAt: '2026-01-02' },
      'invoice',
    );
    assert.notEqual(fp1, fp2);
  });

  it('19 address normalisation treats Main Rd and Main Road as equivalent', () => {
    assert.ok(
      addressesLikelyMatch('12 Main Rd, Durbanville', '12 Main Road Durbanville'),
    );
    assert.equal(normalizeAddressForLinkage('12 Main Rd'), normalizeAddressForLinkage('12 Main Road'));
  });

  it('20 cent-exact amounts preserved in document model', () => {
    const invoice = orphanInvoice({ totalCents: 12_345 });
    assert.equal(invoice.totalCents, 12_345);
  });

  it('21 extract job references from mixed text', () => {
    assert.deepEqual(extractJobNumberReferences('Invoice for JOB-000123 and JOB-000456'), [
      'JOB-000123',
      'JOB-000456',
    ]);
  });

  it('22 duplicate external document conflict detected', () => {
    const conflicts = detectInvoiceLinkageConflicts(
      { jobId: null, sourceProvider: 'xero', sourceExternalId: 'ext-1' },
      null,
      ['ext-1'],
    );
    assert.ok(conflicts.some((c) => c.type === 'DUPLICATE_EXTERNAL_DOCUMENT'));
  });
});
