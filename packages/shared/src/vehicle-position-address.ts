/**
 * Readable addresses for Cartrack vehicle positions.
 *
 * Raw `gps_positions` coordinates stay the source of truth. A reverse-geocoded
 * address is a derived convenience label, and every display path here states how
 * trustworthy that label is: an exact street address, an approximate area, a last
 * known address, or the coordinates themselves when geocoding produced nothing.
 */

import {
  deriveVehiclePositionFreshness,
  isPositionBehaviourUnreliable,
} from './fleet-tracking.js';
import {
  buildGoogleMapsNavigateUrl,
  formatLatLngCoordinates,
  isValidLatLng,
  type GoogleGeocodeLocationType,
} from './google-maps.js';

/** Reuse a cached address while the vehicle stays within this radius of it. */
export const VEHICLE_ADDRESS_MATERIAL_MOVE_METERS = 40;

/** How long a resolved address may be reused for the same spot. */
export const VEHICLE_ADDRESS_CACHE_TTL_MS = 60 * 60 * 1000;

/** Failed lookups are remembered briefly so a bad coordinate cannot hammer the provider. */
export const VEHICLE_ADDRESS_FAILURE_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Whether the provider matched an exact address or only an area.
 * Approximate matches are never rendered as an exact property address.
 */
export type VehicleAddressPrecision = 'precise' | 'approximate';

export type VehiclePositionAddress = {
  /** Provider `formatted_address`, kept verbatim for audit and share text. */
  formattedAddress: string;
  /** Preferred display form — street number + street, suburb, city. */
  shortAddress: string;
  street: string | null;
  suburb: string | null;
  city: string | null;
  /** Province/state, when the source supplied one. Never derived from the city. */
  region?: string | null;
  placeId: string | null;
  precision: VehicleAddressPrecision;
  /** Coordinate this address was resolved for — not necessarily the newest position. */
  resolvedForLatitude: number;
  resolvedForLongitude: number;
  resolvedAt: string;
  /**
   * `cartrack` is the provider's own `position_description`, which arrives with the
   * telemetry and costs no geocoding call. `google_maps` is the reverse-geocode
   * fallback for coordinates Cartrack did not describe.
   */
  source: 'google_maps' | 'cartrack';
};

/** Why no address is available. Never a silent blank. */
export type VehicleAddressUnresolvedReason =
  | 'not_attempted'
  | 'maps_not_connected'
  | 'geocoding_disabled'
  | 'invalid_coordinates'
  | 'no_result'
  | 'provider_error'
  | 'lookup_budget_reached';

export type VehiclePositionAddressResult =
  | { status: 'resolved'; address: VehiclePositionAddress }
  | { status: 'unresolved'; reason: VehicleAddressUnresolvedReason; message: string };

export type VehicleAddressDisplayState =
  | 'precise'
  /** Road and area are correct, the building is not identified. */
  | 'street_level'
  | 'approximate'
  | 'stale'
  | 'coordinates'
  | 'unavailable';

export type VehicleAddressDisplay = {
  state: VehicleAddressDisplayState;
  /** The line to render. Never empty. */
  line: string;
  /** Honest qualifier for the line, or null when none is needed. */
  note: string | null;
  /** True only for a fresh, exact street match. */
  isExactAndCurrent: boolean;
};

export function unresolvedVehicleAddressMessage(reason: VehicleAddressUnresolvedReason): string {
  switch (reason) {
    case 'not_attempted':
      return 'Address lookup was not attempted for this position.';
    case 'maps_not_connected':
      return 'Google Maps is not connected in TITAN, so coordinates cannot be turned into an address.';
    case 'geocoding_disabled':
      return 'The Geocoding API is disabled in TITAN settings, so coordinates cannot be turned into an address.';
    case 'invalid_coordinates':
      return 'The provider coordinate for this position is not usable.';
    case 'no_result':
      return 'Google Maps returned no address for this coordinate.';
    case 'provider_error':
      return 'Google Maps could not be reached for this coordinate.';
    case 'lookup_budget_reached':
      return 'Address lookup was deferred to stay within the provider call budget — it will resolve on a later refresh.';
  }
}

export function unresolvedVehicleAddress(
  reason: VehicleAddressUnresolvedReason,
): VehiclePositionAddressResult {
  return { status: 'unresolved', reason, message: unresolvedVehicleAddressMessage(reason) };
}

/**
 * Preferred display form: street number + street, suburb, city.
 * Falls back to the provider's formatted address when components are missing.
 */
export function formatVehicleAddressLine(input: {
  street?: string | null;
  suburb?: string | null;
  city?: string | null;
  formattedAddress?: string | null;
}): string | null {
  const parts = [input.street, input.suburb, input.city]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  const deduped: string[] = [];
  for (const part of parts) {
    if (!deduped.some((existing) => existing.toLowerCase() === part.toLowerCase())) {
      deduped.push(part);
    }
  }

  if (deduped.length > 0) return deduped.join(', ');
  return input.formattedAddress?.trim() || null;
}

/**
 * Precision comes from the provider's own match quality, tightened by requiring a
 * street number — an area centroid must never read as somebody's front gate.
 */
export function deriveVehicleAddressPrecision(input: {
  locationType?: GoogleGeocodeLocationType | null;
  street?: string | null;
}): VehicleAddressPrecision {
  const exactMatch =
    input.locationType === 'ROOFTOP' || input.locationType === 'RANGE_INTERPOLATED';
  if (!exactMatch) return 'approximate';
  return /\d/.test(input.street ?? '') ? 'precise' : 'approximate';
}

export function formatVehiclePositionCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  return formatLatLngCoordinates(latitude, longitude, 5);
}

/**
 * Decide what a surface may claim about a vehicle's whereabouts.
 *
 * Readable street and area are the primary answer whenever one exists. Stale positions
 * are labelled as last known, a road-level match says so rather than posing as a
 * property address, a genuinely approximate match is prefixed "Near", and a failed
 * lookup falls back to the coordinates rather than a guess.
 */
export function resolveVehiclePositionAddressDisplay(input: {
  result: VehiclePositionAddressResult | null;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  recordedAt: string | null | undefined;
  cartrackConnected: boolean;
  nowMs?: number;
  /**
   * Defaults to the compact `street, suburb` form used by list rows and map popovers.
   * Pass `false` on a detail surface that wants the provider's full formatted address.
   */
  compact?: boolean;
}): VehicleAddressDisplay {
  const coordinates = formatVehiclePositionCoordinates(input.latitude, input.longitude);
  const hasUsableCoordinates = isValidLatLng(input.latitude, input.longitude);

  if (!hasUsableCoordinates || !coordinates) {
    return {
      state: 'unavailable',
      line: 'Position unavailable',
      note: 'No usable coordinate has been received for this vehicle, so TITAN shows no address.',
      isExactAndCurrent: false,
    };
  }

  // Judged against the real polling cadence, so a position that is as current as the
  // integration allows is not mislabelled "last known".
  const stale = isPositionBehaviourUnreliable(
    deriveVehiclePositionFreshness({
      recordedAt: input.recordedAt,
      cartrackConnected: input.cartrackConnected,
      nowMs: input.nowMs,
    }),
  );

  const address = input.result?.status === 'resolved' ? input.result.address : null;

  if (!address) {
    const reasonNote =
      input.result?.status === 'unresolved'
        ? input.result.message
        : unresolvedVehicleAddressMessage('not_attempted');
    return {
      state: 'coordinates',
      line: coordinates,
      note: `${reasonNote} Coordinates are shown instead.`,
      isExactAndCurrent: false,
    };
  }

  const label =
    input.compact === false
      ? address.formattedAddress || address.shortAddress
      : address.shortAddress || address.formattedAddress;

  if (stale) {
    return {
      state: 'stale',
      line: `Last known address: ${label}`,
      note: 'This is not a live location — it is where the vehicle was when the position was recorded.',
      isExactAndCurrent: false,
    };
  }

  if (address.precision === 'approximate') {
    // Cartrack describes the road the vehicle is on. That is a true answer to "where is
    // it", so it is shown plainly — but it must never read as a verified street number.
    if (address.source === 'cartrack') {
      return {
        state: 'street_level',
        line: label,
        note: 'Road and area supplied by Cartrack with the position. The street number is not verified.',
        isExactAndCurrent: false,
      };
    }

    return {
      state: 'approximate',
      line: `Near ${label}`,
      note: 'Google Maps matched an area rather than an exact street address.',
      isExactAndCurrent: false,
    };
  }

  return { state: 'precise', line: label, note: null, isExactAndCurrent: true };
}

/** Derived from real recorded speed only — never inferred from ignition or assumed. */
export function formatVehicleMotionLabel(speedKmh: number | null | undefined): string {
  if (typeof speedKmh !== 'number' || !Number.isFinite(speedKmh)) return 'Movement unknown';
  return speedKmh >= 3 ? `Moving · ${Math.round(speedKmh)} km/h` : 'Stationary';
}

/** Provider-supplied ignition only — never inferred from speed. */
export function formatVehicleIgnitionLabel(ignitionOn: boolean | null | undefined): string {
  if (ignitionOn === true) return 'Ignition on';
  if (ignitionOn === false) return 'Ignition off';
  return 'Ignition unknown';
}

/** Age of the provider's own timestamp — never the time TITAN read the row. */
export function formatVehiclePositionFreshness(
  recordedAt: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (!recordedAt) return 'Position time unknown';
  const recordedMs = new Date(recordedAt).getTime();
  if (!Number.isFinite(recordedMs)) return 'Position time unknown';

  const deltaMs = nowMs - recordedMs;
  if (deltaMs < 0) return 'Position timestamp is in the future';

  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return `Updated ${seconds} second${seconds === 1 ? '' : 's'} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Navigate to the vehicle's own coordinate. Google Maps resolves the origin from
 * the user's device — TITAN computes no route and stores no device location.
 */
export function buildVehiclePositionNavigateUrl(input: {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}): string | null {
  if (!isValidLatLng(input.latitude, input.longitude)) return null;
  return buildGoogleMapsNavigateUrl({
    latitude: input.latitude as number,
    longitude: input.longitude as number,
  });
}

export type VehiclePositionShareInput = {
  licensePlate: string | null;
  vehicleName?: string | null;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  recordedAt: string | null | undefined;
  display: VehicleAddressDisplay;
  nowMs?: number;
};

/**
 * Share text for the directions link. Carries the plate, the destination and the
 * position's real age — and nothing else about the fleet, the customer or the job.
 */
export function buildVehiclePositionShareMessage(
  input: VehiclePositionShareInput,
): string | null {
  const navigateUrl = buildVehiclePositionNavigateUrl(input);
  if (!navigateUrl) return null;

  const identifier = input.licensePlate?.trim() || input.vehicleName?.trim() || 'Vehicle';
  const coordinates = formatVehiclePositionCoordinates(input.latitude, input.longitude);

  const lines = [
    `${identifier} — vehicle position`,
    input.display.line,
    coordinates ? `Coordinates: ${coordinates}` : null,
    formatVehiclePositionFreshness(input.recordedAt, input.nowMs),
    input.display.state === 'stale' || input.display.state === 'approximate'
      ? input.display.note
      : null,
    `Directions: ${navigateUrl}`,
  ];

  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

/** WhatsApp deep link for the share text — no credentials, ids or personal data. */
export function buildWhatsappShareUrl(message: string | null): string | null {
  const trimmed = message?.trim();
  if (!trimmed) return null;
  return `https://wa.me/?text=${encodeURIComponent(trimmed)}`;
}

/** SMS deep link for the share text, handed to the device's own messaging app. */
export function buildSmsShareUrl(message: string | null): string | null {
  const trimmed = message?.trim();
  if (!trimmed) return null;
  return `sms:?&body=${encodeURIComponent(trimmed)}`;
}

/** Warning to show before handing a position to navigation, or null when none applies. */
export function resolveVehicleNavigateWarning(input: {
  display: VehicleAddressDisplay;
  speedKmh: number | null | undefined;
  recordedAt: string | null | undefined;
  nowMs?: number;
}): string | null {
  if (input.display.state === 'unavailable') {
    return 'No usable position exists for this vehicle, so navigation cannot be offered.';
  }

  const freshness = formatVehiclePositionFreshness(input.recordedAt, input.nowMs);

  if (input.display.state === 'stale') {
    return `This is not a live location. ${freshness}. The vehicle may be somewhere else entirely — confirm before you rely on it.`;
  }

  if (typeof input.speedKmh !== 'number' || !Number.isFinite(input.speedKmh)) {
    return `Movement cannot be confirmed — the provider supplied no speed for this position. ${freshness}.`;
  }

  if (input.speedKmh >= 3) {
    return `This vehicle was moving at ${Math.round(input.speedKmh)} km/h when the position was recorded. ${freshness}. It will have moved by the time you arrive.`;
  }

  return null;
}

/** Metres between two coordinates — used to decide whether a cached address still applies. */
export function distanceBetweenCoordinatesMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const earthRadiusM = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Grid key for the address cache. ~11 m at four decimal places, so repeated polls
 * of a parked vehicle collapse onto one provider call.
 */
export function vehicleAddressCacheKey(
  companyId: string,
  latitude: number,
  longitude: number,
): string {
  return `${companyId}:${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}
