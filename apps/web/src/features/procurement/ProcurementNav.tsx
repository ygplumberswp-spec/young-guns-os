import { Link, useLocation } from 'wouter';

const tabs = [
  { href: '/procurement/flow', label: 'Procure-to-pay' },
  { href: '/procurement', label: 'Purchase orders' },
  { href: '/procurement/suppliers', label: 'Suppliers' },
  { href: '/procurement/price-lists', label: 'Price lists' },
  { href: '/procurement/parts-requests', label: 'Parts requests' },
];

export function ProcurementNav() {
  const [location] = useLocation();

  return (
    <nav className="inventory-nav" aria-label="Procurement sections">
      {tabs.map((tab) => {
        const isActive =
          tab.href === '/procurement'
            ? location === '/procurement' || location.startsWith('/procurement/purchase-orders')
            : location.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inventory-nav__link ${isActive ? 'inventory-nav__link--active' : ''}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
