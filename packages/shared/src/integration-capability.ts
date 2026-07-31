/**
 * Decision 4 / UX-G capability-state contract.
 * UI must derive labels from this backend-mapped state — never hard-code “Connected”.
 */
export type IntegrationCapabilityState =
  | 'connected_usable'
  | 'configured_unverified'
  | 'disconnected'
  | 'not_configured'
  | 'not_implemented'
  | 'temporarily_unavailable'
  | 'failed_degraded';

/** Decision 4 aliases used in docs. */
export type IntegrationCapabilityStateLabel =
  | 'CONNECTED'
  | 'SETUP REQUIRED'
  | 'IMPLEMENTED NOT CONNECTED'
  | 'NOT IMPLEMENTED'
  | 'DEGRADED'
  | 'ERROR'
  | 'DISCONNECTED'
  | 'TEMPORARILY UNAVAILABLE';

export const INTEGRATION_CAPABILITY_STATE_OPTIONS: Array<{
  value: IntegrationCapabilityState;
  label: IntegrationCapabilityStateLabel;
  description: string;
}> = [
  {
    value: 'connected_usable',
    label: 'CONNECTED',
    description: 'Verified usable configuration; real connector path exists.',
  },
  {
    value: 'configured_unverified',
    label: 'SETUP REQUIRED',
    description: 'Credentials or config present but not verified as usable.',
  },
  {
    value: 'disconnected',
    label: 'DISCONNECTED',
    description: 'Implemented connector exists but is not connected.',
  },
  {
    value: 'not_configured',
    label: 'IMPLEMENTED NOT CONNECTED',
    description: 'Backend exists; tenant has not configured the connection.',
  },
  {
    value: 'not_implemented',
    label: 'NOT IMPLEMENTED',
    description: 'No backend capability — must never appear usable.',
  },
  {
    value: 'temporarily_unavailable',
    label: 'TEMPORARILY UNAVAILABLE',
    description: 'Connector exists but is temporarily unavailable.',
  },
  {
    value: 'failed_degraded',
    label: 'DEGRADED',
    description: 'Connected or configured but failing / degraded.',
  },
];

export type DeriveCapabilityStateInput = {
  /** Registry availability: available = real backend; planned = not implemented for use. */
  availability: 'available' | 'planned';
  connectionStatus: 'disconnected' | 'pending' | 'connected' | 'error';
  isConfigured: boolean;
  /** False when provider is known but has no Titan backend (e.g. Gmail, n8n). */
  backendImplemented?: boolean;
  lastError?: string | null;
};

export function deriveIntegrationCapabilityState(
  input: DeriveCapabilityStateInput,
): IntegrationCapabilityState {
  if (input.backendImplemented === false || input.availability === 'planned') {
    return 'not_implemented';
  }

  if (input.connectionStatus === 'error') {
    return 'failed_degraded';
  }

  if (input.connectionStatus === 'connected') {
    return input.isConfigured ? 'connected_usable' : 'configured_unverified';
  }

  if (input.connectionStatus === 'pending') {
    return 'configured_unverified';
  }

  if (input.isConfigured) {
    return 'configured_unverified';
  }

  return 'not_configured';
}

export function formatCapabilityStateLabel(
  state: IntegrationCapabilityState,
): IntegrationCapabilityStateLabel {
  return (
    INTEGRATION_CAPABILITY_STATE_OPTIONS.find((option) => option.value === state)?.label ??
    'NOT IMPLEMENTED'
  );
}

/**
 * Synthetic providers that must never claim usable without a real connector.
 * UX-J: n8n removed — real Automation-owned connector drives Integrations status.
 */
export const HONESTY_ONLY_PROVIDERS = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Gmail intelligence is not implemented. Use Email (SMTP) for transactional mail.',
    category: 'communications' as const,
    capabilityState: 'not_implemented' as const,
    deepLinkPath: null as string | null,
  },
] as const;

/** Integrations deep-link target for n8n (configuration lives under Automations). */
export const N8N_AUTOMATIONS_PATH = '/automation/n8n' as const;
