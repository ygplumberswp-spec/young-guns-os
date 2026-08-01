import { Link, useLocation } from 'wouter';
import { MoreMenu } from '../../components/ux/MoreMenu';

const sectionTabs = [
  { href: '/finance/quotes', label: 'Quotes' },
  { href: '/finance/boq', label: 'BOQs' },
  { href: '/finance/invoices', label: 'Invoices' },
  { href: '/finance/payments', label: 'Payments' },
  { href: '/finance/receivables', label: 'Receivables' },
  { href: '/finance/payables', label: 'Bills & Payables' },
  { href: '/finance/cashflow', label: 'Cashflow' },
];

const secondaryItems = [
  { id: 'finance-settings', label: 'Finance settings', href: '/settings/company' },
  { id: 'numbering-rules', label: 'Numbering rules', href: '/settings/company' },
  { id: 'archived-records', label: 'Archived records', href: '/drafts?status=archived' },
  { id: 'xero-sync', label: 'Xero sync status', href: '/integrations/xero' },
  { id: 'advanced-reports', label: 'Advanced reports', href: '/analytics' },
];

export function FinanceNav() {
  const [location] = useLocation();
  const secondaryActive = secondaryItems.some((item) => {
    const base = item.href.split('?')[0] ?? item.href;
    return location === item.href || location.startsWith(`${base}`);
  });

  return (
    <nav className="ux-compact-tabs finance-nav" aria-label="Finance sections">
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
