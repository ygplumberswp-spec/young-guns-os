import { PageHeader } from '../../components/ux';
import { useMemo } from 'react';
import { InventoryHoldPanel } from '../../features/inventory/InventoryHoldPanel';
import { ProcurementNav } from '../../features/procurement/ProcurementNav';
import { canAccessProcurement } from '../../features/procurement/utils';
import { useAuth } from '../../lib/auth-context';

export function SupplierPriceListsPage() {
  const { user } = useAuth();
  const canView = useMemo(() => (user ? canAccessProcurement(user.permissions) : false), [user]);

  if (!canView) {
    return (
      <div className="inventory-page">
        <PageHeader title="Price lists" description="You do not have permission to view supplier pricing." />
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <PageHeader
        title="Procurement"
        description="Supplier price lists and catalogue comparison."
      />
      <ProcurementNav />
      <InventoryHoldPanel
        title="Supplier price lists"
        reason="Supplier price intelligence API exists (import jobs, dedup, review queue) but owner compare UI is not fully wired on staging. Use supplier product links on supplier detail until import review is mounted."
        alternateHref="/procurement/suppliers"
        alternateLabel="View suppliers"
      />
    </div>
  );
}
