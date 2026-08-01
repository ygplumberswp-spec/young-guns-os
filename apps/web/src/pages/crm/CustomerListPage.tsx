import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { Button, PageLoadState } from '@titan/ui';
import { CUSTOMER_VALUE_CLASSIFICATION_LABELS, classifyCustomerValueFromEvidence, isCustomerValueClassificationFilterKey } from '@titan/shared';
import { fetchCustomersByClassification, fetchCustomersWithClassification } from '../../lib/customer-value-api-client';
import { fetchCustomers } from '../../lib/crm-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { CacheStaleNotice } from '../../components/CacheStaleNotice';
import {
  canAccessCrm,
  canManageCustomers,
  CustomerList,
} from '../../features/crm/CustomerList';
import { CustomerValueMetricsPanel } from '../../features/crm/CustomerValueMetricsPanel';

export function CustomerListPage() {
  const { accessToken, user } = useAuth();
  const searchParams = useSearch();
  const classificationParam = new URLSearchParams(searchParams).get('classification');
  const classificationFilter =
    classificationParam && isCustomerValueClassificationFilterKey(classificationParam)
      ? classificationParam
      : null;
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const canView = useMemo(() => (user ? canAccessCrm(user.permissions) : false), [user]);

  const canWrite = useMemo(() => (user ? canManageCustomers(user.permissions) : false), [user]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const {
    data: customerRows,
    error,
    isLoading,
    isStale,
    refetch,
  } = useStaffCachedQuery({
    queryKey: `crm/customers-ui:${classificationFilter ?? 'all'}:${debouncedSearch}`,
    enabled: canView,
    fetcher: async () => {
      try {
        if (classificationFilter) {
          return fetchCustomersByClassification(
            accessToken!,
            classificationFilter,
            debouncedSearch,
          );
        }
        return fetchCustomersWithClassification(accessToken!, debouncedSearch);
      } catch {
        const fallback = await fetchCustomers(accessToken!, debouncedSearch);
        return fallback.map((customer) => ({
          ...customer,
          valueClassification: {
            isVerifiedInvoiced: false,
            isPayingCustomer: false,
            isFullyPaid: false,
            isOverdueDebtor: false,
            isUnpaidDebtor: false,
            isPartiallyPaid: false,
            isProspect: false,
          },
        }));
      }
    },
  });

  const classifications = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<typeof customerRows>[number]['valueClassification']
    >();
    for (const row of customerRows ?? []) {
      map.set(row.id, row.valueClassification);
    }
    return map;
  }, [customerRows]);

  const customers = useMemo(
    () =>
      (customerRows ?? []).map(({ valueClassification: _valueClassification, ...customer }) => customer),
    [customerRows],
  );

  if (!canView) {
    return (
      <div className="crm-page">
        <PageHeader title="Customers" description="You do not have permission to view customers." />
      </div>
    );
  }

  const filterLabel = classificationFilter
    ? CUSTOMER_VALUE_CLASSIFICATION_LABELS[classificationFilter]
    : null;

  return (
    <div className="crm-page">
      <PageHeader
        title="Customers"
        description={
          filterLabel
            ? `Filtered: ${filterLabel}. Search within this classification.`
            : 'Search by name, phone, email or property address.'
        }
        actions={
          canWrite ? (
            <Link href="/crm/new">
              <Button>Add customer</Button>
            </Link>
          ) : undefined
        }
      />

      {classificationFilter ? (
        <p className="page-muted">
          Showing {filterLabel}.{' '}
          <Link href="/crm" className="crm-link">
            Clear filter
          </Link>
        </p>
      ) : null}

      <CustomerValueMetricsPanel compact />

      <CacheStaleNotice isStale={isStale} error={error} onRetry={() => void refetch()} />

      <PageLoadState
        isLoading={isLoading && customerRows === undefined}
        error={error && customerRows === undefined ? error : null}
        isEmpty={false}
        emptyTitle="No customers yet"
        emptyDescription="Add your first customer to start building your CRM."
        loadingLabel="Loading customers…"
      >
        <CustomerList
          customers={customers}
          classifications={classifications}
          canWrite={canWrite}
          accessToken={accessToken}
          search={search}
          onSearchChange={setSearch}
          onRefresh={async () => {
            await refetch();
          }}
        />
      </PageLoadState>
    </div>
  );
}
