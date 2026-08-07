import {
  VEHICLE_ADDRESS_CACHE_TTL_MS,
  VEHICLE_ADDRESS_FAILURE_CACHE_TTL_MS,
  VEHICLE_ADDRESS_MATERIAL_MOVE_METERS,
  deriveVehicleAddressPrecision,
  distanceBetweenCoordinatesMeters,
  formatVehicleAddressLine,
  isValidLatLng,
  unresolvedVehicleAddress,
  vehicleAddressCacheKey,
  type VehiclePositionAddress,
  type VehiclePositionAddressResult,
} from '@titan/shared';
import { GoogleMapsError, type GoogleMapsService } from './google-maps.service.js';

/**
 * Provider calls allowed per resolve batch. Cartrack tracking is polled every few
 * seconds by open dispatch boards; the cache absorbs repeat polls and this budget
 * stops a first load on a large fleet from spiking Geocoding usage. Positions that
 * miss the budget resolve on a later refresh and report why in the meantime.
 */
const LOOKUP_BUDGET_PER_BATCH = 10;

/** Cache entries are pruned once the map grows past this many coordinates. */
const MAX_CACHE_ENTRIES = 5_000;

type CacheEntry = {
  expiresAt: number;
  latitude: number;
  longitude: number;
  result: VehiclePositionAddressResult;
};

export type VehiclePositionAddressPoint = {
  latitude: number;
  longitude: number;
};

/**
 * Turns Cartrack coordinates into readable addresses.
 *
 * Coordinates remain the source of truth — this only produces a derived label, and
 * says honestly when it cannot. Results are cached per company on a ~11 m grid and
 * reused while a vehicle stays within {@link VEHICLE_ADDRESS_MATERIAL_MOVE_METERS}
 * of an already-resolved spot, so a parked vehicle costs one provider call rather
 * than one per poll. Concurrent lookups for the same coordinate share one call.
 */
export class VehiclePositionAddressService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<VehiclePositionAddressResult>>();

  constructor(private readonly googleMapsService: GoogleMapsService) {}

  static create(deps: { googleMapsService: GoogleMapsService }): VehiclePositionAddressService {
    return new VehiclePositionAddressService(deps.googleMapsService);
  }

  /**
   * Resolve addresses for a batch of positions belonging to one company.
   * Never throws — a provider failure is reported as an unresolved result so the
   * caller can fall back to coordinates.
   */
  async resolveMany(
    companyId: string,
    points: VehiclePositionAddressPoint[],
  ): Promise<Map<string, VehiclePositionAddressResult>> {
    const resolved = new Map<string, VehiclePositionAddressResult>();
    if (points.length === 0) return resolved;

    // One entry per distinct grid coordinate — several vehicles parked at the same
    // depot, or one vehicle seen repeatedly, must not each cost a provider call.
    const pendingByKey = new Map<string, VehiclePositionAddressPoint>();

    for (const point of points) {
      if (!isValidLatLng(point.latitude, point.longitude)) continue;
      const key = vehicleAddressCacheKey(companyId, point.latitude, point.longitude);
      if (resolved.has(key) || pendingByKey.has(key)) continue;

      const cached = this.readCache(companyId, point);
      if (cached) {
        resolved.set(key, cached);
        continue;
      }

      pendingByKey.set(key, point);
    }

    const pending = [...pendingByKey].map(([key, point]) => ({ key, point }));
    if (pending.length === 0) return resolved;

    const mapsReady = await this.checkMapsReady(companyId);

    if (mapsReady !== true) {
      // Geocoding is genuinely unusable — report the reason once per coordinate
      // instead of attempting a call that cannot succeed.
      for (const entry of pending) {
        resolved.set(entry.key, mapsReady);
        this.writeCache(entry.key, entry.point, mapsReady, VEHICLE_ADDRESS_FAILURE_CACHE_TTL_MS);
      }
      return resolved;
    }

    for (const [index, entry] of pending.entries()) {
      if (index >= LOOKUP_BUDGET_PER_BATCH) {
        resolved.set(entry.key, unresolvedVehicleAddress('lookup_budget_reached'));
        continue;
      }
      resolved.set(entry.key, await this.resolveOne(companyId, entry.key, entry.point));
    }
    return resolved;
  }

  /** Convenience wrapper for a single position. */
  async resolveOnePosition(
    companyId: string,
    point: VehiclePositionAddressPoint,
  ): Promise<VehiclePositionAddressResult> {
    if (!isValidLatLng(point.latitude, point.longitude)) {
      return unresolvedVehicleAddress('invalid_coordinates');
    }
    const results = await this.resolveMany(companyId, [point]);
    return (
      results.get(vehicleAddressCacheKey(companyId, point.latitude, point.longitude)) ??
      unresolvedVehicleAddress('not_attempted')
    );
  }

  /** Test/ops seam — drops cached addresses for one company or all companies. */
  clearCache(companyId?: string): void {
    if (!companyId) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${companyId}:`)) this.cache.delete(key);
    }
  }

  private get mapsUnavailable(): VehiclePositionAddressResult {
    return unresolvedVehicleAddress('maps_not_connected');
  }

  /**
   * Returns true when geocoding is usable, or an unresolved result naming the real
   * reason it is not. Never guesses.
   */
  private async checkMapsReady(companyId: string): Promise<true | VehiclePositionAddressResult> {
    try {
      const connection = await this.googleMapsService.getConnection(companyId);
      if (!connection.connected) return this.mapsUnavailable;
      if (!connection.services.geocoding) return unresolvedVehicleAddress('geocoding_disabled');
      return true;
    } catch {
      return this.mapsUnavailable;
    }
  }

  private async resolveOne(
    companyId: string,
    key: string,
    point: VehiclePositionAddressPoint,
  ): Promise<VehiclePositionAddressResult> {
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const lookup = (async (): Promise<VehiclePositionAddressResult> => {
      try {
        const geocoded = await this.googleMapsService.reverseGeocode(companyId, {
          latitude: point.latitude,
          longitude: point.longitude,
        });

        if (!geocoded) {
          const missed = unresolvedVehicleAddress('no_result');
          this.writeCache(key, point, missed, VEHICLE_ADDRESS_FAILURE_CACHE_TTL_MS);
          return missed;
        }

        const address: VehiclePositionAddress = {
          formattedAddress: geocoded.formattedAddress,
          shortAddress:
            formatVehicleAddressLine({
              street: geocoded.street,
              suburb: geocoded.suburb,
              city: geocoded.city,
              formattedAddress: geocoded.formattedAddress,
            }) ?? geocoded.formattedAddress,
          street: geocoded.street,
          suburb: geocoded.suburb,
          city: geocoded.city,
          placeId: geocoded.placeId,
          precision: deriveVehicleAddressPrecision({
            locationType: geocoded.locationType,
            street: geocoded.street,
          }),
          resolvedForLatitude: point.latitude,
          resolvedForLongitude: point.longitude,
          resolvedAt: new Date().toISOString(),
          source: 'google_maps',
        };

        const result: VehiclePositionAddressResult = { status: 'resolved', address };
        this.writeCache(key, point, result, VEHICLE_ADDRESS_CACHE_TTL_MS);
        return result;
      } catch (error) {
        const reason =
          error instanceof GoogleMapsError && error.code === 'SERVICE_DISABLED'
            ? 'geocoding_disabled'
            : error instanceof GoogleMapsError && error.code === 'NOT_CONNECTED'
              ? 'maps_not_connected'
              : 'provider_error';
        const failure = unresolvedVehicleAddress(reason);
        this.writeCache(key, point, failure, VEHICLE_ADDRESS_FAILURE_CACHE_TTL_MS);
        return failure;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, lookup);
    return lookup;
  }

  /**
   * Exact grid hit, or the nearest still-valid entry for this company within the
   * material-move radius — a vehicle that shifted a few metres keeps its address.
   */
  private readCache(
    companyId: string,
    point: VehiclePositionAddressPoint,
  ): VehiclePositionAddressResult | null {
    const now = Date.now();
    const exactKey = vehicleAddressCacheKey(companyId, point.latitude, point.longitude);
    const exact = this.cache.get(exactKey);
    if (exact && exact.expiresAt > now) return exact.result;
    if (exact) this.cache.delete(exactKey);

    const prefix = `${companyId}:`;
    let nearest: { distance: number; result: VehiclePositionAddressResult } | null = null;

    for (const [key, entry] of this.cache) {
      if (!key.startsWith(prefix)) continue;
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        continue;
      }
      if (entry.result.status !== 'resolved') continue;

      const distance = distanceBetweenCoordinatesMeters(point, entry);
      if (distance > VEHICLE_ADDRESS_MATERIAL_MOVE_METERS) continue;
      if (!nearest || distance < nearest.distance) {
        nearest = { distance, result: entry.result };
      }
    }

    return nearest?.result ?? null;
  }

  private writeCache(
    key: string,
    point: VehiclePositionAddressPoint,
    result: VehiclePositionAddressResult,
    ttlMs: number,
  ): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      this.pruneCache();
    }
    this.cache.set(key, {
      expiresAt: Date.now() + ttlMs,
      latitude: point.latitude,
      longitude: point.longitude,
      result,
    });
  }

  private pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
    if (this.cache.size < MAX_CACHE_ENTRIES) return;
    // Still full of live entries — drop the oldest insertions to bound memory.
    const overflow = this.cache.size - Math.floor(MAX_CACHE_ENTRIES * 0.8);
    let dropped = 0;
    for (const key of this.cache.keys()) {
      if (dropped >= overflow) break;
      this.cache.delete(key);
      dropped += 1;
    }
  }
}
