import { PageHeader } from '../../components/ux';
import { SettingsNav } from '../../features/settings/SettingsNav';

const NOTIFICATION_TOGGLES = [
  { id: 'draft_saved', label: 'Draft saved', defaultOn: true },
  { id: 'approval_required', label: 'Approval required', defaultOn: true },
  { id: 'sync_completed', label: 'Sync completed', defaultOn: true },
  { id: 'sync_pending', label: 'Sync pending', defaultOn: false },
] as const;

export function NotificationsSettingsPage() {
  return (
    <div className="settings-page">
      <PageHeader
        title="Notifications"
        description="In-app toast preferences (scaffold — defaults on)."
      />
      <SettingsNav />
      <p className="settings-scaffold-note">
        Toggle scaffolds only — all listed notifications are enabled by default for Young Guns staff.
      </p>
      <ul className="settings-toggle-list">
        {NOTIFICATION_TOGGLES.map((toggle) => (
          <li key={toggle.id} className="settings-toggle-list__item">
            <label className="settings-toggle-list__label">
              <input type="checkbox" defaultChecked={toggle.defaultOn} disabled />
              {toggle.label}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
