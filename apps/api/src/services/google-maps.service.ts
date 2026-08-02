import { and, eq } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import { integrationConnections } from '@titan/db';
import {
  DEFAULT_GOOGLE_MAPS_SERVICES,
  summarizeGoogleMapsServiceProbes,
  type GoogleGeocodedAddress,
  type GoogleLatLng,
  type GoogleMapsBrowserConfig,
  type GoogleMapsConnectionSummary,
  type GoogleMapsKeyStatus,
  type GoogleMapsServiceFlag,
  type GoogleMapsServiceProbe,
  type GoogleMapsServicesConfig,
  type GoogleMapsTestResult,
  type GooglePlacePrediction,
  type GoogleRouteEstimate,
} from '@titan/shared';
import {
  decryptGoogleMapsCredentials,
  encryptGoogleMapsCredentials,
  type GoogleMapsStoredCredentials,
} from '../lib/crypto.js';
import { GoogleMapsClient, GoogleMapsClientError } from '../lib/google-maps.client.js';

export class GoogleMapsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleMapsError';
  }
}

export type SaveGoogleMapsConnectionInput = {
  /** Omit/empty keeps the existing encrypted server key when updating. */
  apiKey?: string | null;
  browserApiKey?: string | null;
  services?: Partial<GoogleMapsServicesConfig>;
};

type GoogleMapsConfig = {
  services: GoogleMapsServicesConfig;
  defaultRegion: string;
  defaultLanguage: string;
  lastValidatedAt?: string | null;
  lastTest?: GoogleMapsTestResult | null;
};

function mergeServices(partial?: Partial<GoogleMapsServicesConfig>): GoogleMapsServicesConfig {
  return { ...DEFAULT_GOOGLE_MAPS_SERVICES, ...(partial ?? {}) };
}

function healthLabel(status: GoogleMapsConnectionSummary['status'], lastError: string | null): string {
  if (status === 'connected') return 'Healthy';
  if (status === 'error') return lastError ? `Error — ${lastError}` : 'Error';
  if (status === 'pending') return 'Pending validation';
  return 'Not connected';
}

function deriveServerKeyStatus(
  hasApiKey: boolean,
  probes: GoogleMapsServiceProbe[],
): GoogleMapsKeyStatus {
  if (!hasApiKey) return 'missing';
  const serverProbes = probes.filter((p) => p.service !== 'mapsJavascript');
  const available = serverProbes.find((p) => p.status === 'available');
  if (available) return 'configured';
  const denied = serverProbes.find(
    (p) =>
      p.keyStatus === 'restricted' ||
      p.keyStatus === 'expired' ||
      p.keyStatus === 'invalid' ||
      p.keyStatus === 'billing_disabled',
  );
  return denied?.keyStatus ?? 'unknown';
}

function browserKeyProbe(hasBrowserKey: boolean, mapsJsEnabled: boolean): GoogleMapsServiceProbe {
  if (!mapsJsEnabled) {
    return {
      service: 'mapsJavascript',
      status: 'disabled',
      message: 'Disabled in TITAN settings — map tiles will not load.',
      keyStatus: null,
    };
  }
  if (!hasBrowserKey) {
    return {
      service: 'mapsJavascript',
      status: 'not_configured',
      message:
        'No browser Maps JS key stored. Interactive map tiles stay disabled until a referrer-restricted key is saved.',
      keyStatus: 'missing',
    };
  }
  return {
    service: 'mapsJavascript',
    status: 'configured_unverified',
    message:
      'Browser key stored (encrypted). Full validation happens in the browser with HTTP-referrer restrictions — expected.',
    keyStatus: 'configured',
  };
}

export class GoogleMapsService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey?: string,
  ) {}

  static create(deps: { db: DatabaseClient; encryptionKey?: string }): GoogleMapsService {
    return new GoogleMapsService(deps.db, deps.encryptionKey);
  }

  async getConnection(companyId: string): Promise<GoogleMapsConnectionSummary> {
    const connection = await this.getOrCreateConnection(companyId);
    const config = this.readConfig(connection.config);
    const hasApiKey = Boolean(connection.credentialsEncrypted);
    let hasBrowserApiKey = false;
    if (connection.credentialsEncrypted && this.encryptionKey) {
      try {
        const creds = decryptGoogleMapsCredentials(connection.credentialsEncrypted, this.encryptionKey);
        hasBrowserApiKey = Boolean(creds.browserApiKey);
      } catch {
        hasBrowserApiKey = false;
      }
    }

    return {
      provider: 'google_maps',
      status: connection.status,
      connected: connection.status === 'connected' && hasApiKey,
      hasApiKey,
      hasBrowserApiKey,
      services: config.services,
      lastValidatedAt: config.lastValidatedAt ?? null,
      lastError: connection.lastError,
      healthLabel: healthLabel(connection.status, connection.lastError),
      lastTest: config.lastTest ?? null,
    };
  }

  async getBrowserConfig(companyId: string): Promise<GoogleMapsBrowserConfig> {
    const connection = await this.getOrCreateConnection(companyId);
    const config = this.readConfig(connection.config);
    if (connection.status !== 'connected' || !connection.credentialsEncrypted || !this.encryptionKey) {
      return {
        enabled: false,
        browserApiKey: null,
        services: config.services,
        defaultRegion: config.defaultRegion,
        defaultLanguage: config.defaultLanguage,
      };
    }

    if (!config.services.mapsJavascript) {
      return {
        enabled: false,
        browserApiKey: null,
        services: config.services,
        defaultRegion: config.defaultRegion,
        defaultLanguage: config.defaultLanguage,
      };
    }

    const creds = decryptGoogleMapsCredentials(connection.credentialsEncrypted, this.encryptionKey);
    // Prefer referrer-restricted browser key; never invent a key. Never return server key.
    const browserApiKey = creds.browserApiKey?.trim() || null;

    return {
      enabled: Boolean(browserApiKey),
      browserApiKey,
      services: config.services,
      defaultRegion: config.defaultRegion,
      defaultLanguage: config.defaultLanguage,
    };
  }

  async validateCredentials(input: SaveGoogleMapsConnectionInput): Promise<GoogleMapsTestResult> {
    const apiKey = input.apiKey?.trim();
    const services = mergeServices(input.services);
    const testedAt = new Date().toISOString();

    if (!apiKey) {
      return {
        ok: false,
        message: 'Google Maps server API key is required.',
        testedAt,
        servicesChecked: [],
        serviceResults: [],
        serverKeyStatus: 'missing',
        browserKeyStatus: input.browserApiKey?.trim() ? 'configured' : 'missing',
      };
    }

    const client = new GoogleMapsClient({ apiKey });
    const serverProbes = await client.probeServices({
      ...services,
      // Validate path only probes server APIs; browser key handled separately.
      mapsJavascript: false,
    });
    const browserProbe = browserKeyProbe(Boolean(input.browserApiKey?.trim()), services.mapsJavascript);
    const serviceResults = [
      ...serverProbes.filter((p) => p.service !== 'mapsJavascript'),
      browserProbe,
    ];
    const summary = summarizeGoogleMapsServiceProbes(serviceResults);

    return {
      ok: summary.ok,
      message: summary.message,
      testedAt,
      servicesChecked: serviceResults
        .filter((p) => p.status !== 'disabled' && p.status !== 'skipped')
        .map((p) => p.service),
      serviceResults,
      serverKeyStatus: deriveServerKeyStatus(true, serviceResults),
      browserKeyStatus: browserProbe.keyStatus ?? 'missing',
    };
  }

  async saveConnection(
    companyId: string,
    input: SaveGoogleMapsConnectionInput,
  ): Promise<GoogleMapsConnectionSummary> {
    this.ensureEncryptionKey();
    const connection = await this.getOrCreateConnection(companyId);
    const incomingKey = input.apiKey?.trim() || '';
    let existingCreds: GoogleMapsStoredCredentials | null = null;
    if (connection.credentialsEncrypted) {
      try {
        existingCreds = decryptGoogleMapsCredentials(
          connection.credentialsEncrypted,
          this.encryptionKey!,
        );
      } catch {
        existingCreds = null;
      }
    }

    const apiKey = incomingKey || existingCreds?.apiKey || '';
    if (!apiKey) {
      throw new GoogleMapsError('VALIDATION_ERROR', 'Google Maps API key is required.');
    }

    const browserApiKeyProvided = Object.prototype.hasOwnProperty.call(input, 'browserApiKey');
    const browserApiKey = browserApiKeyProvided
      ? input.browserApiKey?.trim() || undefined
      : existingCreds?.browserApiKey;

    const services = mergeServices({
      ...this.readConfig(connection.config).services,
      ...(input.services ?? {}),
    });

    let lastTest: GoogleMapsTestResult | null = this.readConfig(connection.config).lastTest ?? null;
    if (incomingKey) {
      const test = await this.validateCredentials({ apiKey, browserApiKey, services });
      lastTest = test;
      // Require at least one server API — do not fail solely because one API is disabled in GCP.
      if (!test.ok) {
        throw new GoogleMapsError('CONNECTION_FAILED', test.message);
      }
    }

    const credentials: GoogleMapsStoredCredentials = { apiKey, browserApiKey };
    const now = new Date();

    await this.db
      .update(integrationConnections)
      .set({
        status: 'connected',
        credentialsEncrypted: encryptGoogleMapsCredentials(credentials, this.encryptionKey!),
        config: {
          ...this.readConfig(connection.config),
          services,
          lastValidatedAt: incomingKey
            ? now.toISOString()
            : (this.readConfig(connection.config).lastValidatedAt ?? now.toISOString()),
          lastTest,
        } satisfies GoogleMapsConfig,
        lastError: null,
        connectedAt: connection.connectedAt ?? now,
        updatedAt: now,
      })
      .where(eq(integrationConnections.id, connection.id));

    return this.getConnection(companyId);
  }

  async testStoredConnection(companyId: string): Promise<GoogleMapsTestResult> {
    this.ensureEncryptionKey();
    const connection = await this.getOrCreateConnection(companyId);
    if (connection.status !== 'connected' || !connection.credentialsEncrypted) {
      throw new GoogleMapsError('NOT_CONNECTED', 'Google Maps is not connected for this company.');
    }

    let creds: GoogleMapsStoredCredentials;
    try {
      creds = decryptGoogleMapsCredentials(connection.credentialsEncrypted, this.encryptionKey!);
    } catch (error) {
      throw new GoogleMapsError(
        'CREDENTIALS_INVALID',
        error instanceof Error ? error.message : 'Unable to decrypt Google Maps credentials',
      );
    }

    const config = this.readConfig(connection.config);
    const client = new GoogleMapsClient({ apiKey: creds.apiKey });
    const serverProbes = await client.probeServices({
      ...config.services,
      mapsJavascript: false,
    });
    const browserProbe = browserKeyProbe(Boolean(creds.browserApiKey), config.services.mapsJavascript);
    // Replace the client's skipped mapsJavascript with our browser-key-aware probe.
    const serviceResults = [
      ...serverProbes.filter((p) => p.service !== 'mapsJavascript'),
      browserProbe,
    ];
    const summary = summarizeGoogleMapsServiceProbes(serviceResults);
    const now = new Date();
    const result: GoogleMapsTestResult = {
      ok: summary.ok,
      message: summary.message,
      testedAt: now.toISOString(),
      servicesChecked: serviceResults
        .filter((p) => p.status !== 'disabled' && p.status !== 'skipped')
        .map((p) => p.service as GoogleMapsServiceFlag),
      serviceResults,
      serverKeyStatus: deriveServerKeyStatus(true, serviceResults),
      browserKeyStatus: browserProbe.keyStatus ?? 'missing',
    };

    await this.db
      .update(integrationConnections)
      .set({
        // Stay connected when at least one server API works; surface partial failures in lastTest.
        status: result.ok ? 'connected' : 'error',
        lastError: result.ok ? null : result.message,
        config: {
          ...config,
          lastValidatedAt: now.toISOString(),
          lastTest: result,
        },
        updatedAt: now,
      })
      .where(eq(integrationConnections.id, connection.id));

    return result;
  }

  async disconnect(companyId: string): Promise<GoogleMapsConnectionSummary> {
    const connection = await this.getOrCreateConnection(companyId);
    await this.db
      .update(integrationConnections)
      .set({
        status: 'disconnected',
        credentialsEncrypted: null,
        lastError: null,
        connectedAt: null,
        config: {
          ...this.readConfig(connection.config),
          lastTest: null,
          lastValidatedAt: null,
        } satisfies GoogleMapsConfig,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id));
    return this.getConnection(companyId);
  }

  async autocomplete(
    companyId: string,
    query: string,
    sessionToken?: string,
  ): Promise<GooglePlacePrediction[]> {
    const client = await this.requireClient(companyId, 'places');
    const config = this.readConfig((await this.getOrCreateConnection(companyId)).config);
    return client.autocompletePlaces({
      query,
      sessionToken,
      region: config.defaultRegion,
      language: config.defaultLanguage,
    });
  }

  async geocode(companyId: string, address: string): Promise<GoogleGeocodedAddress | null> {
    const client = await this.requireClient(companyId, 'geocoding');
    return client.geocodeAddress(address);
  }

  async reverseGeocode(companyId: string, location: GoogleLatLng): Promise<GoogleGeocodedAddress | null> {
    const client = await this.requireClient(companyId, 'geocoding');
    return client.reverseGeocode(location);
  }

  async placeDetails(companyId: string, placeId: string): Promise<GoogleGeocodedAddress | null> {
    const client = await this.requireClient(companyId, 'places');
    return client.placeDetails(placeId);
  }

  async estimateRoute(
    companyId: string,
    origin: GoogleLatLng,
    destination: GoogleLatLng,
  ): Promise<GoogleRouteEstimate | null> {
    const connection = await this.getOrCreateConnection(companyId);
    const config = this.readConfig(connection.config);

    // Prefer Routes API (computeRoutes) when enabled — matches current GCP setup.
    if (config.services.routes) {
      try {
        const client = await this.requireClient(companyId, 'routes');
        const route = await client.computeRoutes({ origin, destination });
        if (route) return route;
      } catch {
        // Fall through to legacy Directions / Distance Matrix when available.
      }
    }

    if (config.services.directions) {
      try {
        const client = await this.requireClient(companyId, 'directions');
        const route = await client.directions({ origin, destination, departureTime: 'now' });
        if (route) return route;
      } catch {
        // Fall through to Distance Matrix when Directions unavailable.
      }
    }

    if (config.services.distanceMatrix) {
      const client = await this.requireClient(companyId, 'distanceMatrix');
      return client.distanceMatrix({ origin, destination, departureTime: 'now' });
    }

    throw new GoogleMapsError(
      'SERVICE_DISABLED',
      'Routes, Directions, and Distance Matrix are disabled for this company.',
    );
  }

  async isConnected(companyId: string): Promise<boolean> {
    const summary = await this.getConnection(companyId);
    return summary.connected;
  }

  private async requireClient(
    companyId: string,
    service: keyof GoogleMapsServicesConfig,
  ): Promise<GoogleMapsClient> {
    this.ensureEncryptionKey();
    const connection = await this.getOrCreateConnection(companyId);
    if (connection.status !== 'connected' || !connection.credentialsEncrypted) {
      throw new GoogleMapsError('NOT_CONNECTED', 'Google Maps is not connected for this company.');
    }
    const config = this.readConfig(connection.config);
    if (!config.services[service]) {
      throw new GoogleMapsError('SERVICE_DISABLED', `Google Maps service "${service}" is disabled.`);
    }
    try {
      const creds = decryptGoogleMapsCredentials(connection.credentialsEncrypted, this.encryptionKey!);
      return new GoogleMapsClient({ apiKey: creds.apiKey });
    } catch (error) {
      throw new GoogleMapsError(
        'CREDENTIALS_INVALID',
        error instanceof Error ? error.message : 'Unable to decrypt Google Maps credentials',
      );
    }
  }

  private async getOrCreateConnection(companyId: string) {
    const existing = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'google_maps'),
      ),
    });
    if (existing) return existing;

    const [created] = await this.db
      .insert(integrationConnections)
      .values({
        companyId,
        provider: 'google_maps',
        status: 'disconnected',
        config: {
          services: DEFAULT_GOOGLE_MAPS_SERVICES,
          defaultRegion: 'za',
          defaultLanguage: 'en',
          lastTest: null,
        } satisfies GoogleMapsConfig,
      })
      .returning();

    return created!;
  }

  private readConfig(raw: unknown): GoogleMapsConfig {
    const config = (raw && typeof raw === 'object' ? raw : {}) as Partial<GoogleMapsConfig>;
    return {
      services: mergeServices(config.services),
      defaultRegion: config.defaultRegion ?? 'za',
      defaultLanguage: config.defaultLanguage ?? 'en',
      lastValidatedAt: config.lastValidatedAt ?? null,
      lastTest: config.lastTest ?? null,
    };
  }

  private ensureEncryptionKey(): void {
    if (!this.encryptionKey) {
      throw new GoogleMapsError(
        'ENCRYPTION_NOT_CONFIGURED',
        'INTEGRATIONS_ENCRYPTION_KEY is required to store Google Maps credentials.',
      );
    }
  }
}

export function mapGoogleMapsError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof GoogleMapsError) {
    const status =
      error.code === 'NOT_CONNECTED'
        ? 404
        : error.code === 'VALIDATION_ERROR' || error.code === 'SERVICE_DISABLED'
          ? 400
          : error.code === 'CONNECTION_FAILED'
            ? 502
            : 500;
    return { status, code: error.code, message: error.message };
  }
  if (error instanceof GoogleMapsClientError) {
    return { status: 502, code: 'GOOGLE_MAPS_API_ERROR', message: error.message };
  }
  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'Unexpected Google Maps error',
  };
}
