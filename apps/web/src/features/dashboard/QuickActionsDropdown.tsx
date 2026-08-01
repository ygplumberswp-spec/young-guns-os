import { hasAnyPermission } from '@titan/auth/browser';
import { QuickActionsDropdown as UxQuickActionsDropdown, type MoreMenuItem } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';

type QuickActionDef = {
  id: string;
  label: string;
  href: string;
  group: string;
  permissions: string[];
  moduleGate?: string;
};

const QUICK_ACTIONS: QuickActionDef[] = [
  { id: 'new-lead', label: 'New lead', href: '/leads/new', group: 'Customers', permissions: ['leads:write', '*'] },
  { id: 'new-customer', label: 'New customer', href: '/crm/new', group: 'Customers', permissions: ['customers:write', '*'] },
  { id: 'new-job', label: 'New job', href: '/jobs/new', group: 'Jobs', permissions: ['jobs:write', '*'] },
  { id: 'schedule-job', label: 'Schedule job', href: '/scheduling', group: 'Jobs', permissions: ['dispatch:read', 'jobs:read', '*'] },
  { id: 'new-quote', label: 'New quote', href: '/finance/quotes/new', group: 'Finance', permissions: ['finance:write', '*'] },
  { id: 'new-invoice', label: 'New invoice', href: '/finance/invoices/new', group: 'Finance', permissions: ['finance:write', '*'] },
  { id: 'record-payment', label: 'Record payment', href: '/finance/payments/new', group: 'Finance', permissions: ['finance:write', '*'] },
  { id: 'upload-document', label: 'Upload document', href: '/documents/new', group: 'Documents', permissions: ['documents:write', '*'] },
  { id: 'new-message', label: 'New message', href: '/communications/messages/new', group: 'Communication', permissions: ['communications:write', '*'] },
  { id: 'ask-aura', label: 'Ask AURA', href: '/aura', group: 'Communication', permissions: ['agents:read', 'aura:read', '*'] },
  {
    id: 'new-po',
    label: 'New PO',
    href: '/procurement/purchase-orders/new',
    group: 'Advanced',
    permissions: ['procurement:write', '*'],
    moduleGate: 'procurement',
  },
];

const GROUP_ORDER = ['Customers', 'Jobs', 'Finance', 'Documents', 'Communication', 'Advanced'];

export function QuickActionsDropdown() {
  const { user } = useAuth();
  if (!user) return null;

  const visible = QUICK_ACTIONS.filter((action) => {
    if (action.moduleGate === 'procurement') {
      return hasAnyPermission(user.permissions, ['procurement:write', 'procurement:read', '*']);
    }
    return hasAnyPermission(user.permissions, action.permissions);
  });

  const items: MoreMenuItem[] = [];
  for (const group of GROUP_ORDER) {
    const groupActions = visible.filter((action) => action.group === group);
    if (groupActions.length === 0) continue;

    if (items.length > 0) {
      items.push({ id: `sep-${group}`, label: '—', hidden: true });
    }

    for (const action of groupActions) {
      items.push({ id: action.id, label: `${group}: ${action.label}`, href: action.href });
    }
  }

  if (items.length === 0) return null;

  return <UxQuickActionsDropdown label="Quick Actions ▾" items={items} align="end" />;
}
