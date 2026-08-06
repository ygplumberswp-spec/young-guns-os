/**
 * One description of a vehicle, shared by every surface that shows one.
 *
 * The Owner's Fleet Overview row and the expanded vehicle card are two renderings of the
 * same facts, so both are derived here. That is what keeps a vehicle from reading as
 * "Moving" on the dashboard and "Parked" on the map, or precise on one screen and
 * approximate on another.
 *
 * Display order is fixed by the brief: plate, status, readable street and area, updated
 * time and freshness, then speed. Coordinates are demoted to secondary text but never
 * dropped — they remain the source of truth behind the readable line.
 */

import {
  deriveRoadSpeedCompliance,
  deriveVehicleMotionState,
  deriveVehicleStatusTone,
  formatIgnitionValue,
  formatOdometerValue,
  formatPositionUpdatedTime,
  formatRoadSpeedValue,
  formatSecondaryCoordinates,
  formatVehicleMotionStateLabel,
  formatVehicleSpeedValue,
  readingValue,
  resolveVehicleDriverLabel,
  type CartrackDriverIdentity,
  type RoadSpeedCompliance,
  type TelemetryReading,
  type VehicleMotionState,
  type VehicleStatusTone,
} from './cartrack-telemetry.js';
import {
  describeVehiclePositionFreshness,
  deriveVehiclePositionFreshness,
  formatVehiclePositionFreshnessLabel,
  isPositionBehaviourUnreliable,
  type VehiclePositionFreshness,
} from './fleet-tracking.js';
import {
  formatVehiclePositionFreshness,
  resolveVehiclePositionAddressDisplay,
  type VehicleAddressDisplay,
  type VehiclePositionAddressResult,
} from './vehicle-position-address.js';

/** Telemetry a surface needs, in the readings shape the parser produces. */
export type VehicleCardTelemetryInput = {
  speedKmh?: TelemetryReading<number> | null;
  roadSpeedKmh?: TelemetryReading<number> | null;
  ignitionOn?: TelemetryReading<boolean> | null;
  idling?: TelemetryReading<boolean> | null;
  odometerKm?: TelemetryReading<number> | null;
  heading?: TelemetryReading<number> | null;
  driver?: TelemetryReading<CartrackDriverIdentity> | null;
};

export type VehicleCardInput = {
  licensePlate: string | null;
  vehicleName?: string | null;
  externalVehicleId?: string | null;
  latitude: number | null;
  longitude: number | null;
  recordedAt: string | null;
  cartrackConnected: boolean;
  address: VehiclePositionAddressResult | null;
  telemetry: VehicleCardTelemetryInput;
  /** TITAN's own vehicle→user assignment, used when no Cartrack driver tag is present. */
  assignedUserName?: string | null;
  /** Real TITAN job currently assigned to this vehicle, when one is. */
  assignedJob?: { id: string; reference: string } | null;
  nowMs?: number;
};

export type VehicleCardModel = {
  /** Primary identifier — the plate, falling back to whatever identity exists. */
  plate: string;
  /** Shown after the plate only when it adds something the plate does not. */
  secondaryName: string | null;
  motionState: VehicleMotionState;
  statusLabel: string;
  statusTone: VehicleStatusTone;
  /** Readable street and suburb — the primary location line. Never coordinates. */
  location: VehicleAddressDisplay;
  /**
   * Town and province beneath the street, when Cartrack supplied them. Null rather than
   * a guessed city — "Western Cape" is never rewritten into "Cape Town".
   */
  locationArea: string | null;
  /** Coordinates for secondary text or a "View coordinates" action. */
  coordinates: string | null;
  freshness: VehiclePositionFreshness;
  freshnessLabel: string;
  freshnessNote: string;
  /** `10:01` — local time of the provider's reading. */
  updatedAtTime: string | null;
  /** `Updated 13 minutes ago`. */
  updatedAgoLabel: string;
  /** Present only when Cartrack supplied a speed. */
  speedValue: string | null;
  /** Present only when Cartrack supplied a road speed. */
  roadSpeedValue: string | null;
  roadSpeedCompliance: RoadSpeedCompliance;
  /** `ON` / `OFF`, or null when not supplied. */
  ignitionValue: string | null;
  /** `129 343 km`, or null when not supplied. */
  odometerValue: string | null;
  driverLabel: string;
  driverSource: 'cartrack_tag' | 'titan_assignment' | 'unassigned';
  assignedJob: { id: string; reference: string } | null;
  headingDegrees: number | null;
  /** True when the marker must be held still rather than treated as current. */
  holdingLastKnownPosition: boolean;
};

export function buildVehicleCardModel(input: VehicleCardInput): VehicleCardModel {
  const freshness = deriveVehiclePositionFreshness({
    recordedAt: input.recordedAt,
    cartrackConnected: input.cartrackConnected,
    nowMs: input.nowMs,
  });
  const holdingLastKnownPosition = isPositionBehaviourUnreliable(freshness);

  // A stale reading cannot describe present behaviour, so movement is reported as
  // offline rather than replaying whatever the vehicle was doing hours ago.
  const motionState = deriveVehicleMotionState({
    speedKmh: readingValue(input.telemetry.speedKmh ?? null),
    ignitionOn: readingValue(input.telemetry.ignitionOn ?? null),
    idling: readingValue(input.telemetry.idling ?? null),
    positionOffline: holdingLastKnownPosition,
  });

  const location = resolveVehiclePositionAddressDisplay({
    result: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
    recordedAt: input.recordedAt,
    cartrackConnected: input.cartrackConnected,
    nowMs: input.nowMs,
    compact: true,
  });

  const plate =
    input.licensePlate?.trim() ||
    input.vehicleName?.trim() ||
    input.externalVehicleId?.trim() ||
    'Unknown vehicle';
  const name = input.vehicleName?.trim() || null;

  // Speed is only meaningful for a reading that still describes the vehicle now.
  const speedValue = holdingLastKnownPosition
    ? null
    : formatVehicleSpeedValue(input.telemetry.speedKmh ?? null);

  return {
    plate,
    secondaryName: name && name !== plate ? name : null,
    motionState,
    statusLabel: formatVehicleMotionStateLabel(motionState),
    statusTone: deriveVehicleStatusTone(motionState),
    location,
    locationArea: resolveLocationArea(input.address),
    coordinates: formatSecondaryCoordinates(input.latitude, input.longitude),
    freshness,
    freshnessLabel: formatVehiclePositionFreshnessLabel(freshness),
    freshnessNote: describeVehiclePositionFreshness({ freshness }),
    updatedAtTime: formatPositionUpdatedTime(input.recordedAt),
    updatedAgoLabel: formatVehiclePositionFreshness(input.recordedAt, input.nowMs),
    speedValue,
    roadSpeedValue: formatRoadSpeedValue(input.telemetry.roadSpeedKmh ?? null),
    roadSpeedCompliance: holdingLastKnownPosition
      ? 'unknown'
      : deriveRoadSpeedCompliance({
          speedKmh: input.telemetry.speedKmh ?? null,
          roadSpeedKmh: input.telemetry.roadSpeedKmh ?? null,
        }),
    ignitionValue: formatIgnitionValue(input.telemetry.ignitionOn ?? null),
    odometerValue: formatOdometerValue(input.telemetry.odometerKm ?? null),
    ...resolveDriver(input),
    assignedJob: input.assignedJob ?? null,
    headingDegrees: readingValue(input.telemetry.heading ?? null),
    holdingLastKnownPosition,
  };
}

/**
 * The town/province line under the street, taken from whatever the address source
 * actually resolved. Returns null rather than repeating the suburb already shown above.
 */
function resolveLocationArea(
  result: VehiclePositionAddressResult | null,
): string | null {
  if (result?.status !== 'resolved') return null;
  const { city, region, suburb } = result.address;
  const parts = [city === suburb ? null : city, region]
    .filter((part): part is string => Boolean(part))
    // The province can arrive duplicated into `city` when no town was distinguished.
    .filter((part, index, all) => all.indexOf(part) === index);
  return parts.length > 0 ? parts.join(', ') : null;
}

function resolveDriver(input: VehicleCardInput): {
  driverLabel: string;
  driverSource: 'cartrack_tag' | 'titan_assignment' | 'unassigned';
} {
  const resolved = resolveVehicleDriverLabel({
    cartrackDriver: input.telemetry.driver ?? null,
    assignedUserName: input.assignedUserName ?? null,
  });
  return { driverLabel: resolved.label, driverSource: resolved.source };
}

/**
 * The compact Fleet Overview row.
 *
 * Speed is omitted rather than shown as zero when the vehicle is not moving, and the
 * location line is the readable street and area — matching the Owner's format exactly
 * while every value stays traceable to a provider reading.
 */
export type FleetOverviewRow = {
  plate: string;
  statusTone: VehicleStatusTone;
  driverLine: string;
  statusLine: string;
  /** Omitted when the vehicle is not moving or Cartrack supplied no speed. */
  speedLine: string | null;
  locationLine: string;
  updatedLine: string;
  /** Qualifier for the location line when it is not an exact current address. */
  locationNote: string | null;
  freshnessLabel: string;
};

export function buildFleetOverviewRow(model: VehicleCardModel): FleetOverviewRow {
  return {
    plate: model.plate,
    statusTone: model.statusTone,
    driverLine: `Driver: ${model.driverLabel}`,
    statusLine: `Status: ${model.statusLabel}`,
    speedLine:
      model.motionState === 'moving' && model.speedValue ? `Speed: ${model.speedValue}` : null,
    locationLine: `Location: ${model.location.line}`,
    updatedLine: model.updatedAtTime ? `Updated: ${model.updatedAtTime}` : 'Updated: unknown',
    locationNote: model.location.note,
    freshnessLabel: model.freshnessLabel,
  };
}

/**
 * Rows for the expanded vehicle card, in the Owner's order. A field with no provider
 * value is left out entirely rather than rendered as "—", so the card only ever shows
 * numbers Cartrack actually supplied.
 */
export function buildVehicleCardDetailRows(
  model: VehicleCardModel,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];

  if (model.updatedAtTime) rows.push({ label: 'Updated', value: model.updatedAtTime });
  if (model.speedValue) rows.push({ label: 'Speed', value: model.speedValue });
  if (model.roadSpeedValue) rows.push({ label: 'Road Speed', value: model.roadSpeedValue });
  if (model.ignitionValue) rows.push({ label: 'Ignition', value: model.ignitionValue });
  if (model.odometerValue) rows.push({ label: 'Odometer', value: model.odometerValue });

  return rows;
}
