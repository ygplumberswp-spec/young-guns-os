import { Link, useLocation } from 'wouter';
import { MoreMenu } from '../../components/ux/MoreMenu';

const sectionTabs = [
  { href: '/finance/quotes', label: 'Quotes' },
  { href: '/finance/boq', label: 'BOQs' },
  { href: '/finance/invoices', label: 'Invoices' },
  { href: '/finance/payments', label: 'Payments' },
  { href: '/finance/bank-transactions/import', label: 'Bank Transactions' },
];

const secondaryItems = [
  { id: 'finance-aura-agent', label: 'Finance AURA Agent', href: '/finance-aura-agent' },
  {
    id: 'finance-reporting-forecast',
    label: 'Reporting & Forecasting',
    href: '/finance-reporting-forecast',
  },
  {
    id: 'finance-cashflow-profit',
    label: 'Cashflow & Profit',
    href: '/finance-cashflow-profit',
  },
  { id: 'finance-settings', label: 'Finance Settings', href: '/settings/company' },
  { id: 'numbering-rules', label: 'Numbering Rules', href: '/settings/company' },
  { id: 'archived-records', label: 'Archived Records', href: '/drafts?status=archived' },
  { id: 'xero-sync', label: 'Xero Sync Status', href: '/integrations/xero' },
  { id: 'xero-writes', label: 'Xero Write Approvals', href: '/integrations/xero/write-approvals' },
  { id: 'advanced-reports', label: 'Advanced Reports', href: '/analytics' },
];

export function FinanceNav() {
  const [location] = useLocation();
  const secondaryActive = secondaryItems.some((item) => {
    const base = item.href.split('?')[0] ?? item.href;
    return location === item.href || location.startsWith(`${base}`);
  });

  return (
    <nav className="ux-compact-tabs finance-nav" aria-label="Finance Sections">
      <div className="ux-compact-tabs__row">
        {sectionTabs.map((tab) => {
          const isActive = location === tab.href || location.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`ux-compact-tabs__tab${isActive ? ' ux-compact-tabs__tab--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
        <MoreMenu
          label="More"
          items={secondaryItems}
          trigger={
            <span
              className={`ux-compact-tabs__tab ux-compact-tabs__tab--more${secondaryActive ? ' ux-compact-tabs__tab--active' : ''}`}
            >
              More
            </span>
          }
        />
      </div>
    </nav>
  );
}
