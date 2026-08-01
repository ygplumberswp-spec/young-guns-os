import { Link, useLocation } from 'wouter';

import { UX_INVENTORY_LABELS } from '../../lib/ux-labels';

const tabs = [
  { href: '/inventory/products', label: UX_INVENTORY_LABELS.products },
  { href: '/inventory/stock', label: UX_INVENTORY_LABELS.stock },
  { href: '/inventory/movements', label: UX_INVENTORY_LABELS.stockHistory },
];

export function InventoryNav() {
  const [location] = useLocation();

  return (
    <nav className="inventory-nav" aria-label="Inventory sections">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`inventory-nav__link ${location.startsWith(tab.href) ? 'inventory-nav__link--active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
      <Link href="/procurement" className="inventory-nav__link">
        Procurement →
      </Link>
    </nav>
  );
}
