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

  async fetchVehicles(): Promise<CartrackVehicleRecord[]> {
    const payload = await this.request('/vehicles');
    return parseVehicleRecords(payload);
  }

  async fetchVehicleStatuses(): Promise<CartrackVehicleStatusRecord[]> {
    const payload = await this.request('/vehicles/status');
    return parseVehicleStatusRecords(payload);
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

function parseVehicleRecords(payload: unknown): CartrackVehicleRecord[] {
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
        'id',
        'registration',
        'registration_number',
        'license_plate',
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
        ]),
        externalName: pickString(record, ['name', 'vehicle_name', 'description', 'alias']),
        raw: record,
      } satisfies CartrackVehicleRecord;
    })
    .filter((row): row is CartrackVehicleRecord => row !== null);
}

function parseVehicleStatusRecords(payload: unknown): CartrackVehicleStatusRecord[] {
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
        'id',
        'registration',
        'registration_number',
      ]);

      const location =
        record.location && typeof record.location === 'object'
          ? (record.location as Record<string, unknown>)
          : record;

      const latitude = pickNumber(location, ['latitude', 'lat']);
      const longitude = pickNumber(location, ['longitude', 'lng', 'lon']);

      if (!externalVehicleId || latitude === null || longitude === null) {
        return null;
      }

      const recordedAt =
        parseDate(
          pickString(record, ['updated_location_ts', 'event_ts', 'recorded_at', 'timestamp']),
        ) ?? new Date();

      return {
        externalVehicleId,
        externalRegistration: pickString(record, [
          'registration',
          'registration_number',
          'license_plate',
        ]),
        latitude,
        longitude,
        speedKmh: pickNumber(record, ['speed', 'speed_kmh', 'speedKmh']),
        heading: pickNumber(record, ['heading', 'bearing', 'direction']),
        recordedAt,
        raw: record,
      } satisfies CartrackVehicleStatusRecord;
    })
    .filter((row): row is CartrackVehicleStatusRecord => row !== null);
}

function extractArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;

    for (const key of ['data', 'vehicles', 'results', 'items']) {
      const value = record[key];

      if (Array.isArray(value)) {
        return value;
      }
    }
  }

  return [];
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

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
  for (const key of keys) {
    const value = record[key];

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

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
