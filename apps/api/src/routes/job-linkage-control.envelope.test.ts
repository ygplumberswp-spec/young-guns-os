import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('JPE-003 job linkage control route envelope', () => {
  it('exposes finance job-linkage-control queue endpoint', () => {
    const routeSource = readSource('src/routes/job-linkage-control.ts');
    assert.ok(routeSource.includes("'/job-linkage-control'"));
    assert.ok(routeSource.includes('canAccessJobLinkageControl'));
    assert.ok(routeSource.includes('denyTechnicianClient'));
  });

  it('exposes candidate and link endpoints for invoices and quotes', () => {
    const routeSource = readSource('src/routes/job-linkage-control.ts');
    assert.ok(routeSource.includes("'/linkage/invoices/:invoiceId/candidates'"));
    assert.ok(routeSource.includes("'/linkage/quotes/:quoteId/candidates'"));
    assert.ok(routeSource.includes("'/linkage/invoices/:invoiceId/link'"));
    assert.ok(routeSource.includes("'/linkage/quotes/:quoteId/link'"));
    assert.ok(routeSource.includes("'/linkage/invoices/:invoiceId/unlink'"));
    assert.ok(routeSource.includes("'/linkage/reject'"));
  });

  it('wires JobLinkageControlService in index bootstrap', () => {
    const indexSource = readSource('src/index.ts');
    assert.ok(indexSource.includes('JobLinkageControlService'));
    assert.ok(indexSource.includes('createJobLinkageControlRouter'));
  });

  it('native finance flows preserve job linkage in FinanceService', () => {
    const financeSource = readSource('src/services/finance.service.ts');
    assert.ok(financeSource.includes('jobId: quote.jobId'));
    assert.ok(financeSource.includes('jobId: sanitized.jobId'));
    assert.ok(financeSource.includes('createInvoiceFromJob'));
  });
});
