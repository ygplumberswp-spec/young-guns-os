import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, PageHeader, PageLoadState } from '@titan/ui';
import { fetchCustomers } from '../../lib/crm-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { CacheStaleNotice } from '../../components/CacheStaleNotice';
import { canAccessCrm, canManageCustomers, CustomerList } from '../../features/crm/CustomerList';

export function CustomerListPage() {
  const { accessToken, user } = useAuth();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const canView = useMemo(() => (user ? canAccessCrm(user.permissions) : false), [user]);

  const canWrite = useMemo(() => (user ? canManageCustomers(user.permissions) : false), [user]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const {
    data: customers,
    error,
    isLoading,
    isStale,
    refetch,
  } = useStaffCachedQuery({
    queryKey: `crm/customers:${debouncedSearch}`,
    enabled: canView,
    fetcher: async () => fetchCustomers(accessToken!, debouncedSearch),
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
        description="Search by name, phone, email or property address."
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
        isEmpty={false}
        emptyTitle="No customers yet"
        emptyDescription="Add your first customer to start building your CRM."
        loadingLabel="Loading customers…"
      >
        <CustomerList
          customers={customers ?? []}
          canWrite={canWrite}
          search={search}
          onSearchChange={setSearch}
        />
      </PageLoadState>
    </div>
  );
}
