import { PageHeader, Panel } from '@titan/ui';
import { APP_NAME } from '@titan/shared';

export function AboutSettingsPage() {
  return (
    <>
      <PageHeader title="About" description={`${APP_NAME} workspace platform`} />
      <Panel title="Product">
        <p className="page-muted">
          {APP_NAME} provides operational, financial, and intelligence tools for service businesses.
        </p>
        <p className="product-attribution">Created by Young Guns Plumbing</p>
      </Panel>
    </>
  );
}
