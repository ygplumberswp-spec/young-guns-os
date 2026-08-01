import { Link } from 'wouter';
import type { MissionControlModuleSnapshot } from '@titan/shared';
import { Button, EmptyState, LoadingState, Panel } from '@titan/ui';
import { isTechnicalModule } from '../mission-control/company-health-areas';
import { formatModuleName, formatStatus } from '../mission-control/utils';

const PLATFORM_QUICK_LINKS = [
  { href: '/release-center', label: 'Release Management' },
  { href: '/launch-center', label: 'Production Launch' },
  { href: '/knowledge', label: 'Knowledge Graph' },
  { href: '/developers', label: 'Developer Platform' },
  { href: '/data-migration', label: 'Data Migration' },
  { href: '/enterprise-modules', label: 'Enterprise Modules' },
] as const;

type PlatformTechnicalSystemsPanelProps = {
  snapshots: MissionControlModuleSnapshot[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
};

function documentationPercent(snapshot: MissionControlModuleSnapshot): string | null {
  const metrics = snapshot.metrics;
  if (typeof metrics.documentationCompleteness === 'number') {
    return `${metrics.documentationCompleteness}%`;
  }
  if (typeof metrics.documentation_completeness === 'number') {
    return `${metrics.documentation_completeness}%`;
  }
  return null;
}

export function PlatformTechnicalSystemsPanel({
  snapshots,
  isLoading,
  error,
  onRetry,
}: PlatformTechnicalSystemsPanelProps) {
  const technicalSnapshots = snapshots.filter((snapshot) => isTechnicalModule(snapshot.module));

  if (isLoading) {
    return <LoadingState label="Loading platform systems…" />;
  }

  if (error) {
    return (
      <Panel title="Platform systems">
        <p className="form-error">{error}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </Panel>
    );
  }

  return (
    <div className="platform-technical-systems">
      <Panel title="Platform quick links">
        <div className="platform-technical-systems__links">
          {PLATFORM_QUICK_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button variant="secondary" size="sm">
                {link.label}
              </Button>
            </Link>
          ))}
        </div>
      </Panel>

      <Panel title="Deployment & platform internals">
        {technicalSnapshots.length === 0 ? (
          <EmptyState
            title="No platform signals"
            description="Capture health snapshots or sync alerts to populate deployment, release, and developer platform status."
          />
        ) : (
          <div className="data-list">
            {technicalSnapshots.map((snapshot) => {
              const manageHref =
                typeof snapshot.metrics.manageHref === 'string'
                  ? snapshot.metrics.manageHref
                  : null;
              const docPercent = documentationPercent(snapshot);

              return (
                <div key={snapshot.module} className="data-list-item">
                  <strong>{formatModuleName(snapshot.module)}</strong>
                  <span className={`status-pill status-pill--${snapshot.status}`}>
                    {formatStatus(snapshot.status)}
                  </span>
                  {docPercent ? (
                    <span className="page-muted">Documentation: {docPercent}</span>
                  ) : null}
                  <p>{snapshot.summary}</p>
                  {manageHref ? (
                    <Link href={manageHref}>
                      <Button variant="secondary" size="sm">
                        Manage
                      </Button>
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
