import type { CommIntelChannel } from '@titan/shared';

export type UnifiedCommunicationChannelFilter =
  | 'all'
  | CommIntelChannel
  | 'personal_whatsapp'
  | 'system';

export const UNIFIED_COMMUNICATION_CHANNEL_OPTIONS: Array<{
  id: UnifiedCommunicationChannelFilter;
  label: string;
}> = [
  { id: 'all', label: 'All channels' },
  { id: 'whatsapp', label: 'WhatsApp Business' },
  { id: 'personal_whatsapp', label: 'Personal WhatsApp' },
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS' },
  { id: 'phone', label: 'Calls' },
  { id: 'portal', label: 'Portal' },
  { id: 'support', label: 'Support' },
  { id: 'system', label: 'System' },
];

type UnifiedCommunicationsChannelFilterProps = {
  value: UnifiedCommunicationChannelFilter;
  onChange: (value: UnifiedCommunicationChannelFilter) => void;
};

export function UnifiedCommunicationsChannelFilter({
  value,
  onChange,
}: UnifiedCommunicationsChannelFilterProps) {
  return (
    <div className="ux-multi-status-filter" role="group" aria-label="Communication channel filter">
      {UNIFIED_COMMUNICATION_CHANNEL_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`ux-multi-status-filter__pill${value === option.id ? ' ux-multi-status-filter__pill--active' : ''}`}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function matchesUnifiedCommunicationChannel(
  channel: CommIntelChannel | string,
  filter: UnifiedCommunicationChannelFilter,
  metadata?: Record<string, unknown>,
): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'personal_whatsapp') {
    return metadata?.accountType === 'personal' || metadata?.source === 'personal_whatsapp';
  }

  if (filter === 'system') {
    return channel === 'internal' || metadata?.source === 'system';
  }

  return channel === filter;
}
