import { hasAnyPermission } from '@titan/auth/browser';

export type RecentItemKind =
  | 'customer'
  | 'job'
  | 'quote'
  | 'invoice'
  | 'document'
  | 'page';

export type RecentItem = {
  id: string;
  kind: RecentItemKind;
  title: string;
  href: string;
  viewedAt: string;
};

const STORAGE_PREFIX = 'titan:recent:';

function storageKey(companyId: string, userId: string): string {
  return `${STORAGE_PREFIX}${companyId}:${userId}`;
}

export function readRecentItems(companyId: string, userId: string): RecentItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(companyId, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushRecentItem(
  companyId: string,
  userId: string,
  item: Omit<RecentItem, 'viewedAt'>,
  cap = 20,
): RecentItem[] {
  const now = new Date().toISOString();
  const existing = readRecentItems(companyId, userId).filter(
    (entry) => !(entry.kind === item.kind && entry.id === item.id),
  );
  const next: RecentItem[] = [{ ...item, viewedAt: now }, ...existing].slice(0, cap);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(storageKey(companyId, userId), JSON.stringify(next));
  }
  return next;
}

const KIND_PERMISSIONS: Record<RecentItemKind, string[]> = {
  customer: ['customers:read', 'customers:write'],
  job: ['jobs:read', 'jobs:write'],
  quote: ['finance:read', 'finance:write'],
  invoice: ['finance:read', 'finance:write'],
  document: ['documents:read', 'documents:write'],
  page: ['*'],
};

export function filterRecentItemsByRbac(
  items: RecentItem[],
  permissions: string[],
): RecentItem[] {
  return items.filter((item) =>
    hasAnyPermission(permissions, [...(KIND_PERMISSIONS[item.kind] ?? ['*']), '*']),
  );
}
