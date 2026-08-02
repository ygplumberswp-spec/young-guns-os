/** Google Maps Platform — enterprise location types (V1). Real coordinates only. */

export type GoogleMapsServiceFlag =
  | 'places'
  | 'geocoding'
  | 'directions'
  | 'distanceMatrix'
  | 'routes'
  | 'mapsJavascript';

export type GoogleMapsServicesConfig = Record<GoogleMapsServiceFlag, boolean>;

export const DEFAULT_GOOGLE_MAPS_SERVICES: GoogleMapsServicesConfig = {
  places: true,
  geocoding: true,
  /** Prefer Routes API (computeRoutes) when enabled in GCP. */
  routes: true,
  /** Legacy fallbacks — keep enabled only if still provisioned in GCP. */
  directions: false,
  distanceMatrix: false,
  mapsJavascript: true,
};

export const GOOGLE_MAPS_SERVICE_LABELS: Record<GoogleMapsServiceFlag, string> = {
  places: 'Places API (New)',
  geocoding: 'Geocoding API',
  directions: 'Directions API (legacy)',
  distanceMatrix: 'Distance Matrix API (legacy)',
  routes: 'Routes API',
  mapsJavascript: 'Maps JavaScript API',
};

/** Honest key / credential probe outcomes — never invent success. */
export type GoogleMapsKeyStatus =
  | 'missing'
  | 'configured'
  | 'invalid'
  | 'restricted'
  | 'expired'
  | 'billing_disabled'
  | 'unknown';

export type GoogleMapsServiceProbeStatus =
  | 'available'
  | 'unavailable'
  | 'disabled'
  | 'skipped'
  | 'not_configured'
  | 'configured_unverified';

export type GoogleMapsServiceProbe = {
  service: GoogleMapsServiceFlag;
  status: GoogleMapsServiceProbeStatus;
  message: string;
  keyStatus: GoogleMapsKeyStatus | null;
};

export type GoogleMapsConnectionSummary = {
  provider: 'google_maps';
  status: 'disconnected' | 'pending' | 'connected' | 'error';
  connected: boolean;
  hasApiKey: boolean;
  hasBrowserApiKey: boolean;
  services: GoogleMapsServicesConfig;
  lastValidatedAt: string | null;
  lastError: string | null;
  healthLabel: string;
  /** Per-service results from the most recent connection test, when available. */
  lastTest: GoogleMapsTestResult | null;
};

export type GoogleMapsBrowserConfig = {
  enabled: boolean;
  browserApiKey: string | null;
  services: GoogleMapsServicesConfig;
  defaultRegion: string;
  defaultLanguage: string;
};

export type GooglePlacePrediction = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

export type GoogleGeocodedAddress = {
  placeId: string | null;
  formattedAddress: string;
  street: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
};

export type GoogleLatLng = {
  latitude: number;
  longitude: number;
};

export type GoogleRouteEstimate = {
  distanceMeters: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
  /** Traffic-aware when available from Directions/Distance Matrix. */
  durationInTrafficSeconds: number | null;
  durationInTrafficText: string | null;
  polyline: string | null;
  source: 'google_maps' | 'default';
};

export type GoogleMapsTestResult = {
  /** True when the server key works for at least one enabled server-side API. */
  ok: boolean;
  message: string;
  testedAt: string;
  servicesChecked: GoogleMapsServiceFlag[];
  /** Per-service availability — one disabled/unavailable service does not fail the whole test. */
  serviceResults: GoogleMapsServiceProbe[];
  serverKeyStatus: GoogleMapsKeyStatus;
  browserKeyStatus: GoogleMapsKeyStatus;
};

export type PropertyGeoFields = {
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  formattedAddress: string | null;
  geocodedAt: string | null;
  geocodeStatus: 'unverified' | 'verified' | 'failed' | null;
};

export type JobLocationGeo = PropertyGeoFields & {
  navigateUrl: string | null;
};

export function buildGoogleMapsNavigateUrl(input: {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  placeId?: string | null;
}): string | null {
  if (input.placeId?.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination_place_id=${encodeURIComponent(input.placeId.trim())}`;
  }
  if (
    typeof input.latitude === 'number' &&
    typeof input.longitude === 'number' &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    return `https://www.google.com/maps/dir/?api=1&destination=${input.latitude},${input.longitude}`;
  }
  const address = input.address?.trim();
  if (!address) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

/** Open Google Maps at a place / pin (not a directions route). */
export function buildGoogleMapsPlaceUrl(input: {
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  address?: string | null;
}): string | null {
  if (input.placeId?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(input.placeId.trim())}`;
  }
  if (
    typeof input.latitude === 'number' &&
    typeof input.longitude === 'number' &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${input.latitude},${input.longitude}`;
  }
  const address = input.address?.trim();
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Street View deep-link — only when real coordinates exist. */
export function buildGoogleStreetViewUrl(input: {
  latitude?: number | null;
  longitude?: number | null;
}): string | null {
  if (
    typeof input.latitude !== 'number' ||
    typeof input.longitude !== 'number' ||
    !Number.isFinite(input.latitude) ||
    !Number.isFinite(input.longitude)
  ) {
    return null;
  }
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${input.latitude},${input.longitude}`;
}

export function formatLatLngCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  digits = 6,
): string | null {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  return `${latitude.toFixed(digits)}, ${longitude.toFixed(digits)}`;
}

export function isValidLatLng(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Map Google API status / error text to an honest key status.
 * Used by connection probes — never claims healthy on denied/expired keys.
 */
export function classifyGoogleMapsApiStatus(
  status: string | undefined,
  errorMessage?: string | null,
): GoogleMapsKeyStatus {
  const code = (status ?? '').toUpperCase();
  const message = (errorMessage ?? '').toLowerCase();

  if (!code && !message) return 'unknown';

  if (
    code === 'REQUEST_DENIED' ||
    message.includes('referer') ||
    message.includes('referrer') ||
    message.includes('ip address') ||
    message.includes('not authorized') ||
    message.includes('api key not valid') ||
    message.includes('this api project is not authorized')
  ) {
    if (message.includes('expired')) return 'expired';
    return 'restricted';
  }

  if (
    code === 'OVER_DAILY_LIMIT' ||
    message.includes('billing') ||
    message.includes('billing has not been enabled')
  ) {
    return 'billing_disabled';
  }

  if (message.includes('expired') || message.includes('api key expired')) {
    return 'expired';
  }

  if (
    code === 'INVALID_REQUEST' &&
    (message.includes('key') || message.includes('api key'))
  ) {
    return 'invalid';
  }

  if (code === 'OK' || code === 'ZERO_RESULTS') {
    return 'configured';
  }

  return 'unknown';
}

export function summarizeGoogleMapsServiceProbes(
  probes: GoogleMapsServiceProbe[],
): { ok: boolean; message: string } {
  const enabledProbes = probes.filter((p) => p.status !== 'disabled' && p.status !== 'skipped');
  const available = enabledProbes.filter(
    (p) => p.status === 'available' || p.status === 'configured_unverified',
  );
  const unavailable = enabledProbes.filter(
    (p) => p.status === 'unavailable' || p.status === 'not_configured',
  );
  const parts = probes.map(
    (p) => `${GOOGLE_MAPS_SERVICE_LABELS[p.service]}: ${p.status.replace(/_/g, ' ')}`,
  );

  if (enabledProbes.length === 0) {
    return { ok: false, message: 'No Google Maps services are enabled for testing.' };
  }

  // Connection is healthy only when at least one server-side API responds.
  // Browser Maps JS alone (configured_unverified) is not enough to mark the integration OK.
  const serverAvailable = probes.some(
    (p) => p.service !== 'mapsJavascript' && p.status === 'available',
  );
  const browserReady = probes.some(
    (p) => p.service === 'mapsJavascript' && p.status === 'configured_unverified',
  );

  if (serverAvailable) {
    const failNote =
      unavailable.length > 0
        ? ` ${unavailable.length} service(s) unavailable or not configured — others still usable.`
        : '';
    const browserNote = browserReady
      ? ''
      : probes.some((p) => p.service === 'mapsJavascript' && p.status === 'not_configured')
        ? ' Browser Maps JS key not stored.'
        : '';
    return {
      ok: true,
      message: `Connection check complete. ${available.length} service(s) ready.${failNote}${browserNote} ${parts.join('; ')}`,
    };
  }

  return {
    ok: false,
    message: `No enabled server-side Google Maps APIs responded successfully.${browserReady ? ' Browser key is stored but cannot validate the server key.' : ''} ${parts.join('; ')}`,
  };
}
