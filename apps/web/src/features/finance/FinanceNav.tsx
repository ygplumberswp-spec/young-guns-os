import { Link, useLocation } from 'wouter';

const tabs = [
  { href: '/finance/quotes', label: 'Quotes' },
  { href: '/finance/invoices', label: 'Invoices' },
  { href: '/finance/payments', label: 'Payments' },
];

export function FinanceNav() {
  const [location] = useLocation();

  return (
    <nav className="finance-nav" aria-label="Finance sections">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`finance-nav__link ${location.startsWith(tab.href) ? 'finance-nav__link--active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
