import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import { PageHeader } from '../../components/ux';

/** Scaffold — section visibility defaults work without configuration. */
export function DashboardSettingsPage() {
  return (
    <div className="page-shell owner-page-content">
      <PageHeader
        title="Dashboard settings"
        description="Configure section visibility, order, date view, and quick actions."
        breadcrumbs={[
          { label: 'Settings', href: '/settings/company' },
          { label: 'Dashboard' },
        ]}
      />

      <Panel title="Section visibility" description="Choose which panels appear on your executive dashboard.">
        <p className="page-muted">
          Young Guns defaults are active. Custom layout preferences will be saved here in a future
          release.
        </p>
        <ul className="portal-list">
          <li>Today at a glance</li>
          <li>Live operations</li>
          <li>Completed today</li>
          <li>Today&apos;s priorities</li>
          <li>Team today</li>
          <li>Customer value</li>
        </ul>
      </Panel>

      <Panel title="Quick actions" description="Grouped shortcuts in the dashboard header dropdown.">
        <p className="page-muted">
          Default groups: Customers, Jobs, Finance, Documents, Communication. Advanced actions appear
          when modules are enabled.
        </p>
        <Link href="/">
          <Button size="sm" variant="secondary">
            Back to dashboard
          </Button>
        </Link>
      </Panel>
    </div>
  );
}
