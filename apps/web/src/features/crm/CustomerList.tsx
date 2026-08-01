import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { hasAnyPermission } from '@titan/auth/browser';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { CustomerSummary, CustomerUiStatus } from '@titan/shared';
import {
  CUSTOMER_STATUS_FILTER_GROUPS,
  CUSTOMER_UI_STATUS_OPTIONS,
  customerUiStatusToDbStatus,
  getCustomerUiStatusTone,
  isCustomerUiStatusWritable,
  resolveCustomerUiStatus,
  validateCustomerStatusChange,
} from '@titan/shared';
import { updateCustomer } from '../../lib/crm-api';
import type { CustomerWithValueClassification } from '../../lib/customer-value-api-client';
import { ApiClientError } from '../../lib/api-client';
import {
  BulkActionBar,
  MoreMenu,
  MultiStatusFilter,
  StatusBadgeDropdown,
  StatusRowAccent,
  type InlineSaveState,
} from '../../components/ux';

type CustomerListProps = {
  customers: CustomerSummary[];
  classifications?: Map<string, CustomerWithValueClassification['valueClassification']>;
  canWrite: boolean;
  accessToken: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => Promise<void>;
};

type RowSaveState = Record<string, InlineSaveState>;

function formatUiStatusLabel(status: CustomerUiStatus): string {
  return CUSTOMER_UI_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function CustomerList({
  customers,
  classifications,
  canWrite,
  accessToken,
  search,
  onSearchChange,
  onRefresh,
}: CustomerListProps) {
  const [, navigate] = useLocation();
  const trimmedSearch = search.trim();
  const [statusFilters, setStatusFilters] = useState<CustomerUiStatus[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowSaveState, setRowSaveState] = useState<RowSaveState>({});
  const [bulkSaving, setBulkSaving] = useState(false);

  const rows = useMemo(
    () =>
      customers.map((customer) => {
        const classification = classifications?.get(customer.id) ?? null;
        const uiStatus = resolveCustomerUiStatus(customer.status, classification);
        return { customer, classification, uiStatus };
      }),
    [classifications, customers],
  );

  const filteredRows = useMemo(() => {
    if (statusFilters.length === 0) return rows;
    return rows.filter((row) => statusFilters.includes(row.uiStatus));
  }, [rows, statusFilters]);

  const allSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(row.customer.id));

  const setRowState = useCallback((customerId: string, state: InlineSaveState) => {
    setRowSaveState((prev) => ({ ...prev, [customerId]: state }));
    if (state === 'saved') {
      window.setTimeout(() => {
        setRowSaveState((prev) => {
          if (prev[customerId] !== 'saved') return prev;
          const next = { ...prev };
          delete next[customerId];
          return next;
        });
      }, 2000);
    }
  }, []);

  async function changeCustomerStatus(
    customer: CustomerSummary,
    targetUiStatus: CustomerUiStatus,
    classification: CustomerWithValueClassification['valueClassification'] | null,
  ) {
    if (!accessToken || !canWrite) return;

    const guard = validateCustomerStatusChange(targetUiStatus, classification);
    if (!guard.allowed) {
      setRowState(customer.id, 'failed');
      throw new ApiClientError(guard.reason, 400, 'VALIDATION_ERROR');
    }

    setRowState(customer.id, 'saving');
    try {
      await updateCustomer(accessToken, customer.id, {
        status: customerUiStatusToDbStatus(targetUiStatus),
      });
      setRowState(customer.id, 'saved');
      await onRefresh();
    } catch (err) {
      setRowState(customer.id, 'failed');
      throw err;
    }
  }

  async function bulkSetStatus(targetUiStatus: CustomerUiStatus) {
    if (!accessToken || !canWrite || selectedIds.size === 0) return;
    setBulkSaving(true);
    try {
      for (const row of filteredRows) {
        if (!selectedIds.has(row.customer.id) || row.uiStatus === targetUiStatus) continue;
        await changeCustomerStatus(row.customer, targetUiStatus, row.classification);
      }
      setSelectedIds(new Set());
    } finally {
      setBulkSaving(false);
    }
  }

  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filteredRows.map((row) => row.customer.id)));
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const filterOptions = CUSTOMER_STATUS_FILTER_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    tone: group.tone,
  }));

  const bulkActions = canWrite
    ? [
        {
          id: 'active',
          label: 'Mark active',
          onClick: () => void bulkSetStatus('active'),
          disabled: bulkSaving,
        },
        {
          id: 'archived',
          label: 'Archive',
          onClick: () => void bulkSetStatus('archived'),
          disabled: bulkSaving,
          variant: 'destructive' as const,
        },
      ]
    : [];

  return (
    <Panel title="All customers">
      <div className="jobs-list-toolbar">
        <label className="titan-input-group jobs-search">
          <span className="titan-input-label">Search</span>
          <input
            className="titan-input"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name, phone, email or address…"
          />
        </label>
      </div>

      <MultiStatusFilter
        options={filterOptions}
        selected={statusFilters}
        onChange={(selected) => setStatusFilters(selected as CustomerUiStatus[])}
        ariaLabel="Filter customers by status"
      />

      <BulkActionBar
        selectedCount={selectedIds.size}
        totalCount={filteredRows.length}
        onSelectAll={toggleSelectAll}
        allSelected={allSelected}
        actions={bulkActions}
      />

      {filteredRows.length === 0 ? (
        <EmptyState
          title={trimmedSearch || statusFilters.length ? 'No matching customers' : 'No customers yet'}
          description={
            trimmedSearch
              ? 'Try a different name, phone number, email or address.'
              : 'Add your first customer to start building your CRM.'
          }
          action={
            canWrite && !trimmedSearch && statusFilters.length === 0 ? (
              <Link href="/crm/new">
                <Button>Add customer</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="crm-table-wrap leads-list">
          <table className="crm-table crm-table--compact">
            <thead>
              <tr>
                <th className="leads-table__check-col" aria-label="Select" />
                <th>Name</th>
                <th className="leads-table__hide-mobile">Contact</th>
                <th className="leads-table__hide-mobile">Address</th>
                <th className="leads-table__hide-mobile">Updated</th>
                <th className="leads-table__actions-col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ customer, classification, uiStatus }) => {
                const tone = getCustomerUiStatusTone(uiStatus);
                const saveState = rowSaveState[customer.id] ?? 'idle';

                const dropdownOptions = CUSTOMER_UI_STATUS_OPTIONS.map((option) => {
                  const guard = validateCustomerStatusChange(option.value, classification);
                  const writable = isCustomerUiStatusWritable(option.value);
                  return {
                    id: option.value,
                    label: option.label,
                    disabled:
                      option.value === uiStatus ||
                      !writable ||
                      !guard.allowed,
                    hidden: !writable && option.value !== uiStatus,
                  };
                });

                return (
                  <StatusRowAccent key={customer.id} tone={tone} className="crm-table__row">
                    <td className="leads-table__check-col">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(customer.id)}
                        onChange={(event) => toggleRow(customer.id, event.target.checked)}
                        aria-label={`Select ${customer.name}`}
                      />
                    </td>
                    <td className="leads-table__primary">
                      <div className="leads-table__name-line">
                        <Link href={`/crm/${customer.id}`} className="crm-link">
                          {customer.name}
                        </Link>
                        <StatusBadgeDropdown
                          label={formatUiStatusLabel(uiStatus)}
                          tone={tone}
                          canChange={canWrite && saveState !== 'saving'}
                          saveState={saveState}
                          options={dropdownOptions}
                          onSelect={(statusId) =>
                            void changeCustomerStatus(
                              customer,
                              statusId as CustomerUiStatus,
                              classification,
                            )
                          }
                        />
                      </div>
                      <div className="leads-table__mobile-meta">
                        <span>{customer.phone ?? customer.email ?? '—'}</span>
                        <span>{customer.primaryAddressDisplay ?? '—'}</span>
                      </div>
                    </td>
                    <td className="leads-table__hide-mobile">
                      <div>{customer.phone ?? '—'}</div>
                      <div className="muted-text">{customer.email ?? '—'}</div>
                    </td>
                    <td className="leads-table__hide-mobile">
                      {customer.primaryAddressDisplay ?? '—'}
                    </td>
                    <td className="leads-table__hide-mobile">
                      {new Date(customer.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="leads-table__actions-col">
                      <MoreMenu
                        label="⋮"
                        items={[
                          {
                            id: 'edit',
                            label: 'Edit',
                            onSelect: () => navigate(`/crm/${customer.id}`),
                          },
                          {
                            id: 'archive',
                            label: 'Archive',
                            hidden: !canWrite,
                            disabled:
                              uiStatus === 'archived' ||
                              !validateCustomerStatusChange('archived', classification).allowed,
                            onSelect: () =>
                              void changeCustomerStatus(customer, 'archived', classification),
                          },
                        ]}
                      />
                    </td>
                  </StatusRowAccent>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function canAccessCrm(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['customers:read', 'customers:write']);
}

export function canManageCustomers(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['customers:write']);
}
