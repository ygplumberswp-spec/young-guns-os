import { useMemo } from 'react';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { CustomerDuplicateReconciliationPanel } from '../../features/crm/CustomerDuplicateReconciliationPanel';
import { canAccessDuplicateReconciliation } from '@titan/shared';

export function CustomerDuplicateMergePage() {
  const { accessToken, user } = useAuth();

  const canReview = useMemo(
    () =>
      user
        ? canAccessDuplicateReconciliation({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );

  if (!accessToken || !canReview) {
    return (
      <div className="page">
        <PageHeader title="Customer Duplicate Reconciliation" />
        <p>You do not have access to the duplicate review queue.</p>
      </div>
    );
  }

  return (
    <div className="page space-y-4">
      <PageHeader
        title="Customer Duplicate Reconciliation"
        description="Side-by-side review with explainable match reasons. Draft → Approve → Execute. No silent merge. No Xero writes."
      />
      <CustomerDuplicateReconciliationPanel />
    </div>
  );
}
