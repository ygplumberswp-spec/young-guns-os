import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, PageHeader } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import { useAuth } from '../../lib/auth-context';
import { canAccessCrm, canManageCustomers, CustomerList } from '../../features/crm/CustomerList';

export function CustomerListPage() {
  const { accessToken, user } = useAuth();
  const [customers, setCustomers] = useState<Awaited<ReturnType<typeof fetchCustomers>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(
    () => (user ? canAccessCrm(user.permissions) : false),
    [user],
  );

  const canWrite = useMemo(
    () => (user ? canManageCustomers(user.permissions) : false),
    [user],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCustomers() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchCustomers(accessToken);

        if (!cancelled) {
          setCustomers(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load customers');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadCustomers();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

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

      {isLoading ? <p className="page-muted">Loading customers…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? <CustomerList customers={customers} canWrite={canWrite} /> : null}
    </div>
  );
}
