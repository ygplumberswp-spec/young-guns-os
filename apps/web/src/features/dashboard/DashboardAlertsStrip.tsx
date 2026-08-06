import { Link } from 'wouter';
import type { DashboardAlert } from '@titan/shared';

type DashboardAlertsStripProps = {
  alerts: DashboardAlert[];
};

export function DashboardAlertsStrip({ alerts }: DashboardAlertsStripProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="exec-dashboard-alerts" role="region" aria-label="Priority alerts">
      <ul className="exec-dashboard-alerts__list">
        {alerts.map((alert) => (
          <li key={alert.id} className={`exec-dashboard-alerts__item is-${alert.priority}`}>
            <Link href={alert.href} className="exec-dashboard-alerts__link">
              <span className="exec-dashboard-alerts__title">{alert.title}</span>
              <span className="exec-dashboard-alerts__message">{alert.message}</span>
              <span className="exec-dashboard-alerts__action">{alert.actionLabel}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
