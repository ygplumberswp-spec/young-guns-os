import { CompactTabs } from '../../components/ux';

const tabs = [
  { href: '/finance/quotes', label: 'Quotes' },
  { href: '/finance/boq', label: 'BOQs' },
  { href: '/finance/invoices', label: 'Invoices' },
  { href: '/finance/payments', label: 'Payments' },
];

export function FinanceNav() {
  return <CompactTabs tabs={tabs} ariaLabel="Finance sections" maxVisible={4} />;
}
