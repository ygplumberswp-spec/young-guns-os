import type { FleetCapabilityReason } from '@titan/shared';
import { FLEET_CAPABILITY_LABELS } from '@titan/shared';
import { EmptyState } from '@titan/ui';

type FleetCapabilityStateProps = {
  capability: FleetCapabilityReason;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function FleetCapabilityState({
  capability,
  title,
  description,
  action,
}: FleetCapabilityStateProps) {
  const label = FLEET_CAPABILITY_LABELS[capability];
  const detail =
    description ??
    (capability === 'waiting_for_provider_data'
      ? 'Waiting for first provider data — positions appear automatically after Cartrack background sync.'
      : capability === 'not_connected'
        ? 'Connect Cartrack in Integrations to enable fleet tracking.'
        : capability === 'permission_required'
          ? 'Your role does not include access to this fleet data.'
          : capability === 'addon_required'
            ? 'This capability requires a Cartrack add-on on your provider account.'
            : capability === 'hardware_not_supported'
              ? 'This vehicle or tracker does not expose this data via Cartrack.'
              : `${label}. This fleet feature is temporarily unavailable.`);

  return (
    <div className="fleet-capability-state">
      <span className="status-pill status-pill--disabled">{label}</span>
      <EmptyState title={title} description={detail} action={action} />
    </div>
  );
}
