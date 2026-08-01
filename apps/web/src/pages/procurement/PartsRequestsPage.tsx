import { PageHeader } from '../../components/ux';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, Input, PageLoadState, Panel } from '@titan/ui';
import { formatMoney } from '@titan/shared';
import {
  authorizeJobMaterialLine,
  fetchPendingMaterialRequests,
  newJobsClientActionId,
} from '../../lib/jobs-api';
import { ApiClientError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { ProcurementNav } from '../../features/procurement/ProcurementNav';
import { canAuthorizeMaterials, materialLineStatusPillClass } from '../../features/procurement/utils';

export function PartsRequestsPage() {
  const { accessToken, user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const canManage = useMemo(() => (user ? canAuthorizeMaterials(user.permissions) : false), [user]);

  const {
    data: materialLines,
    error: loadError,
    isLoading,
    refetch,
  } = useCachedQuery({
    queryKey: 'jobs/materials/pending',
    accessToken,
    enabled: Boolean(accessToken),
    staleTimeMs: 10_000,
    fetcher: async () => fetchPendingMaterialRequests(accessToken!),
  });

  async function handleAuthorize(
    jobId: string,
    materialLineId: string,
    decision: 'approve' | 'reject',
  ) {
    if (!accessToken || busyId) return;
    if (decision === 'reject' && !rejectReasons[materialLineId]?.trim()) {
      setError('A rejection reason is required');
      return;
    }
    setBusyId(materialLineId);
    setError(null);
    setSuccess(null);
    try {
      await authorizeJobMaterialLine(accessToken, jobId, materialLineId, {
        decision,
        reason: decision === 'reject' ? rejectReasons[materialLineId]?.trim() : null,
        clientActionId: newJobsClientActionId(decision),
      });
      setSuccess(decision === 'approve' ? 'Material request approved.' : 'Material request rejected.');
      await refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update material request');
    } finally {
      setBusyId(null);
    }
  }

  if (!canManage) {
    return (
      <div className="inventory-page">
        <PageHeader
          title="Parts requests"
          description="You do not have permission to authorize material requests."
        />
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <PageHeader
        title="Procurement"
        description="Suppliers, purchase orders and parts requests."
      />
      <ProcurementNav />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <PageLoadState
        isLoading={isLoading}
        error={loadError}
        isEmpty={(materialLines?.length ?? 0) === 0}
        emptyTitle="No pending parts requests"
        emptyDescription="Technician material requests awaiting office approval will appear here."
        loadingLabel="Loading parts requests…"
      >
        <Panel title="Pending requests">
          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Source</th>
                  <th>Cost</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {materialLines?.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <Link href={`/jobs/${line.jobId}`} className="inventory-link">
                        {line.jobNumber ?? 'Job'}
                      </Link>
                    </td>
                    <td>
                      {line.description}
                      {line.inventoryItemName ? (
                        <span className="page-muted"> ({line.inventoryItemName})</span>
                      ) : null}
                    </td>
                    <td>
                      {line.quotedQuantity ?? line.quantity} {line.unit}
                    </td>
                    <td>{line.materialSource.replace(/_/g, ' ')}</td>
                    <td>{line.lineTotalCents != null ? formatMoney(line.lineTotalCents) : '—'}</td>
                    <td>
                      <span className={materialLineStatusPillClass(line.status)}>{line.status}</span>
                    </td>
                    <td>
                      <div className="jobs-form__actions">
                        <Button
                          size="sm"
                          disabled={busyId === line.id}
                          onClick={() => void handleAuthorize(line.jobId, line.id, 'approve')}
                        >
                          Approve
                        </Button>
                        <Input
                          label="Reject reason"
                          value={rejectReasons[line.id] ?? ''}
                          onChange={(e) =>
                            setRejectReasons((prev) => ({ ...prev, [line.id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === line.id}
                          onClick={() => void handleAuthorize(line.jobId, line.id, 'reject')}
                        >
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </PageLoadState>
    </div>
  );
}
