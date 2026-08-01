import { PageHeader } from '../../components/ux';
import { useEffect, useState } from 'react';
import { EmptyState, Panel } from '@titan/ui';
import type { AlCustomerAssetSummary } from '@titan/shared';
import { PortalApiClientError, portalRequest } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalAssetsPage() {
  const { accessToken } = usePortalAuth();
  const [assets, setAssets] = useState<AlCustomerAssetSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void portalRequest<{ assets: AlCustomerAssetSummary[] }>(
      '/enterprise-asset-lifecycle/portal/assets',
      { accessToken },
    )
      .then((data) => setAssets(data.assets))
      .catch((err) =>
        setError(err instanceof PortalApiClientError ? err.message : 'Unable to load assets'),
      );
  }, [accessToken]);

  return (
    <div className="portal-page">
      <PageHeader
        title="My assets"
        description="View registered assets, warranties, and service history."
      />
      {error ? <p className="form-error">{error}</p> : null}
      {assets.length === 0 ? (
        <EmptyState
          title="No assets registered"
          description="Equipment and assets linked to your account will appear here when the office registers them. This empty list is truthful — nothing is hidden or still loading."
        />
      ) : (
        <Panel title="Registered assets">
          <ul className="portal-list">
            {assets.map((asset) => (
              <li key={asset.assetId}>
                <strong>{asset.name}</strong>
                <span>
                  {asset.categoryName ?? 'Asset'} · {asset.lifecycleStage.replace(/_/g, ' ')}
                </span>
                {asset.warrantyExpiresAt ? (
                  <span>Warranty expires {asset.warrantyExpiresAt}</span>
                ) : null}
                {asset.openAlertCount > 0 ? (
                  <span>{asset.openAlertCount} open alert(s)</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
