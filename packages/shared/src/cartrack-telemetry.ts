/**
 * Cartrack `/vehicles/status` telemetry, read honestly.
 *
 * Cartrack is the source of truth for where a vehicle is and what it is doing. The
 * provider returns far more per vehicle than a latitude/longitude, and every field is
 * optional in practice: a value is absent when the account, the hardware or the add-on
 * does not supply it. So each reading here is either a real provider value or `null`
 * with a reason — never a default, an inference or a placeholder.
 *
 * Field names below are the provider's own, taken from the payloads TITAN has stored in
 * `gps_positions.raw_payload` for the connected Young Guns account.
 */

import {
  formatVehiclePositionCoordinates,
  type VehicleAddressPrecision,
  type VehiclePositionAddress,
  type VehiclePositionAddressResult,
} from './vehicle-position-address.js';

export {
  CARTRACK_SYNC_INTERVAL_MS,
  FLEET_POSITION_DELAYED_MS,
  FLEET_POSITION_FRESH_MS,
  FLEET_POSITION_OFFLINE_MS,
  describeVehiclePositionFreshness,
  deriveVehiclePositionFreshness,
  formatVehiclePositionFreshnessLabel,
  isPositionBehaviourUnreliable,
  type VehiclePositionFreshness,
} from './fleet-tracking.js';

/**
 * Cartrack reports odometer in metres for this account (a reading of 129_343_500
 * is 129 343 km, consistent with the vehicle's age). Kept as a named constant so the
 * conversion is never mistaken for an arbitrary scale factor.
 */
export const CARTRACK_ODOMETER_UNITS_PER_KM = 1000;

/** Below this the vehicle is not meaningfully moving, matching the existing motion label. */
export const VEHICLE_MOVING_SPEED_KMH = 3;

/**
 * Why a telemetry reading is missing. Distinguishes "the account cannot give us this"
 * from "the vehicle simply isn't reporting it right now", because the two lead to very
 * different operator decisions.
 */
export type TelemetryUnavailableReason =
  | 'not_supplied'
  | 'no_sensor_fitted'
  | 'no_driver_identified'
  | 'not_applicable';

export type TelemetryReading<T> =
  | { status: 'supplied'; value: T }
  | { status: 'unavailable'; reason: TelemetryUnavailableReason };

export function suppliedReading<T>(value: T): TelemetryReading<T> {
  return { status: 'supplied', value };
}

export function unavailableReading<T>(
  reason: TelemetryUnavailableReason,
): TelemetryReading<T> {
  return { status: 'unavailable', reason };
}

export function readingValue<T>(reading: TelemetryReading<T> | null | undefined): T | null {
  return reading?.status === 'supplied' ? reading.value : null;
}

/** Driver identity as Cartrack knows it — from a driver tag, not from a TITAN guess. */
export type CartrackDriverIdentity = {
  driverId: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phoneNumber: string | null;
  /** Tag presented to the reader, when the account uses driver identification. */
  driverTag: string | null;
};

export type CartrackFuelReading = {
  litres: number | null;
  percentageLeft: number | null;
  totalConsumed: number | null;
  updatedAt: string | null;
};

/**
 * One parsed Cartrack status reading. Positional fields are non-null because a status
 * row without a usable coordinate is rejected before it reaches here; everything else
 * is a `TelemetryReading` so an absent value carries its reason.
 */
export type CartrackVehicleTelemetry = {
  externalVehicleId: string | null;
  registration: string | null;
  /** Provider event time — the moment the vehicle reported, not when TITAN read it. */
  recordedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  speedKmh: TelemetryReading<number>;
  /** Speed limit Cartrack attributes to the road the vehicle is on. */
  roadSpeedKmh: TelemetryReading<number>;
  heading: TelemetryReading<number>;
  ignitionOn: TelemetryReading<boolean>;
  idling: TelemetryReading<boolean>;
  odometerKm: TelemetryReading<number>;
  engineRpm: TelemetryReading<number>;
  altitudeM: TelemetryReading<number>;
  /** Cartrack's own readable description of the coordinate. */
  positionDescription: TelemetryReading<string>;
  /** Geofences Cartrack considers this position inside. */
  geofenceIds: TelemetryReading<string[]>;
  gpsFixType: TelemetryReading<number>;
  driver: TelemetryReading<CartrackDriverIdentity>;
  fuel: TelemetryReading<CartrackFuelReading>;
  /** External/vehicle battery voltage reported by the tracking unit. */
  externalVoltage: TelemetryReading<number>;
  /** Tracking unit's own battery/health percentage. */
  unitHealthPercentage: TelemetryReading<number>;
  temperaturesC: TelemetryReading<number[]>;
  chassisNumber: TelemetryReading<string>;
  engineType: TelemetryReading<string>;
  centralLockingStatus: TelemetryReading<string>;
  panicActive: TelemetryReading<boolean>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberFrom(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringFrom(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function booleanFrom(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'on', 'yes', '1', 'high'].includes(normalized)) return true;
    if (['false', 'off', 'no', '0', 'low'].includes(normalized)) return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return null;
}

/**
 * Cartrack timestamps arrive as `2026-08-04 10:03:12+02` — a space instead of `T`,
 * and a two-digit offset. `new Date` is unreliable on that shape across runtimes, so
 * normalise to ISO 8601 before parsing rather than risk a silently wrong time.
 */
export function parseCartrackTimestamp(value: unknown): string | null {
  const raw = stringFrom(value);
  if (!raw) return null;

  const normalized = raw
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
  }
  return parsed.toISOString();
}

function numericReading(
  value: unknown,
  reason: TelemetryUnavailableReason = 'not_supplied',
): TelemetryReading<number> {
  const parsed = numberFrom(value);
  return parsed === null ? unavailableReading(reason) : suppliedReading(parsed);
}

function booleanReading(
  value: unknown,
  reason: TelemetryUnavailableReason = 'not_supplied',
): TelemetryReading<boolean> {
  const parsed = booleanFrom(value);
  return parsed === null ? unavailableReading(reason) : suppliedReading(parsed);
}

function stringReading(
  value: unknown,
  reason: TelemetryUnavailableReason = 'not_supplied',
): TelemetryReading<string> {
  const parsed = stringFrom(value);
  return parsed === null ? unavailableReading(reason) : suppliedReading(parsed);
}

function parseDriver(value: unknown): TelemetryReading<CartrackDriverIdentity> {
  const record = asRecord(value);
  if (!record) return unavailableReading('no_driver_identified');

  const firstName = stringFrom(record.first_name ?? record.firstName);
  const lastName = stringFrom(record.last_name ?? record.lastName);
  const driverId = stringFrom(record.driver_id ?? record.driverId);
  const driverTag = stringFrom(record.driver_id_tag ?? record.driverIdTag);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;

  // Cartrack returns the driver object with every field null when no tag was presented.
  if (!fullName && !driverId && !driverTag) {
    return unavailableReading('no_driver_identified');
  }

  return suppliedReading({
    driverId,
    firstName,
    lastName,
    fullName,
    phoneNumber: stringFrom(record.phone_number ?? record.phoneNumber),
    driverTag,
  });
}

function parseFuel(value: unknown): TelemetryReading<CartrackFuelReading> {
  const record = asRecord(value);
  if (!record) return unavailableReading('no_sensor_fitted');

  const litres = numberFrom(record.level);
  // The provider ships this key misspelled; accept both rather than lose the reading.
  const percentageLeft = numberFrom(record.precentage_left ?? record.percentage_left);
  const totalConsumed = numberFrom(record.total_consumed ?? record.totalConsumed);
  const updatedAt = parseCartrackTimestamp(record.updated);

  if (litres === null && percentageLeft === null && totalConsumed === null) {
    return unavailableReading('no_sensor_fitted');
  }

  return suppliedReading({ litres, percentageLeft, totalConsumed, updatedAt });
}

function parseTemperatures(record: Record<string, unknown>): TelemetryReading<number[]> {
  const values = [record.temp1, record.temp2, record.temp3, record.temp4]
    .map(numberFrom)
    .filter((value): value is number => value !== null);
  return values.length === 0 ? unavailableReading('no_sensor_fitted') : suppliedReading(values);
}

function parseGeofenceIds(value: unknown): TelemetryReading<string[]> {
  if (!Array.isArray(value)) return unavailableReading('not_supplied');
  const ids = value.map(stringFrom).filter((id): id is string => id !== null);
  return suppliedReading(ids);
}

/**
 * Parse one raw Cartrack status row. Accepts the provider's nested shape
 * (`location.latitude`, `driver.first_name`) as well as flattened variants, so payloads
 * captured by older sync runs still read correctly.
 */
export function parseCartrackStatusPayload(payload: unknown): CartrackVehicleTelemetry {
  const record = asRecord(payload) ?? {};
  const location = asRecord(record.location) ?? record;

  const odometerRaw = numberFrom(record.odometer);

  return {
    externalVehicleId: stringFrom(record.vehicle_id ?? record.vehicleId),
    registration: stringFrom(record.registration ?? record.registration_number),
    recordedAt:
      parseCartrackTimestamp(location.updated) ??
      parseCartrackTimestamp(record.event_ts) ??
      parseCartrackTimestamp(record.updated_location_ts) ??
      null,
    latitude: numberFrom(location.latitude ?? location.lat),
    longitude: numberFrom(location.longitude ?? location.lng ?? location.lon),
    speedKmh: numericReading(record.speed),
    roadSpeedKmh: numericReading(record.road_speed ?? record.roadSpeed),
    heading: numericReading(record.bearing ?? record.heading),
    ignitionOn: booleanReading(record.ignition),
    idling: booleanReading(record.idling),
    odometerKm:
      odometerRaw === null
        ? unavailableReading('not_supplied')
        : suppliedReading(odometerRaw / CARTRACK_ODOMETER_UNITS_PER_KM),
    engineRpm: numericReading(record.rpm),
    altitudeM: numericReading(record.altitude),
    positionDescription: stringReading(location.position_description),
    geofenceIds: parseGeofenceIds(location.geofence_ids),
    gpsFixType: numericReading(location.gps_fix_type),
    driver: parseDriver(record.driver),
    fuel: parseFuel(record.fuel),
    externalVoltage: numericReading(record.vext),
    unitHealthPercentage: numericReading(record.tcu_percentage),
    temperaturesC: parseTemperatures(record),
    chassisNumber: stringReading(record.chassis_number),
    engineType: stringReading(record.engine_type),
    centralLockingStatus: stringReading(record.central_locking_status, 'not_applicable'),
    panicActive: booleanReading(record.io_panic),
  };
}

/* ------------------------------------------------------------------------- *
 * Motion state
 * ------------------------------------------------------------------------- */

/**
 * What the vehicle is doing, in the words an operator uses. Derived only from provider
 * speed and ignition — never from the gap between two positions, which would turn a
 * missed poll into invented movement.
 */
export type VehicleMotionState = 'moving' | 'idling' | 'parked' | 'offline' | 'unknown';

export function deriveVehicleMotionState(input: {
  speedKmh: number | null | undefined;
  ignitionOn?: boolean | null;
  idling?: boolean | null;
  /** True when the position is too old to describe the vehicle's current behaviour. */
  positionOffline?: boolean;
}): VehicleMotionState {
  const speed = typeof input.speedKmh === 'number' && Number.isFinite(input.speedKmh)
    ? input.speedKmh
    : null;

  if (input.positionOffline) {
    // A tracker reports rarely once the vehicle is parked, so silence after an
    // ignition-off, stationary reading is expected and is not evidence of a fault: the
    // vehicle was parked and nothing says it moved. Silence after a vehicle was driving
    // is different — we genuinely do not know where it is, and must say so.
    const wasParked =
      input.ignitionOn === false && (speed === null || speed < VEHICLE_MOVING_SPEED_KMH);
    return wasParked ? 'parked' : 'offline';
  }

  if (speed !== null && speed >= VEHICLE_MOVING_SPEED_KMH) return 'moving';

  // Ignition on but stationary is idling — a real, separately reported provider state.
  if (input.idling === true) return 'idling';
  if (input.ignitionOn === true && speed !== null && speed < VEHICLE_MOVING_SPEED_KMH) {
    return 'idling';
  }
  if (input.ignitionOn === false) return 'parked';
  if (speed !== null && speed < VEHICLE_MOVING_SPEED_KMH) return 'parked';

  return 'unknown';
}

export function formatVehicleMotionStateLabel(state: VehicleMotionState): string {
  switch (state) {
    case 'moving':
      return 'Moving';
    case 'idling':
      return 'Idling';
    case 'parked':
      return 'Parked';
    case 'offline':
      return 'Offline';
    case 'unknown':
      return 'Status unknown';
  }
}

/** Indicator tone for the status dot beside the plate. */
export type VehicleStatusTone = 'active' | 'attention' | 'neutral' | 'muted';

export function deriveVehicleStatusTone(state: VehicleMotionState): VehicleStatusTone {
  switch (state) {
    case 'moving':
      return 'active';
    case 'idling':
      return 'attention';
    case 'parked':
      return 'neutral';
    case 'offline':
    case 'unknown':
      return 'muted';
  }
}

/* ------------------------------------------------------------------------- *
 * Readable location from Cartrack's own description
 * ------------------------------------------------------------------------- */

/** Country names carry no operational meaning for a single-country fleet. */
const ADDRESS_NOISE_PARTS = new Set(['south africa', 'za', 'rsa']);

/**
 * A leading house/unit number is what separates "this property" from "this road".
 * `49A Viking Dr` qualifies; `R302` (a route number) and `Viking Dr` do not.
 */
export function hasStreetNumber(street: string | null | undefined): boolean {
  return /^\d+[a-z]?\s+\S/i.test((street ?? '').trim());
}

export type CartrackAddressComponents = {
  street: string | null;
  suburb: string | null;
  /** Town or city, present only when the provider distinguished one from the suburb. */
  city: string | null;
  /** Province — always the last part the provider gives before the country. */
  region: string | null;
  /** Street + suburb — the primary line for list rows and cards. */
  shortLine: string;
  /** Town + province — the secondary line beneath the street. */
  areaLine: string;
  /** Everything the provider supplied, for the fuller detail surfaces. */
  fullLine: string;
  precision: VehicleAddressPrecision;
};

/**
 * Split Cartrack's `position_description` into components.
 *
 * The provider returns a variable number of comma-separated parts, always ending with the
 * country and the province before it:
 *
 *   `Heerengracht St, Skoongesig, Durbanville, Western Cape, South Africa`
 *   `R302, Durbanville, Western Cape, South Africa`
 *
 * So the province is read from the end rather than a fixed index — reading positionally
 * would label Durbanville a province in the first example.
 */
export function parseCartrackPositionDescription(
  description: string | null | undefined,
): CartrackAddressComponents | null {
  const raw = description?.trim();
  if (!raw) return null;

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !ADDRESS_NOISE_PARTS.has(part.toLowerCase()));

  if (parts.length === 0) return null;

  const street = parts[0] ?? null;
  // With the street taken and the province at the end, anything left between them is
  // the suburb and, where the provider gave one, the town.
  const region = parts.length > 1 ? (parts[parts.length - 1] ?? null) : null;
  const middle = parts.slice(1, Math.max(1, parts.length - 1));
  const suburb = middle[0] ?? null;
  const city = middle.length > 1 ? (middle[middle.length - 1] ?? null) : null;

  const shortLine = [street, suburb].filter(Boolean).join(', ');
  const areaLine = [city, region].filter(Boolean).join(', ');
  const fullLine = [street, suburb, city, region].filter(Boolean).join(', ');

  return {
    street,
    suburb,
    city,
    region,
    shortLine: shortLine || raw,
    areaLine,
    fullLine: fullLine || raw,
    // Cartrack describes the road, not the building, unless a street number is present.
    precision: hasStreetNumber(street) ? 'precise' : 'approximate',
  };
}

/**
 * Turn Cartrack's own position description into a resolved address.
 *
 * Preferred over reverse-geocoding: the provider already resolved this coordinate, so
 * using it costs no Google quota, cannot drift from the telemetry it came with, and
 * removes the duplicate lookup entirely. Google remains the fallback for coordinates
 * Cartrack did not describe.
 */
export function cartrackNativeAddressResult(input: {
  positionDescription: string | null | undefined;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  recordedAt: string | null | undefined;
}): VehiclePositionAddressResult | null {
  const components = parseCartrackPositionDescription(input.positionDescription);
  if (!components) return null;
  if (typeof input.latitude !== 'number' || typeof input.longitude !== 'number') return null;

  const address: VehiclePositionAddress = {
    formattedAddress: components.fullLine,
    shortAddress: components.shortLine,
    street: components.street,
    suburb: components.suburb,
    city: components.city ?? components.region,
    region: components.region,
    placeId: null,
    precision: components.precision,
    resolvedForLatitude: input.latitude,
    resolvedForLongitude: input.longitude,
    resolvedAt: input.recordedAt ?? new Date().toISOString(),
    source: 'cartrack',
  };

  return { status: 'resolved', address };
}

/* ------------------------------------------------------------------------- *
 * Formatters for the operator-facing card
 * ------------------------------------------------------------------------- */

/** `Speed: 67 km/h`, or null when Cartrack supplied no speed. */
export function formatVehicleSpeedValue(
  reading: TelemetryReading<number> | null | undefined,
): string | null {
  const value = readingValue(reading);
  return value === null ? null : `${Math.round(value)} km/h`;
}

/** The posted limit Cartrack attributes to the road, omitted when not supplied. */
export function formatRoadSpeedValue(
  reading: TelemetryReading<number> | null | undefined,
): string | null {
  const value = readingValue(reading);
  return value === null || value <= 0 ? null : `${Math.round(value)} km/h`;
}

export function formatIgnitionValue(
  reading: TelemetryReading<boolean> | null | undefined,
): string | null {
  const value = readingValue(reading);
  if (value === null) return null;
  return value ? 'ON' : 'OFF';
}

/**
 * Whole kilometres with thousands separators. Truncated rather than rounded so the
 * reading can never claim more distance than the vehicle has actually covered.
 */
export function formatOdometerValue(
  reading: TelemetryReading<number> | null | undefined,
): string | null {
  const value = readingValue(reading);
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return `${Math.floor(value).toLocaleString('en-ZA').replace(/\u00a0/g, ' ')} km`;
}

/** Young Guns operational timezone — Cartrack timestamps are interpreted in SAST. */
export const CARTRACK_OPERATIONAL_TIME_ZONE = 'Africa/Johannesburg';

/** Local wall-clock time of the provider's reading in SAST, e.g. `10:01`. */
export function formatPositionUpdatedTime(
  recordedAt: string | null | undefined,
  locale = 'en-ZA',
): string | null {
  if (!recordedAt) return null;
  const date = new Date(recordedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: CARTRACK_OPERATIONAL_TIME_ZONE,
  });
}

/** Driver name from a Cartrack tag or a TITAN assignment, else an honest `Unassigned`. */
export function resolveVehicleDriverLabel(input: {
  cartrackDriver?: TelemetryReading<CartrackDriverIdentity> | null;
  assignedUserName?: string | null;
}): { label: string; source: 'cartrack_tag' | 'titan_assignment' | 'unassigned' } {
  const driver = readingValue(input.cartrackDriver ?? null);
  if (driver?.fullName) return { label: driver.fullName, source: 'cartrack_tag' };

  const assigned = input.assignedUserName?.trim();
  if (assigned) return { label: assigned, source: 'titan_assignment' };

  return { label: 'Unassigned', source: 'unassigned' };
}

/** Whether the vehicle exceeded the limit Cartrack attributed to the road. */
export type RoadSpeedCompliance = 'within_limit' | 'over_limit' | 'unknown';

export function deriveRoadSpeedCompliance(input: {
  speedKmh: TelemetryReading<number> | null | undefined;
  roadSpeedKmh: TelemetryReading<number> | null | undefined;
  /** Absorbs GPS speed jitter so a rounding artefact is not reported as speeding. */
  toleranceKmh?: number;
}): RoadSpeedCompliance {
  const speed = readingValue(input.speedKmh ?? null);
  const limit = readingValue(input.roadSpeedKmh ?? null);
  if (speed === null || limit === null || limit <= 0) return 'unknown';
  return speed > limit + (input.toleranceKmh ?? 2) ? 'over_limit' : 'within_limit';
}

/** Coordinates for the secondary line / "View coordinates" action. */
export function formatSecondaryCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  return formatVehiclePositionCoordinates(latitude, longitude);
}
