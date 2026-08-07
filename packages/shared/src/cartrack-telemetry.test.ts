import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFleetOverviewRow,
  buildVehicleCardDetailRows,
  buildVehicleCardModel,
  buildVehicleTrail,
  cartrackNativeAddressResult,
  describeFollowMode,
  describeVehicleTrail,
  deriveRoadSpeedCompliance,
  deriveVehicleMotionState,
  deriveVehiclePositionFreshness,
  followModeReducer,
  formatOdometerValue,
  formatVehiclePositionFreshnessLabel,
  hasStreetNumber,
  initialFollowModeState,
  parseCartrackPositionDescription,
  parseCartrackStatusPayload,
  parseCartrackTimestamp,
  readingValue,
  resolveActiveFollowTarget,
  resolveVehiclePositionAddressDisplay,
  resolveVehicleDriverLabel,
} from './index.js';

/**
 * Verbatim Cartrack `/vehicles/status` payload for CF77263, captured from the connected
 * Young Guns account on staging (`gps_positions.raw_payload`, recorded 2026-08-04
 * 10:03:12+02). Used as the fixture so the parser is tested against the provider's real
 * shape — including the fields it returns as null for this account's hardware.
 */
const CF77263_STATUS = {
  rpm: 0,
  fuel: { level: null, updated: null, total_consumed: null, precentage_left: null },
  vext: '13.400',
  clock: 102694,
  speed: 28,
  temp1: null,
  temp2: null,
  temp3: null,
  temp4: null,
  driver: {
    driver_id: null,
    id_number: null,
    last_name: null,
    first_name: null,
    phone_number: null,
    driver_id_tag: null,
    license_number: null,
  },
  idling: false,
  bearing: 240,
  altitude: 168,
  electric: {
    battery_ts: null,
    charging_status: null,
    charging_status_ts: null,
    battery_percentage_left: null,
  },
  event_ts: '2026-08-04 10:03:12+02',
  ignition: true,
  io_panic: 'LOW',
  location: {
    updated: '2026-08-04 10:03:12+02',
    latitude: -33.825466,
    longitude: 18.656742,
    geofence_ids: [],
    gps_fix_type: 3,
    position_description: 'R302, Durbanville, Western Cape, South Africa',
  },
  odometer: 129343500,
  io_disarm: 'LOW',
  road_speed: 60,
  vehicle_id: 609838290,
  engine_type: 'Combustion',
  registration: 'CF77263',
  chassis_number: 'ADMEF4HR2F4722170',
  tcu_percentage: 100,
  central_locking_status: null,
  last_identification_tag_id: null,
} as const;

/** Second real vehicle — parked, ignition off, different suburb. */
const CF172047_STATUS = {
  ...CF77263_STATUS,
  speed: 0,
  ignition: false,
  bearing: 147,
  vehicle_id: 609838677,
  registration: 'CF172047',
  event_ts: '2026-08-04 09:43:21+02',
  location: {
    updated: '2026-08-04 09:43:21+02',
    latitude: -33.829388,
    longitude: 18.717487,
    geofence_ids: [],
    gps_fix_type: 3,
    position_description: 'Viking Dr, Kraaifontein, Western Cape, South Africa',
  },
} as const;

/** 10:04:12+02 — one minute after CF77263 reported. */
const NOW = new Date('2026-08-04T08:04:12.000Z').getTime();

describe('cartrack status payload parsing', () => {
  it('reads the fields the provider actually supplies for CF77263', () => {
    const telemetry = parseCartrackStatusPayload(CF77263_STATUS);

    assert.equal(telemetry.registration, 'CF77263');
    assert.equal(telemetry.externalVehicleId, '609838290');
    assert.equal(telemetry.latitude, -33.825466);
    assert.equal(telemetry.longitude, 18.656742);
    assert.equal(readingValue(telemetry.speedKmh), 28);
    assert.equal(readingValue(telemetry.roadSpeedKmh), 60);
    assert.equal(readingValue(telemetry.heading), 240);
    assert.equal(readingValue(telemetry.ignitionOn), true);
    assert.equal(readingValue(telemetry.idling), false);
    assert.equal(readingValue(telemetry.gpsFixType), 3);
    assert.equal(readingValue(telemetry.chassisNumber), 'ADMEF4HR2F4722170');
    assert.equal(readingValue(telemetry.externalVoltage), 13.4);
    assert.equal(readingValue(telemetry.unitHealthPercentage), 100);
  });

  it('converts the provider odometer into kilometres', () => {
    const telemetry = parseCartrackStatusPayload(CF77263_STATUS);
    assert.equal(readingValue(telemetry.odometerKm), 129_343.5);
    assert.equal(formatOdometerValue(telemetry.odometerKm), '129 343 km');
  });

  it('reports hardware the account does not have as unavailable, not zero', () => {
    const telemetry = parseCartrackStatusPayload(CF77263_STATUS);

    assert.equal(telemetry.fuel.status, 'unavailable');
    assert.equal(
      telemetry.fuel.status === 'unavailable' ? telemetry.fuel.reason : null,
      'no_sensor_fitted',
    );
    assert.equal(telemetry.temperaturesC.status, 'unavailable');
    assert.equal(readingValue(telemetry.fuel), null);
  });

  it('reports an unidentified driver as unavailable rather than an empty name', () => {
    const telemetry = parseCartrackStatusPayload(CF77263_STATUS);
    assert.equal(telemetry.driver.status, 'unavailable');
    assert.equal(
      telemetry.driver.status === 'unavailable' ? telemetry.driver.reason : null,
      'no_driver_identified',
    );
  });

  it('reads a driver identity when a tag was presented', () => {
    const telemetry = parseCartrackStatusPayload({
      ...CF77263_STATUS,
      driver: { ...CF77263_STATUS.driver, first_name: 'Keanu', last_name: 'Venter' },
    });
    assert.equal(readingValue(telemetry.driver)?.fullName, 'Keanu Venter');
  });

  it('parses the provider timestamp shape without shifting the moment', () => {
    assert.equal(parseCartrackTimestamp('2026-08-04 10:03:12+02'), '2026-08-04T08:03:12.000Z');
    assert.equal(parseCartrackTimestamp('2026-08-04 10:03:12+0200'), '2026-08-04T08:03:12.000Z');
    assert.equal(parseCartrackTimestamp(null), null);
    assert.equal(parseCartrackTimestamp('not a date'), null);
  });

  it('never invents readings from an empty payload', () => {
    const telemetry = parseCartrackStatusPayload({});
    assert.equal(telemetry.speedKmh.status, 'unavailable');
    assert.equal(telemetry.ignitionOn.status, 'unavailable');
    assert.equal(telemetry.odometerKm.status, 'unavailable');
    assert.equal(telemetry.latitude, null);
  });
});

describe('readable street and area from the provider description', () => {
  it('splits the provider description and drops the country', () => {
    const parsed = parseCartrackPositionDescription(
      'R302, Durbanville, Western Cape, South Africa',
    );
    assert.equal(parsed?.street, 'R302');
    assert.equal(parsed?.suburb, 'Durbanville');
    assert.equal(parsed?.city, null);
    assert.equal(parsed?.region, 'Western Cape');
    assert.equal(parsed?.shortLine, 'R302, Durbanville');
    assert.equal(parsed?.fullLine, 'R302, Durbanville, Western Cape');
  });

  it('reads the province from the end, not a fixed position', () => {
    // Real staging description for CF77263 — five parts, so a positional read would
    // label Durbanville the province.
    const parsed = parseCartrackPositionDescription(
      'Heerengracht St, Skoongesig, Durbanville, Western Cape, South Africa',
    );
    assert.equal(parsed?.street, 'Heerengracht St');
    assert.equal(parsed?.suburb, 'Skoongesig');
    assert.equal(parsed?.city, 'Durbanville');
    assert.equal(parsed?.region, 'Western Cape');
    assert.equal(parsed?.shortLine, 'Heerengracht St, Skoongesig');
    assert.equal(parsed?.areaLine, 'Durbanville, Western Cape');
  });

  it('gives the Owner two-line location from real staging values', () => {
    const telemetry = parseCartrackStatusPayload({
      ...CF77263_STATUS,
      location: {
        ...CF77263_STATUS.location,
        position_description:
          'Heerengracht St, Skoongesig, Durbanville, Western Cape, South Africa',
      },
    });
    const model = buildVehicleCardModel({
      licensePlate: 'CF77263',
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      recordedAt: telemetry.recordedAt,
      cartrackConnected: true,
      address: cartrackNativeAddressResult({
        positionDescription: readingValue(telemetry.positionDescription),
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        recordedAt: telemetry.recordedAt,
      }),
      telemetry,
      nowMs: NOW,
    });

    assert.equal(model.location.line, 'Heerengracht St, Skoongesig');
    assert.equal(model.locationArea, 'Durbanville, Western Cape');
    // The province is never rewritten into a city the provider did not name.
    assert.doesNotMatch(model.locationArea ?? '', /Cape Town/);
  });

  it('does not repeat the suburb as the area line', () => {
    const telemetry = parseCartrackStatusPayload(CF77263_STATUS);
    const model = buildVehicleCardModel({
      licensePlate: 'CF77263',
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      recordedAt: telemetry.recordedAt,
      cartrackConnected: true,
      address: cartrackNativeAddressResult({
        positionDescription: readingValue(telemetry.positionDescription),
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        recordedAt: telemetry.recordedAt,
      }),
      telemetry,
      nowMs: NOW,
    });

    assert.equal(model.location.line, 'R302, Durbanville');
    assert.equal(model.locationArea, 'Western Cape');
  });

  it('treats a road without a street number as road level, not a property address', () => {
    assert.equal(hasStreetNumber('Viking Dr'), false);
    assert.equal(hasStreetNumber('R302'), false);
    assert.equal(hasStreetNumber('49A Viking Dr'), true);
    assert.equal(
      parseCartrackPositionDescription('Viking Dr, Kraaifontein, Western Cape')?.precision,
      'approximate',
    );
    assert.equal(
      parseCartrackPositionDescription('49A Viking Dr, Kraaifontein, Western Cape')?.precision,
      'precise',
    );
  });

  it('shows a road-level provider address plainly but flags the unverified number', () => {
    const telemetry = parseCartrackStatusPayload(CF172047_STATUS);
    const address = cartrackNativeAddressResult({
      positionDescription: readingValue(telemetry.positionDescription),
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      recordedAt: telemetry.recordedAt,
    });

    const display = resolveVehiclePositionAddressDisplay({
      result: address,
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      recordedAt: telemetry.recordedAt,
      cartrackConnected: true,
      nowMs: NOW,
      compact: true,
    });

    assert.equal(display.state, 'street_level');
    assert.equal(display.line, 'Viking Dr, Kraaifontein');
    assert.doesNotMatch(display.line, /^-?\d+\.\d+/);
    assert.match(display.note ?? '', /street number is not verified/i);
    assert.equal(display.isExactAndCurrent, false);
  });

  it('resolves each of the two real vehicles to its own address', () => {
    const first = cartrackNativeAddressResult({
      positionDescription: readingValue(
        parseCartrackStatusPayload(CF77263_STATUS).positionDescription,
      ),
      latitude: -33.825466,
      longitude: 18.656742,
      recordedAt: null,
    });
    const second = cartrackNativeAddressResult({
      positionDescription: readingValue(
        parseCartrackStatusPayload(CF172047_STATUS).positionDescription,
      ),
      latitude: -33.829388,
      longitude: 18.717487,
      recordedAt: null,
    });

    assert.equal(
      first?.status === 'resolved' ? first.address.shortAddress : null,
      'R302, Durbanville',
    );
    assert.equal(
      second?.status === 'resolved' ? second.address.shortAddress : null,
      'Viking Dr, Kraaifontein',
    );
  });

  it('returns nothing when the provider supplied no description', () => {
    assert.equal(parseCartrackPositionDescription(null), null);
    assert.equal(parseCartrackPositionDescription('   '), null);
    assert.equal(
      cartrackNativeAddressResult({
        positionDescription: null,
        latitude: -33.8,
        longitude: 18.6,
        recordedAt: null,
      }),
      null,
    );
  });
});

describe('motion state from real telemetry only', () => {
  it('calls a vehicle with reported speed moving', () => {
    assert.equal(deriveVehicleMotionState({ speedKmh: 28, ignitionOn: true }), 'moving');
  });

  it('separates idling from parked using ignition, not a guess', () => {
    assert.equal(deriveVehicleMotionState({ speedKmh: 0, ignitionOn: true }), 'idling');
    assert.equal(deriveVehicleMotionState({ speedKmh: 0, ignitionOn: false }), 'parked');
    assert.equal(deriveVehicleMotionState({ speedKmh: 0, idling: true }), 'idling');
  });

  it('admits it does not know when the provider supplied nothing', () => {
    assert.equal(deriveVehicleMotionState({ speedKmh: null }), 'unknown');
  });

  it('reports offline when a moving vehicle goes silent, rather than replaying its speed', () => {
    assert.equal(
      deriveVehicleMotionState({ speedKmh: 67, ignitionOn: true, positionOffline: true }),
      'offline',
    );
  });

  it('keeps a parked vehicle parked when its tracker goes quiet', () => {
    // Trackers report rarely once a vehicle is parked, so silence after an ignition-off
    // reading is expected — the freshness badge carries the age, not a false fault.
    assert.equal(
      deriveVehicleMotionState({ speedKmh: 0, ignitionOn: false, positionOffline: true }),
      'parked',
    );
  });

  it('will not assume parked when ignition was never reported', () => {
    assert.equal(
      deriveVehicleMotionState({ speedKmh: null, positionOffline: true }),
      'offline',
    );
  });

  it('flags exceeding the provider road speed, and stays quiet without one', () => {
    assert.equal(
      deriveRoadSpeedCompliance({
        speedKmh: { status: 'supplied', value: 75 },
        roadSpeedKmh: { status: 'supplied', value: 60 },
      }),
      'over_limit',
    );
    assert.equal(
      deriveRoadSpeedCompliance({
        speedKmh: { status: 'supplied', value: 58 },
        roadSpeedKmh: { status: 'supplied', value: 60 },
      }),
      'within_limit',
    );
    assert.equal(
      deriveRoadSpeedCompliance({
        speedKmh: { status: 'supplied', value: 58 },
        roadSpeedKmh: { status: 'unavailable', reason: 'not_supplied' },
      }),
      'unknown',
    );
  });
});

describe('freshness against the real polling cadence', () => {
  const recordedAt = '2026-08-04T08:03:12.000Z';

  it('does not cry stale for a position as new as polling allows', () => {
    assert.equal(
      deriveVehiclePositionFreshness({ recordedAt, cartrackConnected: true, nowMs: NOW }),
      'live',
    );
    assert.equal(
      deriveVehiclePositionFreshness({
        recordedAt,
        cartrackConnected: true,
        nowMs: NOW + 10 * 60_000,
      }),
      'fresh',
    );
  });

  it('escalates through delayed, stale and offline as the gap grows', () => {
    const at = (ms: number) =>
      deriveVehiclePositionFreshness({ recordedAt, cartrackConnected: true, nowMs: NOW + ms });

    assert.equal(at(25 * 60_000), 'delayed');
    assert.equal(at(90 * 60_000), 'stale');
    assert.equal(at(8 * 60 * 60_000), 'offline');
  });

  it('is offline whenever Cartrack is not connected', () => {
    assert.equal(
      deriveVehiclePositionFreshness({ recordedAt, cartrackConnected: false, nowMs: NOW }),
      'offline',
    );
  });

  it('labels states in the Owner vocabulary', () => {
    assert.equal(formatVehiclePositionFreshnessLabel('live'), 'LIVE');
    assert.equal(formatVehiclePositionFreshnessLabel('delayed'), 'DELAYED');
    assert.equal(formatVehiclePositionFreshnessLabel('offline'), 'OFFLINE');
  });
});

describe('driver attribution', () => {
  it('prefers a Cartrack tag, then a TITAN assignment, then says Unassigned', () => {
    assert.deepEqual(
      resolveVehicleDriverLabel({
        cartrackDriver: {
          status: 'supplied',
          value: {
            driverId: '1',
            firstName: 'Keanu',
            lastName: 'Venter',
            fullName: 'Keanu Venter',
            phoneNumber: null,
            driverTag: null,
          },
        },
        assignedUserName: 'Someone Else',
      }),
      { label: 'Keanu Venter', source: 'cartrack_tag' },
    );

    assert.deepEqual(
      resolveVehicleDriverLabel({
        cartrackDriver: { status: 'unavailable', reason: 'no_driver_identified' },
        assignedUserName: 'Keanu Venter',
      }),
      { label: 'Keanu Venter', source: 'titan_assignment' },
    );

    assert.deepEqual(
      resolveVehicleDriverLabel({ cartrackDriver: null, assignedUserName: null }),
      { label: 'Unassigned', source: 'unassigned' },
    );
  });
});

describe('vehicle card model', () => {
  function modelFor(status: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
    const telemetry = parseCartrackStatusPayload(status);
    return buildVehicleCardModel({
      licensePlate: telemetry.registration,
      externalVehicleId: telemetry.externalVehicleId,
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      recordedAt: telemetry.recordedAt,
      cartrackConnected: true,
      address: cartrackNativeAddressResult({
        positionDescription: readingValue(telemetry.positionDescription),
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        recordedAt: telemetry.recordedAt,
      }),
      telemetry,
      nowMs: NOW,
      ...overrides,
    });
  }

  it('describes CF77263 from real telemetry in the Owner card format', () => {
    const model = modelFor(CF77263_STATUS);

    assert.equal(model.plate, 'CF77263');
    assert.equal(model.statusLabel, 'Moving');
    assert.equal(model.statusTone, 'active');
    assert.equal(model.location.line, 'R302, Durbanville');
    assert.equal(model.updatedAtTime, '10:03');
    assert.equal(model.speedValue, '28 km/h');
    assert.equal(model.roadSpeedValue, '60 km/h');
    assert.equal(model.ignitionValue, 'ON');
    assert.equal(model.odometerValue, '129 343 km');
    assert.equal(model.driverLabel, 'Unassigned');
    assert.equal(model.assignedJob, null);
    assert.equal(model.headingDegrees, 240);
    assert.equal(model.coordinates, '-33.82547, 18.65674');
  });

  it('describes the second real vehicle as parked without inventing a speed', () => {
    const model = modelFor(CF172047_STATUS);

    assert.equal(model.plate, 'CF172047');
    assert.equal(model.statusLabel, 'Parked');
    assert.equal(model.statusTone, 'neutral');
    assert.equal(model.location.line, 'Viking Dr, Kraaifontein');
    assert.equal(model.ignitionValue, 'OFF');
    assert.equal(buildFleetOverviewRow(model).speedLine, null);
  });

  it('omits fields the provider did not supply instead of showing placeholders', () => {
    const model = modelFor({
      ...CF77263_STATUS,
      road_speed: null,
      odometer: null,
      ignition: null,
    });

    assert.equal(model.roadSpeedValue, null);
    assert.equal(model.odometerValue, null);
    assert.equal(model.ignitionValue, null);

    const labels = buildVehicleCardDetailRows(model).map((row) => row.label);
    assert.ok(!labels.includes('Road Speed'));
    assert.ok(!labels.includes('Odometer'));
    assert.ok(!labels.includes('Ignition'));
    assert.ok(labels.includes('Speed'));
  });

  it('keeps the readable address primary and coordinates secondary', () => {
    const row = buildFleetOverviewRow(modelFor(CF77263_STATUS));
    assert.equal(row.locationLine, 'Location: R302, Durbanville');
    assert.doesNotMatch(row.locationLine, /-?\d+\.\d{4}/);
  });

  it('builds the Owner overview row for CF77263 exactly', () => {
    const row = buildFleetOverviewRow(modelFor(CF77263_STATUS));
    assert.deepEqual(
      {
        plate: row.plate,
        driver: row.driverLine,
        status: row.statusLine,
        speed: row.speedLine,
        location: row.locationLine,
        updated: row.updatedLine,
      },
      {
        plate: 'CF77263',
        driver: 'Driver: Unassigned',
        status: 'Status: Moving',
        speed: 'Speed: 28 km/h',
        location: 'Location: R302, Durbanville',
        updated: 'Updated: 10:03',
      },
    );
  });

  it('reports a long-silent moving vehicle as offline and drops its stale speed', () => {
    const telemetry = parseCartrackStatusPayload(CF77263_STATUS);
    const model = buildVehicleCardModel({
      licensePlate: telemetry.registration,
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      recordedAt: telemetry.recordedAt,
      cartrackConnected: true,
      address: null,
      telemetry,
      nowMs: NOW + 9 * 60 * 60_000,
    });

    assert.equal(model.freshnessLabel, 'OFFLINE');
    assert.equal(model.statusLabel, 'Offline');
    assert.equal(model.speedValue, null);
    assert.equal(model.holdingLastKnownPosition, true);
  });

  it('links a real assigned job and never fabricates one', () => {
    const withJob = modelFor(CF77263_STATUS, {
      assignedJob: { id: 'job-1', reference: 'JOB-1042 · Geyser replacement' },
    });
    assert.deepEqual(withJob.assignedJob, {
      id: 'job-1',
      reference: 'JOB-1042 · Geyser replacement',
    });
    assert.equal(modelFor(CF77263_STATUS).assignedJob, null);
  });
});

describe('follow vehicle mode', () => {
  it('starts off and follows the vehicle the operator picked', () => {
    assert.equal(resolveActiveFollowTarget(initialFollowModeState), null);

    const following = followModeReducer(initialFollowModeState, {
      type: 'follow',
      vehicleId: 'v-CF77263',
      label: 'CF77263',
    });
    assert.equal(following.followedVehicleId, 'v-CF77263');
    assert.equal(following.followedLabel, 'CF77263');
    assert.equal(resolveActiveFollowTarget(following), 'v-CF77263');
  });

  it('pauses re-centring when the operator moves the map, and resumes on request', () => {
    const following = followModeReducer(initialFollowModeState, {
      type: 'follow',
      vehicleId: 'v-CF77263',
    });

    const dragged = followModeReducer(following, { type: 'manual_map_move' });
    assert.equal(dragged.recenterPaused, true);
    assert.equal(dragged.followedVehicleId, 'v-CF77263', 'follow mode stays on while paused');
    assert.equal(resolveActiveFollowTarget(dragged), null, 'camera is released');

    const resumed = followModeReducer(dragged, { type: 'resume' });
    assert.equal(resumed.recenterPaused, false);
    assert.equal(resolveActiveFollowTarget(resumed), 'v-CF77263');
  });

  it('treats a repeated drag as one pause', () => {
    const dragged = followModeReducer(
      followModeReducer(initialFollowModeState, { type: 'follow', vehicleId: 'v-1' }),
      { type: 'manual_map_move' },
    );
    assert.equal(followModeReducer(dragged, { type: 'manual_map_move' }), dragged);
  });

  it('ignores a map move when nothing is being followed', () => {
    assert.equal(
      followModeReducer(initialFollowModeState, { type: 'manual_map_move' }),
      initialFollowModeState,
    );
  });

  it('clears everything on exit', () => {
    const dragged = followModeReducer(
      followModeReducer(initialFollowModeState, { type: 'follow', vehicleId: 'v-1' }),
      { type: 'manual_map_move' },
    );
    assert.deepEqual(followModeReducer(dragged, { type: 'exit' }), initialFollowModeState);
  });

  it('drops a stale pause when switching to another vehicle', () => {
    const dragged = followModeReducer(
      followModeReducer(initialFollowModeState, { type: 'follow', vehicleId: 'v-1' }),
      { type: 'manual_map_move' },
    );
    const switched = followModeReducer(dragged, { type: 'follow', vehicleId: 'v-2' });
    assert.equal(switched.recenterPaused, false);
    assert.equal(switched.followedVehicleId, 'v-2');
  });

  it('states the polling reality and never claims streaming', () => {
    const status = describeFollowMode({
      state: followModeReducer(initialFollowModeState, {
        type: 'follow',
        vehicleId: 'v-CF77263',
      }),
      vehicleId: 'v-CF77263',
      recordedAt: '2026-08-04T08:03:12.000Z',
      cartrackConnected: true,
      uiRefreshIntervalMs: 15_000,
      lastSuccessfulRefreshAt: '2026-08-04T08:04:00.000Z',
      nowMs: NOW,
    });

    assert.equal(status.active, true);
    assert.equal(status.recentring, true);
    assert.equal(status.freshness, 'live');
    assert.match(status.refreshNote, /every 15s/);
    assert.match(status.refreshNote, /polled about every 15 minutes/);
    assert.doesNotMatch(status.refreshNote, /stream|websocket|real-?time/i);
    assert.doesNotMatch(status.cameraNote, /stream|websocket/i);
  });

  it('says it is holding the last known position when the vehicle goes quiet', () => {
    const status = describeFollowMode({
      state: followModeReducer(initialFollowModeState, {
        type: 'follow',
        vehicleId: 'v-CF77263',
      }),
      vehicleId: 'v-CF77263',
      recordedAt: '2026-08-04T08:03:12.000Z',
      cartrackConnected: true,
      nowMs: NOW + 9 * 60 * 60_000,
    });

    assert.equal(status.holdingLastKnownPosition, true);
    assert.match(status.cameraNote, /last known position/i);
    assert.match(status.cameraNote, /is not moved/i);
  });

  it('offers Resume Follow wording only while paused', () => {
    const following = followModeReducer(initialFollowModeState, {
      type: 'follow',
      vehicleId: 'v-1',
    });
    const paused = followModeReducer(following, { type: 'manual_map_move' });

    const describe = (state: typeof following) =>
      describeFollowMode({
        state,
        vehicleId: 'v-1',
        recordedAt: '2026-08-04T08:03:12.000Z',
        cartrackConnected: true,
        nowMs: NOW,
      });

    assert.match(describe(paused).cameraNote, /Resume Follow/);
    assert.equal(describe(paused).paused, true);
    assert.doesNotMatch(describe(following).cameraNote, /Resume Follow/);
  });
});

describe('vehicle trail', () => {
  it('collapses the duplicate rows the poller stores for a stationary vehicle', () => {
    const trail = buildVehicleTrail([
      { latitude: -33.8, longitude: 18.6, recordedAt: '2026-08-04T08:00:00.000Z' },
      { latitude: -33.8, longitude: 18.6, recordedAt: '2026-08-04T08:15:00.000Z' },
      { latitude: -33.8, longitude: 18.6, recordedAt: '2026-08-04T08:30:00.000Z' },
      { latitude: -33.81, longitude: 18.61, recordedAt: '2026-08-04T08:45:00.000Z' },
    ]);

    assert.equal(trail.length, 2);
    assert.deepEqual(
      trail.map((point) => point.latitude),
      [-33.8, -33.81],
    );
  });

  it('orders points oldest first so the line runs forwards', () => {
    const trail = buildVehicleTrail([
      { latitude: -33.82, longitude: 18.62, recordedAt: '2026-08-04T08:30:00.000Z' },
      { latitude: -33.8, longitude: 18.6, recordedAt: '2026-08-04T08:00:00.000Z' },
    ]);
    assert.equal(trail[0]?.recordedAt, '2026-08-04T08:00:00.000Z');
  });

  it('drops unusable points rather than plotting them at zero', () => {
    const trail = buildVehicleTrail([
      { latitude: null, longitude: 18.6, recordedAt: '2026-08-04T08:00:00.000Z' },
      { latitude: -33.8, longitude: null, recordedAt: '2026-08-04T08:05:00.000Z' },
      { latitude: -33.8, longitude: 18.6, recordedAt: 'nonsense' },
      { latitude: -33.8, longitude: 18.6, recordedAt: '2026-08-04T08:10:00.000Z' },
    ]);
    assert.equal(trail.length, 1);
  });

  it('keeps the most recent stretch when capped', () => {
    const points = Array.from({ length: 10 }, (_, index) => ({
      latitude: -33.8 + index / 1000,
      longitude: 18.6,
      recordedAt: new Date(NOW + index * 60_000).toISOString(),
    }));
    const trail = buildVehicleTrail(points, { maxPoints: 3 });
    assert.equal(trail.length, 3);
    assert.equal(trail[2]?.recordedAt, points[9]?.recordedAt);
  });

  it('does not describe a straight line between points as the route driven', () => {
    const description = describeVehicleTrail(
      buildVehicleTrail([
        { latitude: -33.8, longitude: 18.6, recordedAt: '2026-08-04T08:00:00.000Z' },
        { latitude: -33.81, longitude: 18.61, recordedAt: '2026-08-04T08:15:00.000Z' },
      ]),
    );
    assert.match(description, /not the route actually driven/i);
    assert.match(describeVehicleTrail([]), /no trail is drawn/i);
  });
});
