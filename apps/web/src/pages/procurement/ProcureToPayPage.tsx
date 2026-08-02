import { PageHeader } from '../../components/ux';
import { useMemo } from 'react';
import { Link } from 'wouter';
import { PageLoadState, Panel } from '@titan/ui';
import type { ProcureToPayStage } from '@titan/shared';
import { fetchProcureToPayPipeline } from '../../lib/procurement-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { ProcurementNav } from '../../features/procurement/ProcurementNav';
import { canAccessProcurement } from '../../features/procurement/utils';

function stageStatusClass(status: ProcureToPayStage['status']): string {
  if (status === 'live') return 'status-pill status-pill--active';
  if (status === 'partial') return 'status-pill status-pill--attention';
  return 'status-pill status-pill--warning';
}

function stageStatusLabel(status: ProcureToPayStage['status']): string {
  if (status === 'live') return 'LIVE';
  if (status === 'partial') return 'PARTIAL';
  return 'HOLD';
}

export function ProcureToPayPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessProcurement(user.permissions) : false), [user]);

  const { data: pipeline, error, isLoading } = useCachedQuery({
    queryKey: 'procurement/procure-to-pay',
    accessToken,
    enabled: canView,
    staleTimeMs: 15_000,
    fetcher: async () => fetchProcureToPayPipeline(accessToken!),
  });

  if (!canView) {
    return (
      <div className="inventory-page">
        <PageHeader title="Procure to pay" description="You do not have permission to view procurement." />
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <PageHeader
        title="Procurement"
        description="Need → request → approve → order → receive with explicit HOLD on bill/payment stages."
      />
      <ProcurementNav />

      {pipeline ? (
        <div className="inventory-workspace-stats">
          <span className="inventory-workspace-stat">{pipeline.lowStockCount} low-stock need(s)</span>
          <span className="inventory-workspace-stat">
            {pipeline.pendingApprovalCount} PO(s) pending approval
          </span>
          <span className="inventory-workspace-stat">{pipeline.openOrderCount} open order(s)</span>
        </div>
      ) : null}

      <PageLoadState
        isLoading={isLoading}
        error={error}
        isEmpty={false}
        loadingLabel="Loading procure-to-pay pipeline…"
      >
        <Panel title="Procure-to-pay pipeline">
          <ol className="procure-pipeline">
            {pipeline?.stages.map((stage) => (
              <li key={stage.id} className={`procure-pipeline__stage procure-pipeline__stage--${stage.status}`}>
                <div className="procure-pipeline__header">
                  <span className="procure-pipeline__label">{stage.label}</span>
                  <span className={stageStatusClass(stage.status)}>{stageStatusLabel(stage.status)}</span>
                  {stage.count > 0 ? (
                    <span className="procure-pipeline__count">{stage.count}</span>
                  ) : null}
                </div>
                <p className="procure-pipeline__description">{stage.description}</p>
                {stage.holdReason ? (
                  <p className="procure-pipeline__hold page-muted">{stage.holdReason}</p>
                ) : null}
                {stage.handoffHref ? (
                  <Link href={stage.handoffHref} className="inventory-link procure-pipeline__link">
                    Open handoff →
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </Panel>
      </PageLoadState>
    </div>
  );
}
