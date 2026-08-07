import { Link, useLocation } from 'wouter';

const tabs = [
  { href: '/procurement', label: 'Purchase Orders' },
  { href: '/procurement/suppliers', label: 'Suppliers' },
  { href: '/procurement/parts-requests', label: 'Parts Requests' },
];

export function ProcurementNav() {
  const [location] = useLocation();

  return (
    <nav className="inventory-nav" aria-label="Procurement Sections">
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
