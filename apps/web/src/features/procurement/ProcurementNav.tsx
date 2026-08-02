import { UI_VOCABULARY } from '@titan/shared';
import { Link, useLocation } from 'wouter';

const tabs = [
  { href: '/procurement/flow', label: UI_VOCABULARY.procureToPay },
  { href: '/procurement', label: UI_VOCABULARY.purchaseOrders },
  { href: '/procurement/suppliers', label: 'Suppliers' },
  { href: '/procurement/price-lists', label: UI_VOCABULARY.priceLists },
  { href: '/procurement/parts-requests', label: UI_VOCABULARY.partsRequests },
];

export function ProcurementNav() {
  const [location] = useLocation();

  return (
    <nav className="inventory-nav" aria-label="Procurement sections">
      {tabs.map((tab) => {
        const isActive =
          tab.href === '/procurement'
            ? location === '/procurement' || location.startsWith('/procurement/purchase-orders')
            : location === tab.href || location.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inventory-nav__link ${isActive ? 'inventory-nav__link--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
