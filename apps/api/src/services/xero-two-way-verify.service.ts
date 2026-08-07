import { and, eq } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  xeroCustomerMappings,
  xeroInvoiceMappings,
  xeroPaymentMappings,
  xeroSyncLogs,
} from '@titan/db';
import type { BackgroundWorkQueueService } from './background-work-queue.service.js';

/** Read-only post-import verification — queued after Xero import GO. */
export class XeroTwoWayVerifyService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly backgroundWorkQueue?: BackgroundWorkQueueService,
  ) {}

  /**
   * Queues steps 1–2 verification work (read entities + duplicate re-import probe).
   * Steps 3–9 remain Owner-gated / staging scripts — see TITAN_XERO_TWO_WAY_VERIFY_QUEUE.md.
   */
  async queuePostImportVerification(input: {
    companyId: string;
    syncJobId: string;
  }): Promise<{ queued: boolean; workId: string | null }> {
    if (!this.backgroundWorkQueue) {
      return { queued: false, workId: null };
    }

    const workId = await this.backgroundWorkQueue.enqueueDomainFollowup({
      companyId: input.companyId,
      workType: 'xero_two_way_read_verify',
      label: 'Xero two-way read-path verification',
      trigger: 'xero.import.completed',
      idempotencyKey: `xero.two_way.read_verify:${input.syncJobId}`,
      checkpoint: {
        stage: 'queued',
        metadata: {
          syncJobId: input.syncJobId,
          verifySteps: [1, 2],
          readOnly: true,
        },
      },
    });

    return { queued: true, workId };
  }

  /** Pure read-only entity presence check — safe during/after import. */
  async summarizeReadEntityPresence(companyId: string): Promise<{
    customerMappings: number;
    invoiceMappings: number;
    paymentMappings: number;
    bankTransactionLogs: number;
    creditNoteStub: boolean;
    supplierBillStub: boolean;
  }> {
    const [customers, invoices, payments, bankLogs] = await Promise.all([
      this.db
        .select({ id: xeroCustomerMappings.id })
        .from(xeroCustomerMappings)
        .where(eq(xeroCustomerMappings.companyId, companyId)),
      this.db
        .select({ id: xeroInvoiceMappings.id })
        .from(xeroInvoiceMappings)
        .where(eq(xeroInvoiceMappings.companyId, companyId)),
      this.db
        .select({ id: xeroPaymentMappings.id })
        .from(xeroPaymentMappings)
        .where(eq(xeroPaymentMappings.companyId, companyId)),
      this.db
        .select({ id: xeroSyncLogs.id })
        .from(xeroSyncLogs)
        .where(
          and(eq(xeroSyncLogs.companyId, companyId), eq(xeroSyncLogs.entityType, 'bank_transaction')),
        ),
    ]);

    return {
      customerMappings: customers.length,
      invoiceMappings: invoices.length,
      paymentMappings: payments.length,
      bankTransactionLogs: bankLogs.length,
      creditNoteStub: true,
      supplierBillStub: true,
    };
  }
}
