import { lazy, type ComponentType } from 'react';

function lazyNamed<T extends Record<string, ComponentType<any>>>(
  loader: () => Promise<T>,
  exportName: keyof T & string,
) {
  return lazy(() =>
    loader().then((module) => ({ default: module[exportName] as ComponentType<any> })),
  );
}

/** YG-CUTOVER-001D — keep technician field pages out of the staff critical bundle. */
export const MobileDashboardPage = lazyNamed(
  () => import('../pages/mobile/MobileDashboardPage'),
  'MobileDashboardPage',
);
export const MobileJobsPage = lazyNamed(
  () => import('../pages/mobile/MobileJobsPage'),
  'MobileJobsPage',
);
export const MobileJobDetailPage = lazyNamed(
  () => import('../pages/mobile/MobileJobDetailPage'),
  'MobileJobDetailPage',
);
export const MobileRoutePage = lazyNamed(
  () => import('../pages/mobile/MobileRoutePage'),
  'MobileRoutePage',
);
export const MobileInventoryPage = lazyNamed(
  () => import('../pages/mobile/MobileInventoryPage'),
  'MobileInventoryPage',
);
export const MobileTimePage = lazyNamed(
  () => import('../pages/mobile/MobileTimePage'),
  'MobileTimePage',
);
export const MobileNotificationsPage = lazyNamed(
  () => import('../pages/mobile/MobileNotificationsPage'),
  'MobileNotificationsPage',
);
export const MobileSyncPage = lazyNamed(
  () => import('../pages/mobile/MobileSyncPage'),
  'MobileSyncPage',
);
export const MobileSchedulePage = lazyNamed(
  () => import('../pages/mobile/MobileSchedulePage'),
  'MobileSchedulePage',
);
export const MobilePerformancePage = lazyNamed(
  () => import('../pages/mobile/MobilePerformancePage'),
  'MobilePerformancePage',
);
