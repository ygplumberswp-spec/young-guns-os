import type { NavItemConfig } from '@titan/shared';

export type NavGroupId = 'core' | 'finance' | 'operations' | 'intelligence' | 'platform';

export type NavGroupDefinition = {
  id: NavGroupId;
  label: string;
};

export const NAV_GROUP_ORDER: NavGroupDefinition[] = [
  /** Core group has no section heading — items sit at the top of the sidebar. */
  { id: 'core', label: '' },
  { id: 'finance', label: 'Finance' },
  { id: 'operations', label: 'Operations' },
  { id: 'intelligence', label: 'Insights' },
  { id: 'platform', label: 'Setup' },
];

/**
 * Only module landing pages reach the sidebar, so this map covers exactly the
 * modules in `NAV_MODULE_ORDER`. Supporting pages are grouped by their module
 * and rendered inside it instead.
 */
const HREF_GROUP: Record<string, NavGroupId> = {
  '/': 'core',
  '/global-search': 'core',
  '/crm': 'core',
  '/leads': 'core',
  '/jobs': 'core',
  '/scheduling': 'core',

  '/finance/quotes': 'finance',
  '/finance/invoices': 'finance',
  '/finance/payments': 'finance',

  '/inventory/products': 'operations',
  '/procurement/suppliers': 'operations',
  '/fleet': 'operations',
  '/documents': 'operations',
  '/communications/messages': 'operations',
  '/settings/team': 'operations',
  '/marketing': 'operations',

  '/analytics': 'intelligence',
  '/aura': 'intelligence',

  '/integrations': 'platform',
  '/settings/company': 'platform',
};

export function groupNavItems(items: NavItemConfig[]): Array<{
  group: NavGroupDefinition;
  items: NavItemConfig[];
}> {
  const buckets = new Map<NavGroupId, NavItemConfig[]>();

  for (const item of items) {
    const groupId = HREF_GROUP[item.href] ?? 'platform';
    const list = buckets.get(groupId) ?? [];
    list.push(item);
    buckets.set(groupId, list);
  }

  return NAV_GROUP_ORDER.filter((group) => buckets.has(group.id)).map((group) => ({
    group,
    items: buckets.get(group.id)!,
  }));
}
