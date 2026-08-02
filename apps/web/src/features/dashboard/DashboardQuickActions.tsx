import { Link } from 'wouter';
import { hasAnyPermission } from '@titan/auth/browser';
import { Panel } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';

type QuickAction = {
  href: string;
  label: string;
  permissions: string[];
};

const QUICK_ACTIONS: QuickAction[] = [
  { href: '/leads/new', label: 'New Lead', permissions: ['leads:write', '*'] },
  { href: '/crm/new', label: 'New Customer', permissions: ['customers:write', '*'] },
  { href: '/jobs/new', label: 'New Job', permissions: ['jobs:write', '*'] },
  { href: '/scheduling', label: 'Schedule', permissions: ['dispatch:read', 'jobs:read', '*'] },
  { href: '/finance/quotes/new', label: 'New Quote', permissions: ['finance:write', '*'] },
  { href: '/finance/invoices/new', label: 'New Invoice', permissions: ['finance:write', '*'] },
  { href: '/finance/payments/new', label: 'Record Payment', permissions: ['finance:write', '*'] },
  {
    href: '/procurement/purchase-orders/new',
    label: 'New PO',
    permissions: ['procurement:write', '*'],
  },
  { href: '/documents/new', label: 'Upload Document', permissions: ['documents:write', '*'] },
  {
    href: '/communications/messages/new',
    label: 'New Message',
    permissions: ['communications:write', '*'],
  },
  { href: '/aura', label: 'Ask AURA', permissions: ['agents:read', 'aura:read', '*'] },
  {
    href: '/global-search',
    label: 'Search Workspace',
    permissions: ['search:read', 'intelligence:read', 'ops:read', '*'],
  },
];

export function DashboardQuickActions() {
  const { user } = useAuth();
  if (!user) return null;

  const actions = QUICK_ACTIONS.filter((action) =>
    hasAnyPermission(user.permissions, action.permissions),
  );

  if (actions.length === 0) return null;

  return (
    <Panel title="Quick Actions" description="Jump straight into common operational tasks">
      <div className="dashboard-quick-actions">
        {actions.map((action) => (
          <Link key={action.href} href={action.href} className="dashboard-quick-actions__link">
            {action.label}
          </Link>
        ))}
      </div>
    </Panel>
  );
}
