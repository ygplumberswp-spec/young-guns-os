import {
  isTimeoutError,
  providerTimeoutSignal,
  PROVIDER_REQUEST_TIMEOUT_MS,
} from './http-timeout.js';

export class CartrackError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CartrackError';
  }
}

export type CartrackVehicleRecord = {
  externalVehicleId: string;
  externalRegistration: string | null;
  externalName: string | null;
  raw: Record<string, unknown>;
};

export type CartrackVehicleStatusRecord = {
  externalVehicleId: string;
  externalRegistration: string | null;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  heading: number | null;
  ignitionOn: boolean | null;
  odometerKm: number | null;
  address: string | null;
  driverName: string | null;
  recordedAt: Date;
  raw: Record<string, unknown>;
};

type CartrackClientOptions = {
  baseUrl: string;
  username: string;
  password: string;
};

export class CartrackClient {
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor({ baseUrl, username, password }: CartrackClientOptions) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  async testConnection(): Promise<void> {
    await this.request('/vehicles');
  }

  /** Probe read endpoints and return status codes — no credential mutation. */
  async probeReadPermissions(): Promise<
    Array<{ endpoint: string; httpStatus: number | null; ok: boolean; detail: string }>
  > {
    const endpoints = ['/vehicles', '/vehicles/status', '/positions'];
    const results: Array<{
      endpoint: string;
      httpStatus: number | null;
      ok: boolean;
      detail: string;
    }> = [];

    for (const endpoint of endpoints) {
      try {
        await this.request(endpoint);
        results.push({ endpoint, httpStatus: 200, ok: true, detail: 'OK' });
      } catch (error) {
        if (error instanceof CartrackError) {
          const status =
            error.code === 'AUTH_FAILED'
              ? 403
              : error.code === 'API_ERROR' && error.message.includes('404')
                ? 404
                : null;
          results.push({
            endpoint,
            httpStatus: status,
            ok: false,
            detail: error.message,
          });
        } else {
          results.push({
            endpoint,
            httpStatus: null,
            ok: false,
            detail: error instanceof Error ? error.message : 'Request failed',
          });
        }
      }
    }

    return results;
  }

  async fetchVehicles(): Promise<CartrackVehicleRecord[]> {
    const payload = await this.request('/vehicles');
    return parseVehicleRecords(payload);
  }

  async fetchVehicleStatuses(): Promise<CartrackVehicleStatusRecord[]> {
    let statusError: unknown = null;

    try {
      const payload = await this.request('/vehicles/status');
      const parsed = parseVehicleStatusRecords(payload);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch (error) {
      statusError = error;
      if (error instanceof CartrackError && error.code === 'AUTH_FAILED') {
        throw error;
      }
    }

    try {
      const positionsPayload = await this.request('/positions');
      const parsed = parseVehicleStatusRecords(positionsPayload);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch (error) {
      if (error instanceof CartrackError && error.code === 'AUTH_FAILED') {
        throw error;
      }
      if (statusError) {
        throw statusError;
      }
      throw error;
    }

    if (statusError) {
      throw statusError;
    }

    return [];
  }

  private async request(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: this.authorization,
          Accept: 'application/json',
        },
        signal: providerTimeoutSignal(),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new CartrackError(
          'TIMEOUT',
          `Cartrack request timed out after ${PROVIDER_REQUEST_TIMEOUT_MS}ms`,
        );
      }
      throw new CartrackError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach Cartrack API',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new CartrackError('AUTH_FAILED', 'Cartrack rejected the provided credentials');
    }

    if (!response.ok) {
      const body = await response.text();
      throw new CartrackError(
        'API_ERROR',
        `Cartrack API returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.includes('application/json')) {
      throw new CartrackError('API_ERROR', 'Cartrack API returned a non-JSON response');
    }

    return response.json();
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');

  if (!trimmed.startsWith('https://')) {
    throw new CartrackError('VALIDATION_ERROR', 'Cartrack base URL must use HTTPS');
  }

  return trimmed;
}

export function parseVehicleRecords(payload: unknown): CartrackVehicleRecord[] {
  const rows = extractArray(payload);

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }

      const record = row as Record<string, unknown>;
      const externalVehicleId = pickString(record, [
        'vehicle_id',
        'vehicleId',
        'unit_id',
        'unitId',
        'device_id',
        'deviceId',
        'id',
      ]);

      if (!externalVehicleId) {
        return null;
      }

      return {
        externalVehicleId,
        externalRegistration: pickString(record, [
          'registration',
          'registration_number',
          'license_plate',
          'plate',
          'Registration',
        ]),
        externalName: pickString(record, ['name', 'vehicle_name', 'description', 'alias']),
        raw: record,
      } satisfies CartrackVehicleRecord;
    })
    .filter((row): row is CartrackVehicleRecord => row !== null);
}

export function parseVehicleStatusRecords(payload: unknown): CartrackVehicleStatusRecord[] {
  const rows = extractArray(payload);

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }

      const record = row as Record<string, unknown>;
      const externalVehicleId = pickString(record, [
        'vehicle_id',
        'vehicleId',
        'unit_id',
        'unitId',
        'device_id',
        'deviceId',
        'id',
      ]);

      const externalRegistration = pickString(record, [
        'registration',
        'registration_number',
        'license_plate',
        'plate',
        'Registration',
      ]);

      const location = resolveLocationRecord(record);
      const latitude = pickNumber(location, ['latitude', 'lat', 'Latitude', 'Lat']);
      const longitude = pickNumber(location, ['longitude', 'lng', 'lon', 'Longitude', 'Lng', 'Lon']);

      if ((!externalVehicleId && !externalRegistration) || latitude === null || longitude === null) {
        return null;
      }

      const recordedAt =
        parseDate(
          pickString(record, [
            'updated_location_ts',
            'updatedLocationTs',
            'event_ts',
            'eventTs',
            'recorded_at',
            'recordedAt',
            'timestamp',
            'last_updated',
            'lastUpdated',
          ]),
        ) ?? new Date();

      const speedKmh = pickNumber(record, [
        'speed',
        'speed_kmh',
        'speedKmh',
        'Speed',
        'current_speed',
        'currentSpeed',
      ]);

      return {
        externalVehicleId: externalVehicleId ?? externalRegistration!,
        externalRegistration,
        latitude,
        longitude,
        speedKmh,
        heading: pickNumber(record, ['heading', 'bearing', 'direction', 'Heading', 'course']),
        ignitionOn: pickBoolean(record, [
          'ignition_on',
          'ignitionOn',
          'ignition',
          'Ignition',
          'engine_on',
          'engineOn',
        ]),
        odometerKm: pickNumber(record, ['odometer', 'odometer_km', 'odometerKm', 'Odometer']),
        address: pickString(record, [
          'address',
          'Address',
          'location_address',
          'locationAddress',
          'street_address',
        ]),
        driverName: pickString(record, [
          'driver_name',
          'driverName',
          'driver',
          'assigned_driver',
          'assignedDriver',
        ]),
        recordedAt,
        raw: record,
      } satisfies CartrackVehicleStatusRecord;
    })
    .filter((row): row is CartrackVehicleStatusRecord => row !== null);
}

function resolveLocationRecord(record: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['location', 'gps', 'position', 'lastPosition', 'geo', 'coordinates']) {
    const nested = record[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }

  return record;
}

function extractArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;

    for (const key of ['data', 'vehicles', 'results', 'items', 'status', 'positions']) {
      const value = record[key];

      if (Array.isArray(value)) {
        return value;
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = extractArray(value);
        if (nested.length > 0) {
          return nested;
        }
      }
    }
  }

  return [];
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  const normalized = normalizeRecordKeys(record);

  for (const key of keys) {
    const value = normalized.get(key.toLowerCase());

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number') {
      return String(value);
    }
  }

  return null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  const normalized = normalizeRecordKeys(record);

  for (const key of keys) {
    const value = normalized.get(key.toLowerCase());

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseFloat(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function pickBoolean(record: Record<string, unknown>, keys: string[]): boolean | null {
  const normalized = normalizeRecordKeys(record);

  for (const key of keys) {
    const value = normalized.get(key.toLowerCase());

    if (typeof value === 'boolean') {
      return value;
    }

    if (value === 1 || value === '1' || value === 'true' || value === 'on') {
      return true;
    }

    if (value === 0 || value === '0' || value === 'false' || value === 'off') {
      return false;
    }
  }

  return null;
}

function normalizeRecordKeys(record: Record<string, unknown>): Map<string, unknown> {
  const map = new Map<string, unknown>();

  for (const [key, value] of Object.entries(record)) {
    map.set(key.toLowerCase(), value);
  }

  return map;
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
