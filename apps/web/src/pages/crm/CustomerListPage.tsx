import { useMemo } from 'react';
import { Link } from 'wouter';
import { Button, PageHeader, PageLoadState } from '@titan/ui';
import { fetchCustomers } from '../../lib/crm-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { CacheStaleNotice } from '../../components/CacheStaleNotice';
import { canAccessCrm, canManageCustomers, CustomerList } from '../../features/crm/CustomerList';

export function CustomerListPage() {
  const { accessToken, user } = useAuth();

  const canView = useMemo(
    () => (user ? canAccessCrm(user.permissions) : false),
    [user],
  );

  const canWrite = useMemo(
    () => (user ? canManageCustomers(user.permissions) : false),
    [user],
  );

  const { data: customers, error, isLoading, isStale, refetch } = useStaffCachedQuery({
    queryKey: 'crm/customers',
    enabled: canView,
    fetcher: async () => fetchCustomers(accessToken!),
  });

  if (!canView) {
    return (
      <div className="crm-page">
        <PageHeader title="Customers" description="You do not have permission to view customers." />
      </div>
    );
  }

  return (
    <div className="crm-page">
      <PageHeader
        title="Customers"
        description="Manage customer records for your company."
        actions={
          canWrite ? (
            <Link href="/crm/new">
              <Button>Add customer</Button>
            </Link>
          ) : undefined
        }
      />

      <CacheStaleNotice isStale={isStale} error={error} onRetry={() => void refetch()} />

      <PageLoadState
        isLoading={isLoading && customers === undefined}
        error={error && customers === undefined ? error : null}
        isEmpty={(customers?.length ?? 0) === 0}
        emptyTitle="No customers yet"
        emptyDescription="Add your first customer to start building your CRM."
        loadingLabel="Loading customers…"
      >
        <CustomerList customers={customers ?? []} canWrite={canWrite} />
      </PageLoadState>
    </div>
  );
}
