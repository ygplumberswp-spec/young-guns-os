import { Link, useLocation } from 'wouter';

const tabs = [
  { href: '/inventory/overview', label: 'Workspace' },
  { href: '/inventory/products', label: 'Products' },
  { href: '/inventory/stock', label: 'Stock' },
  { href: '/inventory/movements', label: 'Movements' },
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
