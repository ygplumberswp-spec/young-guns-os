import { PageHeader } from '../../components/ux';
import { SettingsNav } from '../../features/settings/SettingsNav';

const NOTIFICATION_TOGGLES = [
  { id: 'draft_saved', label: 'Draft Saved', defaultOn: true },
  { id: 'approval_required', label: 'Approval Required', defaultOn: true },
  { id: 'sync_completed', label: 'Sync Completed', defaultOn: true },
  { id: 'sync_pending', label: 'Sync Pending', defaultOn: false },
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
        Toggle scaffolds only — all listed notifications are enabled by default for staff.
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
