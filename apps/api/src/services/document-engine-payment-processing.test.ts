/**
 * LIVE-001 — PAYMENT_PROCESSING_ENABLED must fail closed on Yoco payment-link create.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DocumentEngineError,
  DocumentEngineService,
  type DocumentActor,
} from './document-engine.service.js';

const actor: DocumentActor = {
  userId: '00000000-0000-4000-8000-000000000001',
  companyId: '00000000-0000-4000-8000-000000000002',
  roleName: 'Owner',
  permissions: ['*'],
};

describe('DocumentEngineService PAYMENT_PROCESSING_ENABLED gate (LIVE-001)', () => {
  it('defaults payment processing to disabled', () => {
    const service = new DocumentEngineService({
      db: {} as never,
      paymentLinkClientFactory: () => {
        throw new Error('Yoco client must not be constructed when payments are disabled');
      },
    });
    assert.equal(service.isPaymentProcessingEnabled(), false);
  });

  it('rejects approve/create before any Yoco call when disabled', async () => {
    let yocoCalls = 0;
    const service = new DocumentEngineService({
      db: {} as never,
      paymentProcessingEnabled: false,
      paymentLinkClientFactory: () => {
        yocoCalls += 1;
        return {
          createPaymentLink: async () => {
            throw new Error('must not create payment links');
          },
        };
      },
    });

    await assert.rejects(
      () =>
        service.approveAndCreateInvoicePaymentLink(actor, 'inv-1', {
          approvedOutstandingCents: 1000,
        }),
      (err: unknown) =>
        err instanceof DocumentEngineError &&
        err.code === 'PAYMENT_PROCESSING_DISABLED' &&
        /PAYMENT_PROCESSING_ENABLED/.test(err.message),
    );
    assert.equal(yocoCalls, 0);
  });

  it('exposes enabled state when runtime flag is true', () => {
    const service = new DocumentEngineService({
      db: {} as never,
      paymentProcessingEnabled: true,
    });
    assert.equal(service.isPaymentProcessingEnabled(), true);
  });
});
