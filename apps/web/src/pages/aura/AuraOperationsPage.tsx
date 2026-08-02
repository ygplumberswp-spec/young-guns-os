import { BackButton } from '../../components/ux';
import { AuraMark } from '../../brand/AuraMark';
import { AuraSectionNav } from '../../features/aura/AuraSectionNav';
import { AuraOperationsManagerPanel } from '../../features/aura/AuraOperationsManagerPanel';
import { useAuth } from '../../lib/auth-context';
import { fetchAuraOperationsSummary } from '../../lib/intelligence-api';
import { useCachedQuery } from '../../lib/use-cached-query';
import { AI_NAME } from '@titan/shared';

export function AuraOperationsPage() {
  const { accessToken } = useAuth();

  const operationsQuery = useCachedQuery({
    queryKey: 'intelligence/operations-summary',
    accessToken,
    enabled: Boolean(accessToken),
    staleTimeMs: 60_000,
    fetcher: async () => fetchAuraOperationsSummary(accessToken ?? ''),
  });

  return (
    <div className="aura-page page-shell">
      <BackButton className="aura-page__back" />
      <header className="aura-page__header">
        <div className="aura-page__brand">
          <AuraMark size="md" className="aura-page__mark" />
          <div className="aura-page__brand-copy">
            <p className="aura-page__eyebrow">{AI_NAME}</p>
            <h1 className="aura-page__title">Operations Manager</h1>
            <p className="aura-page__subtitle">
              Morning and end-of-day operational summaries reconciled from executive dashboard,
              mission control, finance, fleet, documents, and department approvals.
            </p>
          </div>
        </div>
      </header>

      <AuraSectionNav />

      <AuraOperationsManagerPanel
        summary={operationsQuery.data ?? null}
        isLoading={operationsQuery.isLoading}
        error={operationsQuery.error}
      />
    </div>
  );
}
