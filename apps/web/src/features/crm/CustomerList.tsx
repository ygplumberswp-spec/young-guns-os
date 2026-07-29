import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { CustomerSummary } from '@titan/shared';
import { CUSTOMER_STATUS_OPTIONS } from '@titan/shared';
import { hasAnyPermission } from '@titan/auth/browser';

type CustomerListProps = {
  customers: CustomerSummary[];
  canWrite: boolean;
};

function formatStatus(status: CustomerSummary['status']): string {
  return CUSTOMER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function CustomerList({ customers, canWrite }: CustomerListProps) {
  if (customers.length === 0) {
    return (
      <EmptyState
        title="No customers yet"
        description="Add your first customer to start building your CRM."
        action={
          canWrite ? (
            <Link href="/crm/new">
              <Button>Add customer</Button>
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <Panel title="All customers">
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Name</th>
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
    </Panel>
  );
}

export function canAccessCrm(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['customers:read', 'customers:write']);
}

export function canManageCustomers(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['customers:write']);
}
