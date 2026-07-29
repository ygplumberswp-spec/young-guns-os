import { EmptyState, Panel } from '@titan/ui';
import { DASHBOARD_EMPTY_PANELS } from './constants';

export function DashboardEmptyPanels() {
  return (
    <section className="dashboard-panels">
      {DASHBOARD_EMPTY_PANELS.map((panel) => (
        <Panel key={panel.id} title={panel.title} description={panel.description}>
          <EmptyState
            title={panel.emptyTitle}
            description={panel.emptyDescription}
            className="dashboard-panel-empty"
          />
        </Panel>
      ))}
    </section>
  );
}
