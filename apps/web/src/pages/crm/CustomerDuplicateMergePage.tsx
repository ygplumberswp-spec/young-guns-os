import { useMemo } from 'react';
import { useSearch } from 'wouter';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { CustomerDuplicateMergePanel } from '../../features/crm/CustomerDuplicateMergePanel';
import { canAccessCrm } from '../../features/crm/CustomerList';

function isOwnerUser(roleName: string | undefined, permissions: string[] | undefined): boolean {
  if (!roleName) return false;
  if (permissions?.includes('*')) return true;
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner'
  );
}

export function CustomerDuplicateMergePage() {
  const { accessToken, user } = useAuth();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const leftId = params.get('left');
  const rightId = params.get('right');

  const canReview = useMemo(() => (user ? canAccessCrm(user.permissions) : false), [user]);
  const isOwner = useMemo(
    () => isOwnerUser(user?.roleName, user?.permissions),
    [user],
  );

  if (!accessToken || !canReview) {
    return (
      <div className="page">
        <PageHeader title="Duplicate customer merge" />
        <p>You do not have access to the duplicate customer review queue.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Duplicate customer merge"
        description="Owner-controlled review queue. Evidence-based candidates only — never auto-merged."
      />
      <CustomerDuplicateMergePanel
        accessToken={accessToken}
        isOwner={isOwner}
        canReview={canReview}
        initialLeftCustomerId={leftId}
        initialRightCustomerId={rightId}
      />
    </div>
  );
}
