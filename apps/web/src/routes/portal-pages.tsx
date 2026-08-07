import { lazy, type ComponentType } from 'react';

function lazyNamed<T extends Record<string, ComponentType<any>>>(
  loader: () => Promise<T>,
  exportName: keyof T & string,
) {
  return lazy(() =>
    loader().then((module) => ({ default: module[exportName] as ComponentType<any> })),
  );
}

/** YG-CUTOVER-001D — keep portal pages out of the staff critical bundle. */
export const PortalLoginPage = lazyNamed(
  () => import('../pages/portal/PortalLoginPage'),
  'PortalLoginPage',
);
export const PortalAcceptInvitePage = lazyNamed(
  () => import('../pages/portal/PortalAcceptInvitePage'),
  'PortalAcceptInvitePage',
);
export const PortalDashboardPage = lazyNamed(
  () => import('../pages/portal/PortalDashboardPage'),
  'PortalDashboardPage',
);
export const PortalJobsPage = lazyNamed(
  () => import('../pages/portal/PortalJobsPage'),
  'PortalJobsPage',
);
export const PortalJobDetailPage = lazyNamed(
  () => import('../pages/portal/PortalJobDetailPage'),
  'PortalJobDetailPage',
);
export const PortalQuotesPage = lazyNamed(
  () => import('../pages/portal/PortalQuotesPage'),
  'PortalQuotesPage',
);
export const PortalQuoteDetailPage = lazyNamed(
  () => import('../pages/portal/PortalQuoteDetailPage'),
  'PortalQuoteDetailPage',
);
export const PortalFinancePage = lazyNamed(
  () => import('../pages/portal/PortalFinancePage'),
  'PortalFinancePage',
);
export const PortalAppointmentsPage = lazyNamed(
  () => import('../pages/portal/PortalAppointmentsPage'),
  'PortalAppointmentsPage',
);
export const PortalCommunicationsPage = lazyNamed(
  () => import('../pages/portal/PortalCommunicationsPage'),
  'PortalCommunicationsPage',
);
export const PortalKnowledgePage = lazyNamed(
  () => import('../pages/portal/PortalKnowledgePage'),
  'PortalKnowledgePage',
);
export const PortalNotificationsPage = lazyNamed(
  () => import('../pages/portal/PortalNotificationsPage'),
  'PortalNotificationsPage',
);
export const PortalDocumentsPage = lazyNamed(
  () => import('../pages/portal/PortalDocumentsPage'),
  'PortalDocumentsPage',
);
export const PortalProfilePage = lazyNamed(
  () => import('../pages/portal/PortalProfilePage'),
  'PortalProfilePage',
);
export const PortalFeedbackPage = lazyNamed(
  () => import('../pages/portal/PortalFeedbackPage'),
  'PortalFeedbackPage',
);
export const PortalLoyaltyPage = lazyNamed(
  () => import('../pages/portal/PortalLoyaltyPage'),
  'PortalLoyaltyPage',
);
export const PortalAssetsPage = lazyNamed(
  () => import('../pages/portal/PortalAssetsPage'),
  'PortalAssetsPage',
);
export const PortalNotFoundPage = lazyNamed(
  () => import('../pages/portal/PortalNotFoundPage'),
  'PortalNotFoundPage',
);
export const PortalHomeshieldPage = lazyNamed(
  () => import('../pages/portal/PortalHomeshieldPage'),
  'PortalHomeshieldPage',
);
