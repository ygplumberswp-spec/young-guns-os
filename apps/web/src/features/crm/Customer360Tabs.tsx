import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, Panel } from '@titan/ui';
import type {
  CustomerDetail,
  CustomerValueClassificationSummary,
  InvoiceSummary,
  JobSummary,
  PaymentSummary,
  QuoteSummary,
} from '@titan/shared';
import {
  CUSTOMER_VALUE_CLASSIFICATION_LABELS,
  formatListMoney,
  formatMoney,
} from '@titan/shared';
import { fetchInvoices, fetchPayments, fetchQuotes } from '../../lib/finance-api';
import { fetchJobs } from '../../lib/jobs-api';

export type Customer360TabId =
  | 'overview'
  | 'properties'
  | 'jobs'
  | 'quotes'
  | 'invoices'
  | 'payments'
  | 'finance'
  | 'equipment'
  | 'communications'
  | 'documents'
  | 'maintenance'
  | 'activity';

export const CUSTOMER_360_TABS: Array<{ id: Customer360TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'properties', label: 'Properties' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'payments', label: 'Payments' },
  { id: 'finance', label: 'Finance' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'communications', label: 'Communications' },
  { id: 'documents', label: 'Documents' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'activity', label: 'Activity' },
];

type Customer360TabsProps = {
  customerId: string;
  customer: CustomerDetail;
  accessToken: string;
  classification: CustomerValueClassificationSummary | null;
  propertiesPanel: ReactNode;
  communicationsPanel: ReactNode;
  activityPanel: ReactNode;
  profilePanel: ReactNode;
};

export function Customer360Tabs({
  customerId,
  customer,
  accessToken,
  classification,
  propertiesPanel,
  communicationsPanel,
  activityPanel,
  profilePanel,
}: Customer360TabsProps) {
  const [activeTab, setActiveTab] = useState<Customer360TabId>('overview');
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [loadingFinance, setLoadingFinance] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (CUSTOMER_360_TABS.some((tab) => tab.id === hash)) {
      setActiveTab(hash as Customer360TabId);
    }
  }, [customerId]);

  useEffect(() => {
    if (!['jobs', 'quotes', 'invoices', 'payments', 'finance'].includes(activeTab)) return;

    let cancelled = false;
    async function loadFinanceContext() {
      setLoadingFinance(true);
      try {
        const [allJobs, allQuotes, allInvoices, allPayments] = await Promise.all([
          fetchJobs(accessToken),
          fetchQuotes(accessToken),
          fetchInvoices(accessToken),
          fetchPayments(accessToken),
        ]);
        if (cancelled) return;
        const customerJobs = allJobs.filter((job) => job.customerId === customerId);
        const customerQuotes = allQuotes.filter((quote) => quote.customerId === customerId);
        const customerInvoices = allInvoices.filter((invoice) => invoice.customerId === customerId);
        const invoiceIds = new Set(customerInvoices.map((invoice) => invoice.id));
        setJobs(customerJobs);
        setQuotes(customerQuotes);
        setInvoices(customerInvoices);
        setPayments(allPayments.filter((payment) => invoiceIds.has(payment.invoiceId)));
      } finally {
        if (!cancelled) setLoadingFinance(false);
      }
    }
    void loadFinanceContext();
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeTab, customerId]);

  const valueLabel = useMemo(
    () =>
      classification
        ? CUSTOMER_VALUE_CLASSIFICATION_LABELS[classification.primaryClassification]
        : 'Not classified',
    [classification],
  );

  function selectTab(tabId: Customer360TabId) {
    setActiveTab(tabId);
    window.history.replaceState(null, '', `#${tabId}`);
  }

  return (
    <div className="customer-360">
      <nav className="customer-360__tabs" aria-label="Customer 360 sections">
        {CUSTOMER_360_TABS.map((tab) => (
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
          {profilePanel}
          <Panel title="Customer value">
            <dl className="crm-detail-list">
              <div>
                <dt>Classification</dt>
                <dd>{valueLabel}</dd>
              </div>
              <div>
                <dt>Outstanding</dt>
                <dd>{classification ? formatListMoney(classification.outstandingCents) : '—'}</dd>
              </div>
              <div>
                <dt>Overdue</dt>
                <dd>
                  {classification && classification.overdueOutstandingCents > 0
                    ? formatListMoney(classification.overdueOutstandingCents)
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Last job</dt>
                <dd>
                  {customer.lastJobAt
                    ? `${customer.lastJobNumber ?? 'Job'} · ${new Date(customer.lastJobAt).toLocaleDateString()}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Next action</dt>
                <dd>{customer.nextAction ?? '—'}</dd>
              </div>
            </dl>
          </Panel>
        </div>
      ) : null}

      {activeTab === 'properties' ? propertiesPanel : null}

      {activeTab === 'jobs' ? (
        <Panel title="Jobs">
          {loadingFinance ? (
            <LoadingState label="Loading jobs…" />
          ) : jobs.length === 0 ? (
            <EmptyState title="No jobs" description="No jobs linked to this customer yet." />
          ) : (
            <ul className="crm-activity-list">
              {jobs.map((job) => (
                <li key={job.id} className="crm-activity-item">
                  <Link href={`/jobs/${job.id}`} className="crm-link">
                    {job.jobNumber ?? job.title}
                  </Link>
                  <p className="crm-activity-item__meta">
                    {job.status} · {job.scheduledAt ? new Date(job.scheduledAt).toLocaleDateString() : 'Unscheduled'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'quotes' ? (
        <FinanceListPanel
          loading={loadingFinance}
          emptyTitle="No quotes"
          items={quotes.map((quote) => ({
            id: quote.id,
            href: `/finance/quotes/${quote.id}`,
            label: quote.quoteNumber ?? quote.title,
            meta: `${quote.status} · ${formatMoney(quote.amountCents, quote.currency)}`,
          }))}
        />
      ) : null}

      {activeTab === 'invoices' ? (
        <FinanceListPanel
          loading={loadingFinance}
          emptyTitle="No invoices"
          items={invoices.map((invoice) => ({
            id: invoice.id,
            href: `/finance/invoices/${invoice.id}`,
            label: invoice.invoiceNumber ?? invoice.title,
            meta: `${invoice.status} · ${formatMoney(invoice.outstandingCents, invoice.currency)} outstanding`,
          }))}
        />
      ) : null}

      {activeTab === 'payments' ? (
        <FinanceListPanel
          loading={loadingFinance}
          emptyTitle="No payments"
          items={payments.map((payment) => ({
            id: payment.id,
            href: `/finance/payments/${payment.id}`,
            label: payment.reference ?? payment.id.slice(0, 8),
            meta: `${formatMoney(payment.amountCents, payment.currency)} · ${new Date(payment.paidAt).toLocaleDateString()}`,
          }))}
        />
      ) : null}

      {activeTab === 'finance' ? (
        <Panel title="Finance summary">
          {classification ? (
            <dl className="crm-detail-list">
              <div>
                <dt>Total invoiced</dt>
                <dd>{formatListMoney(classification.totalInvoicedCents)}</dd>
              </div>
              <div>
                <dt>Cash received</dt>
                <dd>{formatListMoney(classification.cashReceivedCents)}</dd>
              </div>
              <div>
                <dt>Outstanding</dt>
                <dd>{formatListMoney(classification.outstandingCents)}</dd>
              </div>
              <div>
                <dt>Qualifying invoices</dt>
                <dd>{classification.qualifyingInvoiceCount}</dd>
              </div>
            </dl>
          ) : (
            <EmptyState title="Finance data unavailable" description="Customer value metrics could not be loaded." />
          )}
          <div className="crm-form__actions">
            <Link href="/finance/receivables">
              <Button variant="secondary">Open receivables</Button>
            </Link>
          </div>
        </Panel>
      ) : null}

      {activeTab === 'equipment' ? (
        <Panel title="Equipment">
          <EmptyState
            title="No customer equipment on file"
            description="Equipment registered to this customer's properties appears here when asset records exist."
            action={
              <Link href="/asset-equipment">
                <Button variant="secondary">Asset & equipment</Button>
              </Link>
            }
          />
        </Panel>
      ) : null}

      {activeTab === 'communications' ? communicationsPanel : null}

      {activeTab === 'documents' ? (
        <Panel title="Documents">
          <EmptyState
            title="No documents indexed"
            description="Job packs and signed documents linked to this customer's jobs appear here."
            action={
              <Link href="/documents">
                <Button variant="secondary">Documents workspace</Button>
              </Link>
            }
          />
        </Panel>
      ) : null}

      {activeTab === 'maintenance' ? (
        <Panel title="Maintenance">
          <EmptyState
            title="No maintenance schedule"
            description="Planned maintenance for this customer's properties is managed in Operations."
            action={
              <Link href="/operations">
                <Button variant="secondary">Operations</Button>
              </Link>
            }
          />
        </Panel>
      ) : null}

      {activeTab === 'activity' ? activityPanel : null}
    </div>
  );
}

function FinanceListPanel({
  loading,
  emptyTitle,
  items,
}: {
  loading: boolean;
  emptyTitle: string;
  items: Array<{ id: string; href: string; label: string; meta: string }>;
}) {
  return (
    <Panel title={emptyTitle.replace('No ', '')}>
      {loading ? (
        <LoadingState label="Loading…" />
      ) : items.length === 0 ? (
        <EmptyState title={emptyTitle} description="Nothing linked to this customer yet." />
      ) : (
        <ul className="crm-activity-list">
          {items.map((item) => (
            <li key={item.id} className="crm-activity-item">
              <Link href={item.href} className="crm-link">
                {item.label}
              </Link>
              <p className="crm-activity-item__meta">{item.meta}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
