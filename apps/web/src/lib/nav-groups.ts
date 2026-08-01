import type { NavItemConfig } from '@titan/shared';

export type NavGroupId = 'core' | 'finance' | 'operations' | 'intelligence' | 'platform';

export type NavGroupDefinition = {
  id: NavGroupId;
  label: string;
};

export const NAV_GROUP_ORDER: NavGroupDefinition[] = [
  { id: 'core', label: 'Core' },
  { id: 'finance', label: 'Finance' },
  { id: 'operations', label: 'Operations' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'platform', label: 'Platform' },
];

const HREF_GROUP: Record<string, NavGroupId> = {
  '/': 'core',
  '/crm': 'core',
  '/leads': 'core',
  '/jobs': 'core',
  '/scheduling': 'core',
  '/finance/quotes': 'finance',
  '/finance/invoices': 'finance',
  '/finance/payments': 'finance',
  '/inventory/products': 'operations',
  '/procurement': 'operations',
  '/fleet': 'operations',
  '/mobile-platform/dispatcher': 'operations',
  '/dispatch-intelligence': 'operations',
  '/communications/messages': 'operations',
  '/documents': 'operations',
  '/analytics': 'intelligence',
  '/marketing': 'intelligence',
  '/marketing-intelligence': 'intelligence',
  '/sales-intelligence': 'intelligence',
  '/aura/agents': 'intelligence',
  '/automation': 'intelligence',
  '/mission-control': 'intelligence',
  '/integrations': 'platform',
  '/security': 'platform',
  '/enterprise-modules': 'platform',
  '/platform-health': 'platform',
  '/release-center': 'platform',
  '/saas-management': 'platform',
  '/settings/company': 'platform',
  '/aura': 'platform',
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
