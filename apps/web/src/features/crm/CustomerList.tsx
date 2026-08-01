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
  getCustomerDeleteEligibility,
} from '@titan/shared';
import { deleteCustomer, updateCustomer } from '../../lib/crm-api';
import type { CustomerWithValueClassification } from '../../lib/customer-value-api-client';
import { ApiClientError } from '../../lib/api-client';
import {
  BulkActionBar,
  MultiStatusFilter,
  RowActionsCell,
  StatusBadgeDropdown,
  StatusRowAccent,
  type InlineSaveState,
  type MoreMenuItem,
  useConfirmDialog,
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
  const { confirm, alert, dialog: confirmDialog } = useConfirmDialog();

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

  async function handleDeleteCustomer(
    customer: CustomerSummary,
    classification: CustomerWithValueClassification['valueClassification'] | null,
  ) {
    const eligibility = getCustomerDeleteEligibility(classification);
    if (!eligibility.canDelete) {
      await alert(
        eligibility.blockReason ?? 'This customer cannot be deleted. Use Archive instead.',
        'Cannot delete customer',
      );
      return;
    }
    const confirmed = await confirm({
      title: 'Delete customer',
      message: `Permanently delete "${customer.name}"? This cannot be undone. Owner confirmation required.`,
      confirmLabel: 'Delete permanently',
      variant: 'destructive',
    });
    if (!confirmed) {
      return;
    }
    if (!accessToken) return;
    setRowState(customer.id, 'saving');
    try {
      await deleteCustomer(accessToken, customer.id);
      setRowState(customer.id, 'saved');
      await onRefresh();
    } catch {
      setRowState(customer.id, 'failed');
    }
  }

  function buildCustomerActions(
    customer: CustomerSummary,
    classification: CustomerWithValueClassification['valueClassification'] | null,
    uiStatus: CustomerUiStatus,
  ): MoreMenuItem[] {
    const eligibility = getCustomerDeleteEligibility(classification);
    const archiveGuard = validateCustomerStatusChange('archived', classification);

    return [
      { id: 'view', label: 'View', onSelect: () => navigate(`/crm/${customer.id}`) },
      { id: 'edit', label: 'Edit', onSelect: () => navigate(`/crm/${customer.id}#edit`) },
      {
        id: 'add-job',
        label: 'Add job',
        onSelect: () => navigate(`/jobs/new?customerId=${customer.id}`),
      },
      {
        id: 'create-quote',
        label: 'Create quote',
        onSelect: () => navigate(`/finance/quotes/new?customerId=${customer.id}`),
      },
      {
        id: 'message',
        label: 'Message',
        onSelect: () => navigate(`/crm/${customer.id}#communications`),
      },
      {
        id: 'mark-active',
        label: 'Mark active',
        hidden: uiStatus === 'active',
        onSelect: () => void changeCustomerStatus(customer, 'active', classification),
      },
      {
        id: 'mark-inactive',
        label: 'Mark inactive',
        hidden: uiStatus === 'inactive' || uiStatus === 'archived',
        disabled: !validateCustomerStatusChange('inactive', classification).allowed,
        onSelect: () => void changeCustomerStatus(customer, 'inactive', classification),
      },
      {
        id: 'duplicate-review',
        label: 'Review duplicate',
        onSelect: () => navigate(`/crm/${customer.id}#duplicate-review`),
      },
      {
        id: 'merge-duplicate',
        label: 'Merge duplicate',
        onSelect: () => navigate(`/crm/${customer.id}#merge-duplicate`),
      },
      {
        id: 'archive',
        label: eligibility.archiveLabel,
        hidden: uiStatus === 'archived',
        disabled: !archiveGuard.allowed,
        onSelect: () => void changeCustomerStatus(customer, 'archived', classification),
      },
      {
        id: 'delete',
        label: eligibility.deleteLabel,
        disabled: !eligibility.canDelete,
        onSelect: () => void handleDeleteCustomer(customer, classification),
      },
    ];
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
          id: 'inactive',
          label: 'Mark inactive',
          onClick: () => void bulkSetStatus('inactive'),
          disabled: bulkSaving,
        },
        {
          id: 'duplicate',
          label: 'Duplicate review',
          onClick: () => void bulkSetStatus('duplicate_review'),
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
    <>
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
                <th className="leads-table__actions-col">Actions</th>
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
                      <RowActionsCell
                        editHref={`/crm/${customer.id}#edit`}
                        moreItems={buildCustomerActions(customer, classification, uiStatus)}
                        canWrite={canWrite}
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
    {confirmDialog}
    </>
  );
}

export function canAccessCrm(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['customers:read', 'customers:write']);
}

export function canManageCustomers(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['customers:write']);
}
