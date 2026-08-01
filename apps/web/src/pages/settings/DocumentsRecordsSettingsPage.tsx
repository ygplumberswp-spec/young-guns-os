import { PageHeader } from '../../components/ux';
import { SettingsNav } from '../../features/settings/SettingsNav';
import { DEFAULT_DRAFT_WORKSPACE_SETTINGS } from '@titan/shared';

export function DocumentsRecordsSettingsPage() {
  const defaults = DEFAULT_DRAFT_WORKSPACE_SETTINGS;

  return (
    <div className="settings-page">
      <PageHeader
        title="Documents & records"
        description="Draft autosave and retention defaults for Young Guns operations."
        showBack
        backFallbackHref="/settings"
      />
      <SettingsNav />
      <p className="settings-scaffold-note">
        Owner configuration UI is scaffolded — these Young Guns defaults apply without setup.
      </p>
      <dl className="settings-dl">
        <div>
          <dt>Autosave interval</dt>
          <dd>{defaults.autosaveIntervalMs / 1000}s (debounced {defaults.debounceMs / 1000}s)</dd>
        </div>
        <div>
          <dt>Draft retention</dt>
          <dd>{defaults.retentionDays} days</dd>
        </div>
        <div>
          <dt>Draft workspace</dt>
          <dd>Enabled for quotes, invoices, and jobs</dd>
        </div>
      </dl>
    </div>
  );
}
