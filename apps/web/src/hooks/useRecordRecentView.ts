import { useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { pushRecentItem, type RecentItem } from '../lib/recent-items';

/** Record a recently viewed item for the command palette (tenant + user scoped). */
export function useRecordRecentView(item: Omit<RecentItem, 'viewedAt'> | null): void {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !item?.id || !item.href || !item.title) return;
    pushRecentItem(user.companyId, user.id, item);
  }, [item?.href, item?.id, item?.kind, item?.title, user]);
}
