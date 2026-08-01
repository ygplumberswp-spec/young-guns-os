import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { CustomerSummary } from '@titan/shared';
import { CUSTOMER_STATUS_OPTIONS } from '@titan/shared';
import { hasAnyPermission } from '@titan/auth/browser';

type CustomerListProps = {
  customers: CustomerSummary[];
  canWrite: boolean;
  search: string;
  onSearchChange: (value: string) => void;
};

function formatStatus(status: CustomerSummary['status']): string {
  return CUSTOMER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function CustomerList({ customers, canWrite, search, onSearchChange }: CustomerListProps) {
  const trimmedSearch = search.trim();

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

      {customers.length === 0 ? (
        <EmptyState
          title={trimmedSearch ? 'No matching customers' : 'No customers yet'}
          description={
            trimmedSearch
              ? 'Try a different name, phone number, email or address.'
              : 'Add your first customer to start building your CRM.'
          }
          action={
            canWrite && !trimmedSearch ? (
              <Link href="/crm/new">
                <Button>Add customer</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <Link href={`/crm/${customer.id}`} className="crm-link">
                      {customer.name}
                    </Link>
                  </td>
                  <td>{customer.primaryAddressDisplay ?? '—'}</td>
                  <td>{customer.email ?? '—'}</td>
                  <td>{customer.phone ?? '—'}</td>
                  <td>
                    <span className={`crm-status crm-status--${customer.status}`}>
                      {formatStatus(customer.status)}
                    </span>
                  </td>
                  <td>{new Date(customer.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
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
