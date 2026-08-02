import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { EmptyState, Panel } from '@titan/ui';
import type {
  JobDetail,
  JobExecutionSummary,
  JobFinanceSummary,
  JobMaterialLineSummary,
  JobTimelineEventSummary,
  PurchaseOrderSummary,
} from '@titan/shared';
import {
  JOB_PAYMENT_STATE_LABELS,
  deriveJobLifecycleLabel,
  formatMoney,
} from '@titan/shared';
import { JOB_360_TABS, type Job360TabId } from './job-360-tabs';
import { PropertyMapPanel } from './PropertyMapPanel';

export type { Job360TabId };
export { JOB_360_TABS };

type Job360TabsProps = {
  job: JobDetail;
  execution: JobExecutionSummary | null;
  financeSummary: JobFinanceSummary | null;
  materialLines: JobMaterialLineSummary[];
  purchaseOrders: PurchaseOrderSummary[];
  timeline: JobTimelineEventSummary[];
  canViewFinance: boolean;
  canViewInternalNotes: boolean;
  overviewPanel: ReactNode;
  schedulePanel: ReactNode;
  jobCardPanel: ReactNode;
  materialsPanel: ReactNode;
  financePanel: ReactNode;
  documentsPanel: ReactNode;
  compliancePanel: ReactNode;
};

function formatLedgerMoney(cents: number | null | undefined, currency: string): string {
  if (cents == null) return '—';
  return formatMoney(cents, currency);
}

function formatEventLabel(action: string): string {
  return action.replace(/_/g, ' ');
}

export function Job360Tabs({
  job,
  execution,
  financeSummary,
  materialLines,
  purchaseOrders,
  timeline,
  canViewFinance,
  canViewInternalNotes,
  overviewPanel,
  schedulePanel,
  jobCardPanel,
  materialsPanel,
  financePanel,
  documentsPanel,
  compliancePanel,
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
      executionPhase: execution?.executionPhase ?? null,
      quotes: financeSummary?.quotes ?? [],
      invoices: financeSummary?.invoices ?? [],
      ledger,
    });
  }, [execution?.executionPhase, financeSummary, job.status, ledger]);

  function selectTab(tabId: Job360TabId) {
    setActiveTab(tabId);
    window.history.replaceState(null, '', `#${tabId}`);
  }

  const photoEvidence =
    execution?.evidence?.filter(
      (doc) =>
        doc.documentationType.toLowerCase().includes('photo') ||
        doc.evidencePhase === 'before' ||
        doc.evidencePhase === 'after',
    ) ?? [];

  const signatureEvidence =
    execution?.evidence?.filter((doc) =>
      doc.documentationType.toLowerCase().includes('signature'),
    ) ?? [];

  const cocEvidence =
    execution?.evidence?.filter(
      (doc) =>
        doc.documentationType.toLowerCase().includes('coc') ||
        doc.documentationType.toLowerCase().includes('compliance') ||
        doc.documentationType.toLowerCase().includes('warranty'),
    ) ?? [];

  const isCompleted = job.status === 'completed';

  return (
    <div className="customer-360 job-360">
      {isCompleted ? (
        <p className="job-360__banner" role="status">
          This job is completed. Final execution evidence is preserved in the completion snapshot.
          Structural edits require reopen with a reason; permitted note updates are audited as
          post-completion.
        </p>
      ) : null}

      <nav className="customer-360__tabs" aria-label="Job 360 Sections">
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
          <Panel title="Lifecycle & Payment">
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
                        ? formatLedgerMoney(ledger.balanceOwingCents, ledger.currency)
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
          {execution?.completionSnapshot ? (
            <Panel title="Completion Snapshot">
              <dl className="jobs-detail-list">
                <div>
                  <dt>Snapshot id</dt>
                  <dd>{execution.completionSnapshot.id}</dd>
                </div>
                <div>
                  <dt>Completed at</dt>
                  <dd>{new Date(execution.completionSnapshot.createdAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Completed by</dt>
                  <dd>{execution.completionSnapshot.completedByUserId}</dd>
                </div>
              </dl>
              <p className="page-muted">
                Immutable evidence package captured at gated completion. Post-completion updates do
                not overwrite this snapshot.
              </p>
            </Panel>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'property-map' ? (
        <PropertyMapPanel
          streetAddress={job.address.display}
          latitude={job.address.latitude}
          longitude={job.address.longitude}
          placeId={job.address.placeId}
          formattedAddress={job.address.formattedAddress}
          assignedUserName={job.assignedUserName}
          cameraContextKey={job.id}
        />
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
              title="Checklist Unavailable"
              description="Field execution summary is not available for this job yet."
            />
          )}
        </Panel>
      ) : null}

      {activeTab === 'photos' ? (
        <Panel title="Photos & Evidence">
          {photoEvidence.length === 0 ? (
            <EmptyState title="No Photos" description="No field photo evidence uploaded yet." />
          ) : (
            <ul className="crm-activity-list">
              {photoEvidence.map((doc) => (
                <li key={doc.id} className="crm-activity-item">
                  <strong>{doc.title}</strong>
                  <p className="crm-activity-item__meta">
                    {doc.evidencePhase ?? doc.documentationType}
                    {doc.hasBinary ? ' · binary stored' : ' · metadata only'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'notes' ? (
        <Panel title="Notes">
          <dl className="jobs-detail-list">
            {canViewInternalNotes ? (
              <div>
                <dt>Internal notes</dt>
                <dd>{job.notes ?? '—'}</dd>
              </div>
            ) : (
              <div>
                <dt>Internal notes</dt>
                <dd>Hidden — requires job write permission.</dd>
              </div>
            )}
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
              title="No Time Recorded"
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
              <Panel title="Payment Ledger">
                <FinanceLedgerGrid ledger={ledger} payments={financeSummary?.payments ?? []} />
              </Panel>
            ) : null}
          </div>
        ) : (
          <EmptyState
            title="Finance Permission Required"
            description="You do not have permission to view quote, invoice or payment details."
          />
        )
      ) : null}

      {activeTab === 'signature' ? (
        <Panel title="Signature">
          {signatureEvidence.length > 0 ? (
            <ul className="crm-activity-list">
              {signatureEvidence.map((doc) => (
                <li key={doc.id} className="crm-activity-item">
                  <strong>{doc.title}</strong>
                  <p className="crm-activity-item__meta">
                    {doc.createdAt ? new Date(doc.createdAt).toLocaleString() : doc.documentationType}
                  </p>
                </li>
              ))}
            </ul>
          ) : execution?.completionGate.missing.includes('signature_or_reason') ? (
            <EmptyState
              title="No Signature"
              description="Customer signature not captured yet (or unavailable reason not recorded)."
            />
          ) : (
            <p className="page-muted">
              Signature requirement satisfied in the completion gate
              {isCompleted ? ' / completion snapshot.' : '.'}
            </p>
          )}
        </Panel>
      ) : null}

      {activeTab === 'coc' ? (
        <div className="customer-360__stack">
          {compliancePanel}
          {cocEvidence.length > 0 ? (
            <Panel title="COC / Compliance Evidence">
              <ul className="crm-activity-list">
                {cocEvidence.map((doc) => (
                  <li key={doc.id} className="crm-activity-item">
                    <strong>{doc.title}</strong>
                    <p className="crm-activity-item__meta">{doc.documentationType}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'documents' ? documentsPanel : null}

      {activeTab === 'communications' ? (
        <EmptyState
          title="Communications"
          description="Job-scoped communications use the existing customer communications path."
          action={
            <Link href={`/crm/${job.customerId}#communications`} className="jobs-link">
              Open customer communications
            </Link>
          }
        />
      ) : null}

      {activeTab === 'activity' ? (
        <Panel title="Operational Timeline">
          <dl className="crm-detail-list" style={{ marginBottom: '1rem' }}>
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
            {execution?.completionSnapshot ? (
              <div>
                <dt>Completed (snapshot)</dt>
                <dd>{new Date(execution.completionSnapshot.createdAt).toLocaleString()}</dd>
              </div>
            ) : null}
          </dl>
          {timeline.length === 0 ? (
            <EmptyState
              title="No Workflow Events Yet"
              description="Booking, assignment, arrival, materials, and completion events appear here as they are recorded."
            />
          ) : (
            <ul className="crm-activity-list">
              {timeline.map((event) => (
                <li key={event.id} className="crm-activity-item">
                  <strong>{formatEventLabel(event.action)}</strong>
                  <p className="crm-activity-item__meta">
                    {new Date(event.createdAt).toLocaleString()}
                    {event.userName ? ` · ${event.userName}` : ''}
                    {event.fromStatus || event.toStatus
                      ? ` · ${event.fromStatus ?? '—'} → ${event.toStatus ?? '—'}`
                      : ''}
                    {event.fromPhase || event.toPhase
                      ? ` · ${event.fromPhase ?? '—'} → ${event.toPhase ?? '—'}`
                      : ''}
                    {event.reason ? ` · ${event.reason}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
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
          <dd>
            {ledger.creditsCents != null
              ? formatLedgerMoney(ledger.creditsCents, ledger.currency)
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Refunds</dt>
          <dd>
            {ledger.refundsCents != null
              ? formatLedgerMoney(ledger.refundsCents, ledger.currency)
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Write-offs</dt>
          <dd>
            {ledger.writeOffsCents != null
              ? formatLedgerMoney(ledger.writeOffsCents, ledger.currency)
              : '—'}
          </dd>
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
