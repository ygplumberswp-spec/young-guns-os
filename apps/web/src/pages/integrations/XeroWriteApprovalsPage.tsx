import { useMemo } from 'react';
import { Link } from 'wouter';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { XeroWriteApprovalQueuePanel } from '../../features/integrations/XeroWriteApprovalQueuePanel';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';

function isOwnerUser(roleName: string | undefined, permissions: string[] | undefined): boolean {
  if (!roleName) return false;
  if (permissions?.includes('*')) return true;
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner'
  );
}

export function XeroWriteApprovalsPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(
    () => (user ? canAccessIntegrations(user.permissions) : false),
    [user],
  );
  const canRequest = useMemo(
    () =>
      user
        ? canManageIntegrations(user.permissions) ||
          user.permissions.includes('finance:write') ||
          user.permissions.includes('*')
        : false,
    [user],
  );
  const isOwner = useMemo(
    () => isOwnerUser(user?.roleName, user?.permissions),
    [user],
  );

  if (!accessToken || !canView) {
    return (
      <div className="page">
        <PageHeader title="Xero Write Approvals" />
        <p>You do not have access to Xero write approvals.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Xero Write Approvals"
        description="Owner-approved TITAN → Xero writes. Read/import sync is unchanged."
      />
      <p>
        <Link href="/integrations/xero">← Back to Xero connection</Link>
      </p>
      <XeroWriteApprovalQueuePanel
        accessToken={accessToken}
        isOwner={isOwner}
        canRequest={canRequest}
      />
    </div>
  );
}
