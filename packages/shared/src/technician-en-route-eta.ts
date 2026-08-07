/**
 * Technician ON MY WAY / EN ROUTE — truthful arrival windows for customer notify.
 * Prefer Cartrack vehicle position + Google Maps route/traffic ETA.
 * Never invent arrival times when required data is missing.
 */

export const ETA_UNAVAILABLE_LABEL = 'ETA UNAVAILABLE / NEEDS UPDATE';

/** Default customer-facing body. Keep configurable via template override. */
export const DEFAULT_EN_ROUTE_CUSTOMER_MESSAGE_TEMPLATE = [
  '{{companyName}} is on the way to your property.',
  'Estimated arrival: {{arrivalWindow}}.',
  'Job #{{jobNumber}}.',
].join('\n');

export type TechnicianEnRouteEtaTruth = {
  /** Live route minutes when Cartrack origin + Maps route succeeded. */
  travelMinutes: number | null;
  travelSource: 'google_maps' | null;
  vehicleOriginUsed: boolean;
  cartrackConnected: boolean;
  googleMapsConnected: boolean;
  jobHasVerifiedCoordinates: boolean;
  arrivalWindowStartAt: string | null;
  arrivalWindowEndAt: string | null;
  arrivalWindowLabel: string;
  etaAvailable: boolean;
  warning: string | null;
};

/**
 * Build a truthful arrival window from now + Google route minutes.
 * Buffer spreads the window so customers see a range, not a false precision.
 */
export function buildArrivalWindowFromTravelMinutes(input: {
  nowMs?: number;
  travelMinutes: number;
  /** Minutes added after earliest arrival for the window end (default 15). */
  windowBufferMinutes?: number;
}): { startAt: string; endAt: string; label: string } | null {
  if (!Number.isFinite(input.travelMinutes) || input.travelMinutes <= 0) return null;
  const now = input.nowMs ?? Date.now();
  const buffer = Math.max(0, input.windowBufferMinutes ?? 15);
  const startMs = now + Math.round(input.travelMinutes) * 60_000;
  const endMs = startMs + buffer * 60_000;
  const startAt = new Date(startMs);
  const endAt = new Date(endMs);
  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    label: formatArrivalWindowLabel(startAt, endAt),
  };
}

export function formatArrivalWindowLabel(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  const startLabel = start.toLocaleTimeString([], opts);
  const endLabel = end.toLocaleTimeString([], opts);
  return `${startLabel}–${endLabel}`;
}

export function resolveTechnicianEnRouteEtaTruth(input: {
  travelMinutes: number | null;
  travelSource: 'default' | 'google_maps' | 'cartrack' | null;
  vehicleOriginUsed: boolean;
  cartrackConnected: boolean;
  googleMapsConnected: boolean;
  jobHasVerifiedCoordinates: boolean;
  travelWarning?: string | null;
  nowMs?: number;
  windowBufferMinutes?: number;
}): TechnicianEnRouteEtaTruth {
  const liveReady =
    input.vehicleOriginUsed &&
    input.travelSource === 'google_maps' &&
    input.travelMinutes != null &&
    Number.isFinite(input.travelMinutes) &&
    input.travelMinutes > 0 &&
    input.jobHasVerifiedCoordinates &&
    input.googleMapsConnected;

  if (!liveReady) {
    let warning = input.travelWarning?.trim() || null;
    if (!warning) {
      if (!input.cartrackConnected) {
        warning = 'Cartrack vehicle GPS unavailable — cannot compute a truthful live ETA.';
      } else if (!input.vehicleOriginUsed) {
        warning = 'Assigned vehicle position unavailable — ETA needs Cartrack GPS.';
      } else if (!input.googleMapsConnected) {
        warning = 'Google Maps routing unavailable — ETA needs live route context.';
      } else if (!input.jobHasVerifiedCoordinates) {
        warning = 'Job site lacks verified coordinates — ETA needs a validated geocode.';
      } else {
        warning = 'Live route ETA unavailable — do not invent an arrival time.';
      }
    }
    return {
      travelMinutes: null,
      travelSource: null,
      vehicleOriginUsed: input.vehicleOriginUsed,
      cartrackConnected: input.cartrackConnected,
      googleMapsConnected: input.googleMapsConnected,
      jobHasVerifiedCoordinates: input.jobHasVerifiedCoordinates,
      arrivalWindowStartAt: null,
      arrivalWindowEndAt: null,
      arrivalWindowLabel: ETA_UNAVAILABLE_LABEL,
      etaAvailable: false,
      warning,
    };
  }

  const window = buildArrivalWindowFromTravelMinutes({
    nowMs: input.nowMs,
    travelMinutes: input.travelMinutes!,
    windowBufferMinutes: input.windowBufferMinutes,
  });

  return {
    travelMinutes: input.travelMinutes,
    travelSource: 'google_maps',
    vehicleOriginUsed: true,
    cartrackConnected: input.cartrackConnected,
    googleMapsConnected: input.googleMapsConnected,
    jobHasVerifiedCoordinates: true,
    arrivalWindowStartAt: window?.startAt ?? null,
    arrivalWindowEndAt: window?.endAt ?? null,
    arrivalWindowLabel: window?.label ?? ETA_UNAVAILABLE_LABEL,
    etaAvailable: Boolean(window),
    warning: input.travelWarning ?? null,
  };
}

export function renderEnRouteCustomerMessage(input: {
  template?: string | null;
  companyName: string;
  jobNumber: string;
  arrivalWindowLabel: string;
  contactLine?: string | null;
}): string {
  const template = input.template?.trim() || DEFAULT_EN_ROUTE_CUSTOMER_MESSAGE_TEMPLATE;
  const base = template
    .replaceAll('{{companyName}}', input.companyName.trim() || 'Young Guns Plumbing')
    .replaceAll('{{arrivalWindow}}', input.arrivalWindowLabel.trim() || ETA_UNAVAILABLE_LABEL)
    .replaceAll('{{jobNumber}}', input.jobNumber.trim() || '—');
  const contact = input.contactLine?.trim();
  return contact ? `${base}\n${contact}` : base;
}

/** Customer-facing payload must never include live vehicle GPS. */
export function customerEnRoutePayloadIsPrivacySafe(payload: Record<string, unknown>): boolean {
  const forbiddenKeys = [
    'latitude',
    'longitude',
    'lat',
    'lng',
    'vehicleGps',
    'liveTrackingUrl',
    'gpsFeed',
    'continuousTracking',
  ];
  return !forbiddenKeys.some((key) => key in payload);
}
