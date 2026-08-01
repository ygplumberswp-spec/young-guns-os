import { PageHeader } from '../../components/ux';
import { SettingsNav } from '../../features/settings/SettingsNav';
import { DEFAULT_DRAFT_RETENTION_DAYS } from '@titan/shared';

export function DataProtectionSettingsPage() {
  return (
    <div className="settings-page">
      <PageHeader
        title="Data protection"
        description="Retention scaffolds for drafts and operational records."
        showBack
        backFallbackHref="/settings"
      />
      <SettingsNav />
      <p className="settings-scaffold-note">
        Advanced retention policies require Owner approval before production use.
      </p>
      <dl className="settings-dl">
        <div>
          <dt>Draft retention</dt>
          <dd>{DEFAULT_DRAFT_RETENTION_DAYS} days (active drafts)</dd>
        </div>
        <div>
          <dt>Archived drafts</dt>
          <dd>Retained until manually deleted</dd>
        </div>
        <div>
          <dt>Audit trail</dt>
          <dd>Draft upsert, duplicate, archive, and delete events logged</dd>
        </div>
      </dl>
    </div>
  );
}
