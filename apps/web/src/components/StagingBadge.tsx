import { isStagingUi } from '../lib/runtime-env';

/** Discreet but unmistakable staging marker — prevents prod confusion. */
export function StagingBadge() {
  if (!isStagingUi()) return null;

  return (
    <span className="staging-badge" role="status" aria-label="Staging Environment">
      STAGING
    </span>
  );
}
