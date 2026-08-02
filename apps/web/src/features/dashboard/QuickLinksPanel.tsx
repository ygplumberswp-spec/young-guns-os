import { Link } from 'wouter';
import { hasAnyPermission } from '@titan/auth/browser';
import { Panel } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';

type QuickLink = {
  href: string;
  label: string;
  tone: 'job' | 'quote' | 'invoice' | 'customers' | 'schedule' | 'inventory' | 'fleet' | 'reports';
  permissions: string[];
};

const QUICK_LINKS: QuickLink[] = [
  { href: '/jobs/new', label: 'New Job', tone: 'job', permissions: ['jobs:write', '*'] },
  { href: '/finance/quotes/new', label: 'New Quote', tone: 'quote', permissions: ['finance:write', '*'] },
  {
    href: '/finance/invoices/new',
    label: 'New Invoice',
    tone: 'invoice',
    permissions: ['finance:write', '*'],
  },
  { href: '/crm', label: 'Customers', tone: 'customers', permissions: ['customers:read', 'customers:write', '*'] },
  {
    href: '/scheduling',
    label: 'Schedule',
    tone: 'schedule',
    permissions: ['dispatch:read', 'jobs:read', '*'],
  },
  {
    href: '/inventory/products',
    label: 'Inventory',
    tone: 'inventory',
    permissions: ['inventory:read', 'inventory:write', '*'],
  },
  { href: '/fleet', label: 'Fleet', tone: 'fleet', permissions: ['fleet:read', 'fleet:write', '*'] },
  {
    href: '/analytics',
    label: 'Reports',
    tone: 'reports',
    permissions: ['analytics:read', 'intelligence:read', '*'],
  },
];

export function QuickLinksPanel() {
  const { user } = useAuth();
  if (!user) return null;

  const links = QUICK_LINKS.filter((link) => hasAnyPermission(user.permissions, link.permissions));
  if (links.length === 0) return null;

  return (
    <Panel title="Quick links" description="Jump into common owner actions">
      <div className="exec-quick-links">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`exec-quick-links__item exec-quick-links__item--${link.tone}`}
          >
            <span className="exec-quick-links__icon" aria-hidden="true" />
            <span className="exec-quick-links__label">{link.label}</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
