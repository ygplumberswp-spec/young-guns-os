import type { EnterpriseConnectionStatus } from './enterprise-connection-status';

/** Business-friendly overview copy — never raw backend capability labels. */
export const INTEGRATION_OVERVIEW_PROVIDER_COPY: Record<
  string,
  {
    connected: string;
    notConnected: string;
  }
> = {
  xero: {
    connected: 'Invoices, contacts and payments stay aligned with your books.',
    notConnected: 'Connect your accounting ledger to keep finance data in one place.',
  },
  cartrack: {
    connected: 'Live vehicle locations and fleet activity feed into dispatch.',
    notConnected: 'Connect fleet tracking to see vehicles and routes in TITAN.',
  },
  yoco: {
    connected: 'Card payments can be linked to customer invoices.',
    notConnected: 'Enable secure card payments for issued invoices.',
  },
  whatsapp: {
    connected: 'Customer messaging is available from the communications hub.',
    notConnected: 'Connect WhatsApp Business to message customers from TITAN.',
  },
  email: {
    connected: 'Outbound email delivery is configured for your business.',
    notConnected: 'Send transactional email through your business mail provider.',
  },
  gmail: {
    connected: 'Business Gmail is linked for inbox and outbound mail.',
    notConnected: 'Connect Business Gmail to manage email alongside operations.',
  },
  google_maps: {
    connected: 'Address lookup and routing support field teams.',
    notConnected: 'Connect Google Maps for address search and route planning.',
  },
  google_calendar: {
    connected: 'Job scheduling can reflect your Google Calendar.',
    notConnected: 'Connect Google Calendar to coordinate jobs and appointments.',
  },
  n8n: {
    connected: 'Automation workflows are available from the automation hub.',
    notConnected: 'Set up automation workflows for repetitive business tasks.',
  },
  resend: {
    connected: 'Transactional email is delivered through Resend.',
    notConnected: 'Connect Resend for reliable outbound email delivery.',
  },
  facebook: {
    connected: 'Your Facebook Page is linked for social publishing.',
    notConnected: 'Connect Facebook to manage your business Page from TITAN.',
  },
  instagram: {
    connected: 'Instagram Business is linked for social publishing.',
    notConnected: 'Connect Instagram to publish from your business account.',
  },
  tiktok: {
    connected: 'TikTok Business is linked for social publishing.',
    notConnected: 'Connect TikTok to manage your business presence.',
  },
};

const STATUS_OVERVIEW_COPY: Record<
  Exclude<EnterpriseConnectionStatus, 'connected' | 'not_connected'>,
  string
> = {
  connected_limited: 'Some permissions need to be renewed to unlock full access.',
  attention_required: 'A quick review is needed to restore this connection.',
  temporarily_unavailable: 'This service is temporarily unreachable. Try again shortly.',
};

export function resolveIntegrationOverviewDescription(input: {
  providerKey: string;
  status: EnterpriseConnectionStatus;
  fallback?: string;
}): string {
  const copy = INTEGRATION_OVERVIEW_PROVIDER_COPY[input.providerKey];

  if (input.status === 'connected_limited' || input.status === 'attention_required') {
    return STATUS_OVERVIEW_COPY[input.status];
  }

  if (input.status === 'temporarily_unavailable') {
    return STATUS_OVERVIEW_COPY.temporarily_unavailable;
  }

  if (input.status === 'connected' && copy?.connected) {
    return copy.connected;
  }

  if (copy?.notConnected) {
    return copy.notConnected;
  }

  return input.fallback?.replace(/\.$/, '') ?? 'Connect this service to extend TITAN for your business.';
}

/** Never surface raw registry/backend descriptions on the overview. */
export function resolveIntegrationOverviewDescriptionSafe(input: {
  providerKey: string;
  status: EnterpriseConnectionStatus;
}): string {
  return resolveIntegrationOverviewDescription({
    providerKey: input.providerKey,
    status: input.status,
  });
}
