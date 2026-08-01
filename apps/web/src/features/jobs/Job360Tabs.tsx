import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { EmptyState, Panel } from '@titan/ui';
import type {
  JobDetail,
  JobExecutionSummary,
  JobFinanceSummary,
  JobMaterialLineSummary,
  PurchaseOrderSummary,
} from '@titan/shared';
import {
  JOB_PAYMENT_STATE_LABELS,
  deriveJobLifecycleLabel,
  formatMoney,
} from '@titan/shared';

export type Job360TabId =
  | 'overview'
  | 'schedule'
  | 'job-card'
  | 'checklist'
  | 'photos'
  | 'notes'
  | 'materials'
  | 'time'
  | 'quote'
  | 'invoice'
  | 'payment'
  | 'signature'
  | 'coc'
  | 'documents'
  | 'communications'
  | 'activity';

export const JOB_360_TABS: Array<{ id: Job360TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'job-card', label: 'Job Card' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'photos', label: 'Photos' },
  { id: 'notes', label: 'Notes' },
  { id: 'materials', label: 'Materials' },
  { id: 'time', label: 'Time' },
  { id: 'quote', label: 'Quote' },
  { id: 'invoice', label: 'Invoice' },
  { id: 'payment', label: 'Payment' },
  { id: 'signature', label: 'Signature' },
  { id: 'coc', label: 'COC' },
  { id: 'documents', label: 'Documents' },
  { id: 'communications', label: 'Communications' },
  { id: 'activity', label: 'Activity' },
];

type Job360TabsProps = {
  job: JobDetail;
  execution: JobExecutionSummary | null;
  financeSummary: JobFinanceSummary | null;
  materialLines: JobMaterialLineSummary[];
  purchaseOrders: PurchaseOrderSummary[];
  canViewFinance: boolean;
  overviewPanel: ReactNode;
  schedulePanel: ReactNode;
  jobCardPanel: ReactNode;
  materialsPanel: ReactNode;
  financePanel: ReactNode;
  documentsPanel: ReactNode;
  compliancePanel: ReactNode;
  documentPackPanel: ReactNode | null;
};

function formatLedgerMoney(cents: number | null | undefined, currency: string): string {
  if (cents == null) return '—';
  return formatMoney(cents, currency);
}

export function Job360Tabs({
  job,
  execution,
  financeSummary,
  materialLines,
  purchaseOrders,
  canViewFinance,
  overviewPanel,
  schedulePanel,
  jobCardPanel,
  materialsPanel,
  financePanel,
  documentsPanel,
  compliancePanel,
  documentPackPanel,
}: Job360TabsProps) {
  const [activeTab, setActiveTab] = useState<Job360TabId>('overview');

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    const tabId = hash.split('/')[0];
    if (JOB_360_TABS.some((tab) => tab.id === tabId)) {
      setActiveTab(tabId as Job360TabId);
    }
  }, [job.id]);

  const ledger = financeSummary?.ledger ?? null;
  const lifecycleLabel = useMemo(() => {
    if (!ledger) return null;
    return deriveJobLifecycleLabel({
      status: job.status,
      executionPhase: execution?.executionPhase ?? job.executionPhase,
      quotes: financeSummary?.quotes ?? [],
      invoices: financeSummary?.invoices ?? [],
      ledger,
    });
  }, [execution?.executionPhase, financeSummary, job.executionPhase, job.status, ledger]);

  function selectTab(tabId: Job360TabId) {
    setActiveTab(tabId);
    window.history.replaceState(null, '', `#${tabId}`);
  }

  const photoEvidence =
    execution?.evidence?.filter((doc) => doc.documentationType?.toLowerCase().includes('photo')) ??
    [];

  return (
    <div className="customer-360 job-360">
      <nav className="customer-360__tabs" aria-label="Job 360 sections">
        {JOB_360_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`customer-360__tab${activeTab === tab.id ? ' customer-360__tab--active' : ''}`}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <div className="customer-360__stack">
          {overviewPanel}
          <Panel title="Lifecycle & payment">
            <dl className="crm-detail-list job-finance-ledger">
              <div>
                <dt>Lifecycle</dt>
                <dd>{lifecycleLabel ?? formatJobStatus(job.status)}</dd>
              </div>
              {canViewFinance ? (
                <>
                  <div>
                    <dt>Payment state</dt>
                    <dd>
                      {ledger?.hasFinanceData
                        ? ledger.paymentStateLabel
                        : 'No finance records linked'}
                    </dd>
                  </div>
                  <div>
                    <dt>Job total</dt>
                    <dd>
                      {ledger?.hasFinanceData
                        ? formatLedgerMoney(ledger.jobTotalCents, ledger.currency)
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Balance owing</dt>
                    <dd>
                      {ledger?.balanceOwingCents != null
                        ? formatLedgerMoney(ledger.balanceOwingCents, ledger?.currency ?? 'ZAR')
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Last payment</dt>
                    <dd>
                      {ledger?.lastPaymentAt
                        ? new Date(ledger.lastPaymentAt).toLocaleDateString()
                        : '—'}
                    </dd>
                  </div>
                </>
              ) : (
                <div>
                  <dt>Finance</dt>
                  <dd>Payment details require finance permission.</dd>
                </div>
              )}
            </dl>
          </Panel>
        </div>
      ) : null}

      {activeTab === 'schedule' ? schedulePanel : null}
      {activeTab === 'job-card' ? jobCardPanel : null}

      {activeTab === 'checklist' ? (
        <Panel title="Checklist">
          {execution?.completionGate ? (
            <ul className="crm-activity-list">
              {execution.completionGate.missing.length === 0 ? (
                <li className="crm-activity-item">All required checklist items complete.</li>
              ) : (
                execution.completionGate.missing.map((item) => (
                  <li key={item} className="crm-activity-item">
                    Pending: {item.replace(/_/g, ' ')}
                  </li>
                ))
              )}
            </ul>
          ) : (
            <EmptyState
              title="Checklist unavailable"
              description="Field execution summary is not available for this job yet."
            />
          )}
        </Panel>
      ) : null}

      {activeTab === 'photos' ? (
        <Panel title="Photos">
          {photoEvidence.length === 0 ? (
            <EmptyState title="No photos" description="No field photo evidence uploaded yet." />
          ) : (
            <ul className="crm-activity-list">
              {photoEvidence.map((doc) => (
                <li key={doc.id} className="crm-activity-item">
                  <strong>{doc.title}</strong>
                  <p className="crm-activity-item__meta">{doc.evidencePhase ?? doc.documentationType}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'notes' ? (
        <Panel title="Notes">
          <dl className="jobs-detail-list">
            <div>
              <dt>Internal notes</dt>
              <dd>{job.notes ?? '—'}</dd>
            </div>
            <div>
              <dt>Customer-visible notes</dt>
              <dd>{job.customerVisibleNotes ?? '—'}</dd>
            </div>
            <div>
              <dt>Access instructions</dt>
              <dd>{job.accessInstructions ?? '—'}</dd>
            </div>
          </dl>
        </Panel>
      ) : null}

      {activeTab === 'materials' ? materialsPanel : null}

      {activeTab === 'time' ? (
        <Panel title="Time">
          {execution?.labour.entryCount ? (
            <dl className="crm-detail-list">
              <div>
                <dt>Labour entries</dt>
                <dd>{execution.labour.entryCount}</dd>
              </div>
              <div>
                <dt>Total minutes</dt>
                <dd>{execution.labour.totalMinutes}</dd>
              </div>
            </dl>
          ) : (
            <EmptyState
              title="No time recorded"
              description="Job-linked labour time will appear here once technicians log time on site."
            />
          )}
        </Panel>
      ) : null}

      {activeTab === 'quote' || activeTab === 'invoice' || activeTab === 'payment' ? (
        canViewFinance ? (
          <div className="customer-360__stack">
            {financePanel}
            {activeTab === 'payment' && ledger ? (
              <Panel title="Payment ledger">
                <FinanceLedgerGrid ledger={ledger} payments={financeSummary?.payments ?? []} />
              </Panel>
            ) : null}
          </div>
        ) : (
          <EmptyState
            title="Finance permission required"
            description="You do not have permission to view quote, invoice or payment details."
          />
        )
      ) : null}

      {activeTab === 'signature' ? (
        <Panel title="Signature">
          {execution?.completionGate.canComplete ? (
            <p className="page-muted">Signature captured as part of completion gate.</p>
          ) : (
            <EmptyState title="No signature" description="Customer signature not captured yet." />
          )}
        </Panel>
      ) : null}

      {activeTab === 'coc' ? compliancePanel : null}
      {activeTab === 'documents' ? (
        <div className="customer-360__stack">
          {documentsPanel}
          {documentPackPanel}
        </div>
      ) : null}

      {activeTab === 'communications' ? (
        <EmptyState
          title="Communications"
          description="Job-scoped communications inbox is not wired yet. Use customer communications from CRM."
          action={
            <Link href={`/crm/${job.customerId}#communications`} className="crm-link">
              Open customer communications
            </Link>
          }
        />
      ) : null}

      {activeTab === 'activity' ? (
        <Panel title="Activity">
          <dl className="crm-detail-list">
            <div>
              <dt>Created</dt>
              <dd>{new Date(job.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{new Date(job.updatedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Materials lines</dt>
              <dd>{materialLines.length}</dd>
            </div>
            <div>
              <dt>Purchase orders</dt>
              <dd>{purchaseOrders.length}</dd>
            </div>
          </dl>
        </Panel>
      ) : null}
    </div>
  );
}

function FinanceLedgerGrid({
  ledger,
  payments,
}: {
  ledger: NonNullable<JobFinanceSummary['ledger']>;
  payments: JobFinanceSummary['payments'];
}) {
  return (
    <>
      <dl className="crm-detail-list job-finance-ledger">
        <div>
          <dt>Quoted</dt>
          <dd>{formatLedgerMoney(ledger.quotedCents, ledger.currency)}</dd>
        </div>
        <div>
          <dt>Approved quote</dt>
          <dd>{formatLedgerMoney(ledger.approvedQuoteCents, ledger.currency)}</dd>
        </div>
        <div>
          <dt>Invoice total</dt>
          <dd>{formatLedgerMoney(ledger.invoiceTotalCents, ledger.currency)}</dd>
        </div>
        <div>
          <dt>Deposit required</dt>
          <dd>{formatLedgerMoney(ledger.depositRequiredCents, ledger.currency)}</dd>
        </div>
        <div>
          <dt>Deposit paid</dt>
          <dd>{formatLedgerMoney(ledger.depositPaidCents, ledger.currency)}</dd>
        </div>
        <div>
          <dt>Total received</dt>
          <dd>{formatLedgerMoney(ledger.totalReceivedCents, ledger.currency)}</dd>
        </div>
        <div>
          <dt>Credits</dt>
          <dd>{ledger.creditsCents != null ? formatLedgerMoney(ledger.creditsCents, ledger.currency) : '—'}</dd>
        </div>
        <div>
          <dt>Refunds</dt>
          <dd>{ledger.refundsCents != null ? formatLedgerMoney(ledger.refundsCents, ledger.currency) : '—'}</dd>
        </div>
        <div>
          <dt>Write-offs</dt>
          <dd>{ledger.writeOffsCents != null ? formatLedgerMoney(ledger.writeOffsCents, ledger.currency) : '—'}</dd>
        </div>
        <div>
          <dt>Balance</dt>
          <dd>{formatLedgerMoney(ledger.balanceOwingCents, ledger.currency)}</dd>
        </div>
        <div>
          <dt>Overdue</dt>
          <dd>{formatLedgerMoney(ledger.overdueCents, ledger.currency)}</dd>
        </div>
        <div>
          <dt>Next due date</dt>
          <dd>{ledger.nextDueDate ? new Date(ledger.nextDueDate).toLocaleDateString() : '—'}</dd>
        </div>
        <div>
          <dt>Payment state</dt>
          <dd>{JOB_PAYMENT_STATE_LABELS[ledger.paymentState]}</dd>
        </div>
        <div>
          <dt>Payment count</dt>
          <dd>{ledger.paymentCount}</dd>
        </div>
      </dl>
      {payments.length > 0 ? (
        <table className="inventory-table" style={{ marginTop: '1rem' }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{new Date(payment.paidAt).toLocaleDateString()}</td>
                <td>
                  <Link href={`/finance/invoices/${payment.invoiceId}`} className="jobs-link">
                    {payment.invoiceNumber}
                  </Link>
                </td>
                <td>{formatMoney(payment.amountCents, payment.currency)}</td>
                <td>{payment.method.replace(/_/g, ' ')}</td>
                <td>{payment.reference ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="page-muted">No payments recorded for this job yet.</p>
      )}
    </>
  );
}

function formatJobStatus(status: JobDetail['status']): string {
  return status.replace(/_/g, ' ');
}
