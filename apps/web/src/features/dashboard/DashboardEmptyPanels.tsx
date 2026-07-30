import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import { DASHBOARD_EMPTY_PANELS } from './constants';
import { DashboardPanelEmptyIcon } from './DashboardPanelEmptyIcon';

export function DashboardEmptyPanels() {
  return (
    <section className="dashboard-panels">
      {DASHBOARD_EMPTY_PANELS.map((panel) => (
        <Panel key={panel.id} title={panel.title} description={panel.description}>
          <EmptyState
            title={panel.emptyTitle}
            description={panel.emptyDescription}
            icon={<DashboardPanelEmptyIcon panelId={panel.id} />}
            className="dashboard-panel-empty titan-empty-state--compact"
            action={
              panel.actionHref && panel.actionLabel ? (
                <Link href={panel.actionHref}>
                  <Button size="sm" variant="secondary">
                    {panel.actionLabel}
                  </Button>
                </Link>
              ) : undefined
            }
          />
        </Panel>
      ))}
    </section>
  );
}
