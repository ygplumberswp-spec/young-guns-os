/**
 * Personal WhatsApp Connection Layer
 *
 * Extends Communications Platform `personal_whatsapp` (owner credential path)
 * and Personal WhatsApp Assistant gates. Distinct from:
 * - Personal Communications Intelligence (`personal_comm_*`) — Business WA analysis
 * - Personal WhatsApp Intelligence — classify/approve on personal threads
 * - Business WhatsApp (`whatsapp_connections`) — Meta Cloud API company channel
 *
 * Platform Owner only. Private by default. Never auto-import. Never auto-send.
 * Live device pairing / Meta Graph probes remain additive when credentials exist.
 */

import { canAccessPersonalWhatsappAssistant } from './communications-platform.js';

export type PersonalWaConnectionStatus =
  | 'not_configured'
  | 'awaiting_credentials'
  | 'pairing'
  | 'connected'
  | 'degraded'
  | 'reconnect_required'
  | 'disconnected'
  | 'error';

export const PERSONAL_WA_CONNECTION_STATUSES: PersonalWaConnectionStatus[] = [
  'not_configured',
  'awaiting_credentials',
  'pairing',
  'connected',
  'degraded',
  'reconnect_required',
  'disconnected',
  'error',
];

export type PersonalWaPairingMode = 'credential' | 'device_link_future';

export type PersonalWaConnectionPrivacy = {
  privateByDefault: true;
  excludeFromBusinessSearch: true;
  neverAutoImport: true;
  requireApprovalToSend: true;
  /** Owner-tunable: whether TITAN may attempt inbound sync when a live provider is configured. */
  syncEnabled: boolean;
  retentionDays: number | null;
};

export type PersonalWaSessionHealth = {
  status: PersonalWaConnectionStatus;
  healthy: boolean;
  hasCredentials: boolean;
  lastHeartbeatAt: string | null;
  lastHealthCheckAt: string | null;
  lastHealthStatus: string | null;
  lastHealthMessage: string | null;
  lastError: string | null;
  reconnectAttempts: number;
  reconnectRequestedAt: string | null;
  /** Honest: true only when a live provider probe confirmed the session. */
  liveProviderVerified: boolean;
};

export type PersonalWaTestingCapability = {
  id: string;
  label: string;
  availableWithoutMeta: boolean;
  availableWithStoredCredentials: boolean;
  requiresLiveMetaOrDeviceLink: boolean;
  note: string;
};

export type PersonalWaConnectionSummary = {
  id: string | null;
  accountId: string | null;
  linkedPhoneE164: string | null;
  displayLabel: string;
  status: PersonalWaConnectionStatus;
  pairingMode: PersonalWaPairingMode;
  pairingStartedAt: string | null;
  pairingExpiresAt: string | null;
  pairedAt: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  privacy: PersonalWaConnectionPrivacy;
  sessionHealth: PersonalWaSessionHealth;
  /** Mirrors Communications Platform capability honesty. */
  commPlatformStatus: string | null;
};

export type PersonalWaConnectionDashboard = {
  summary: string;
  productClarification: {
    personalCommunicationsIntelligence: string;
    personalWhatsappAssistant: string;
    personalWhatsappIntelligence: string;
    thisLayer: string;
  };
  connection: PersonalWaConnectionSummary;
  privacy: PersonalWaConnectionPrivacy;
  sessionHealth: PersonalWaSessionHealth;
  testingSupport: PersonalWaTestingCapability[];
  sendPolicy: {
    autoSendEnabled: false;
    requiresOwnerApproval: true;
    outboundBlockedUntilApproval: true;
  };
  runtimeHonesty: {
    encryptionKeyConfigured: boolean;
    liveDeviceLinkAvailable: false;
    metaGraphProbeAvailable: boolean;
    note: string;
  };
};

export type LinkPersonalWaNumberRequest = {
  phoneNumber: string;
  label?: string;
  /** Optional Meta-style access token — encrypted at rest when provided. */
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  syncEnabled?: boolean;
};

export type ConnectPersonalWaRequest = {
  phoneNumber?: string;
  label?: string;
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  syncEnabled?: boolean;
};

export type UpdatePersonalWaConnectionPrivacyRequest = {
  syncEnabled?: boolean;
  retentionDays?: number | null;
};

export type UpdatePersonalWaConnectionSettingsRequest = {
  label?: string;
  phoneNumber?: string;
  syncEnabled?: boolean;
  retentionDays?: number | null;
};

export type PersonalWaHealthCheckResult = {
  ok: boolean;
  status: PersonalWaConnectionStatus;
  message: string;
  testedAt: string;
  liveProviderVerified: false;
  autoSend: false;
};

export const PERSONAL_WA_CONNECTION_PRODUCT_COPY = {
  personalCommunicationsIntelligence:
    'PCI analyses Business WhatsApp messages for company-scoped intelligence (`personal_comm_*`).',
  personalWhatsappAssistant:
    'Personal WhatsApp Assistant is the Platform Owner credential path (`personal_whatsapp`) on Communications Platform — private by default, never auto-imported.',
  personalWhatsappIntelligence:
    'Personal WhatsApp Intelligence classifies owner-scoped personal threads and queues approvals — it does not own pairing/session health.',
  thisLayer:
    'This Connection Layer manages owner number linking, secure credential pairing, connection status, reconnect, session health, and privacy permissions. Never auto-sends.',
} as const;

/** Same Platform Owner gate as Personal WhatsApp Assistant / Intelligence. */
export function canAccessPersonalWhatsappConnection(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canAccessPersonalWhatsappAssistant(identity);
}

export function formatPersonalWaConnectionStatus(status: PersonalWaConnectionStatus): string {
  switch (status) {
    case 'not_configured':
      return 'Not Configured';
    case 'awaiting_credentials':
      return 'Awaiting Credentials';
    case 'pairing':
      return 'Pairing';
    case 'connected':
      return 'Connected';
    case 'degraded':
      return 'Degraded';
    case 'reconnect_required':
      return 'Reconnect Required';
    case 'disconnected':
      return 'Disconnected';
    case 'error':
      return 'Error';
    default:
      return status;
  }
}

/** Basic E.164-ish check — digits with optional leading +. */
export function normalizePersonalWaPhoneInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[\s\-().]/g, '');
  if (!/^\+?[1-9]\d{6,14}$/.test(compact)) return null;
  return compact.startsWith('+') ? compact : `+${compact}`;
}

export function buildPersonalWaTestingSupport(input: {
  encryptionKeyConfigured: boolean;
  hasCredentials: boolean;
  hasLinkedPhone: boolean;
}): PersonalWaTestingCapability[] {
  return [
    {
      id: 'owner_gate',
      label: 'Platform Owner access gate',
      availableWithoutMeta: true,
      availableWithStoredCredentials: true,
      requiresLiveMetaOrDeviceLink: false,
      note: 'RBAC and Owner-only routes can be verified without Meta credentials.',
    },
    {
      id: 'link_number',
      label: 'Owner number linking + settings persistence',
      availableWithoutMeta: true,
      availableWithStoredCredentials: true,
      requiresLiveMetaOrDeviceLink: false,
      note: 'Phone label/number and privacy flags persist locally without a live WhatsApp session.',
    },
    {
      id: 'encrypt_credentials',
      label: 'Secure credential storage',
      availableWithoutMeta: input.encryptionKeyConfigured,
      availableWithStoredCredentials: input.encryptionKeyConfigured,
      requiresLiveMetaOrDeviceLink: false,
      note: input.encryptionKeyConfigured
        ? 'INTEGRATIONS_ENCRYPTION_KEY is present — tokens encrypt at rest.'
        : 'INTEGRATIONS_ENCRYPTION_KEY missing — credentials cannot be stored.',
    },
    {
      id: 'connect_disconnect_reconnect',
      label: 'Connect / disconnect / reconnect controls',
      availableWithoutMeta: true,
      availableWithStoredCredentials: true,
      requiresLiveMetaOrDeviceLink: false,
      note: 'Controls and audit events work; “connected” without a live probe means credentials + owner link are recorded, not a verified device session.',
    },
    {
      id: 'session_health',
      label: 'Session health check',
      availableWithoutMeta: true,
      availableWithStoredCredentials: input.hasCredentials,
      requiresLiveMetaOrDeviceLink: true,
      note: 'Local health reflects stored state. Live Meta Graph / device-link verification is not available in this layer yet.',
    },
    {
      id: 'live_message_sync',
      label: 'Live personal message sync',
      availableWithoutMeta: false,
      availableWithStoredCredentials: false,
      requiresLiveMetaOrDeviceLink: true,
      note: 'Cannot sync personal chats without a live Meta/device-link runtime. No demo threads are invented.',
    },
    {
      id: 'outbound_send',
      label: 'Outbound WhatsApp send',
      availableWithoutMeta: false,
      availableWithStoredCredentials: false,
      requiresLiveMetaOrDeviceLink: true,
      note: 'Outbound is blocked by policy — Owner approval required; this layer never auto-sends.',
    },
    {
      id: 'device_qr_pairing',
      label: 'QR / multi-device pairing',
      availableWithoutMeta: false,
      availableWithStoredCredentials: false,
      requiresLiveMetaOrDeviceLink: true,
      note: 'Device-link pairing is reserved for a future additive runtime — not implemented here.',
    },
    {
      id: 'phone_link_prerequisite',
      label: 'Linked phone prerequisite',
      availableWithoutMeta: input.hasLinkedPhone,
      availableWithStoredCredentials: input.hasLinkedPhone,
      requiresLiveMetaOrDeviceLink: false,
      note: input.hasLinkedPhone
        ? 'Owner phone number is linked on the connection record.'
        : 'Link an owner WhatsApp number before treating the connection as ready.',
    },
  ];
}

export function emptyPersonalWaPrivacy(overrides?: {
  syncEnabled?: boolean;
  retentionDays?: number | null;
}): PersonalWaConnectionPrivacy {
  return {
    privateByDefault: true,
    excludeFromBusinessSearch: true,
    neverAutoImport: true,
    requireApprovalToSend: true,
    syncEnabled: overrides?.syncEnabled ?? false,
    retentionDays: overrides?.retentionDays ?? null,
  };
}

export function emptyPersonalWaSessionHealth(
  status: PersonalWaConnectionStatus = 'not_configured',
): PersonalWaSessionHealth {
  return {
    status,
    healthy: false,
    hasCredentials: false,
    lastHeartbeatAt: null,
    lastHealthCheckAt: null,
    lastHealthStatus: null,
    lastHealthMessage: null,
    lastError: null,
    reconnectAttempts: 0,
    reconnectRequestedAt: null,
    liveProviderVerified: false,
  };
}

export function emptyPersonalWaConnectionSummary(): PersonalWaConnectionSummary {
  const privacy = emptyPersonalWaPrivacy();
  return {
    id: null,
    accountId: null,
    linkedPhoneE164: null,
    displayLabel: 'Personal WhatsApp',
    status: 'not_configured',
    pairingMode: 'credential',
    pairingStartedAt: null,
    pairingExpiresAt: null,
    pairedAt: null,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    privacy,
    sessionHealth: emptyPersonalWaSessionHealth('not_configured'),
    commPlatformStatus: null,
  };
}
