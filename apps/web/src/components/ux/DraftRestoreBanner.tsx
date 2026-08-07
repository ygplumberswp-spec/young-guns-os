import { Button } from '@titan/ui';

type DraftRestoreBannerProps = {
  title?: string | null;
  lastEditedAt?: string | null;
  warning?: string | null;
  onRestore: () => void;
  onDismiss: () => void;
};

/**
 * Explicit restore prompt — never auto-applies draft payloads over live records.
 * Mobile-safe: inline banner, not a blocking desktop modal for background saves.
 */
export function DraftRestoreBanner({
  title,
  lastEditedAt,
  warning,
  onRestore,
  onDismiss,
}: DraftRestoreBannerProps) {
  return (
    <div className="draft-restore-banner" role="status">
      <div>
        <strong>Recoverable draft found</strong>
        <p className="page-muted">
          {title ? `${title} · ` : ''}
          {lastEditedAt ? `Last saved ${new Date(lastEditedAt).toLocaleString()}` : 'Unsaved draft available'}
          . Restore only applies when you confirm — TITAN will not silently overwrite live data.
        </p>
        {warning ? <p className="form-error">{warning}</p> : null}
      </div>
      <div className="draft-restore-banner__actions">
        <Button type="button" size="sm" onClick={onRestore}>
          Restore draft
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDismiss}>
          Keep current
        </Button>
      </div>
    </div>
  );
}
