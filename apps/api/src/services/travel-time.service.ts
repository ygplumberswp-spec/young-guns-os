import type { DatabaseClient } from '@titan/db';
import { integrationConnections, jobs } from '@titan/db';
import { and, eq } from 'drizzle-orm';
import { isValidLatLng } from '@titan/shared';
import { GoogleMapsService } from './google-maps.service.js';

export type TravelTimeRequest = {
  companyId: string;
  fromJobId?: string | null;
  toJobId?: string | null;
  origin?: { latitude: number; longitude: number } | null;
  destination?: { latitude: number; longitude: number } | null;
  /**
   * Optional live technician/vehicle origin (e.g. Cartrack GPS).
   * Used only when coordinates are real — never invented.
   */
  vehicleOrigin?: { latitude: number; longitude: number } | null;
  defaultMinutes: number;
};

export type TravelTimeResult = {
  minutes: number;
  distanceMeters: number | null;
  distanceText: string | null;
  durationInTrafficMinutes: number | null;
  source: 'default' | 'cartrack' | 'google_maps';
  cartrackConnected: boolean;
  googleMapsConnected: boolean;
  /** True when a verified vehicle/tech GPS origin was supplied. */
  vehicleOriginUsed: boolean;
  warning: string | null;
};

/**
 * Travel time — Google Maps Distance Matrix / Directions when both endpoints
 * have real coordinates. Never invents locations or routes.
 *
 * Prefer vehicleOrigin (Cartrack) → job origin → fromJobId when estimating
 * technician-to-customer travel for dispatch ETA foundation.
 */
export class TravelTimeService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly googleMapsService?: GoogleMapsService,
  ) {}

  async isCartrackConnected(companyId: string): Promise<boolean> {
    const row = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'cartrack'),
        eq(integrationConnections.status, 'connected'),
      ),
      columns: { id: true },
    });
    return Boolean(row);
  }

  async estimateTravelMinutes(input: TravelTimeRequest): Promise<TravelTimeResult> {
    const cartrackConnected = await this.isCartrackConnected(input.companyId);
    const googleMapsConnected = this.googleMapsService
      ? await this.googleMapsService.isConnected(input.companyId)
      : false;

    const vehicleOrigin =
      input.vehicleOrigin &&
      isValidLatLng(input.vehicleOrigin.latitude, input.vehicleOrigin.longitude)
        ? input.vehicleOrigin
        : null;

    const origin =
      vehicleOrigin ??
      input.origin ??
      (input.fromJobId ? await this.loadJobCoords(input.companyId, input.fromJobId) : null);
    const destination =
      input.destination ??
      (input.toJobId ? await this.loadJobCoords(input.companyId, input.toJobId) : null);

    const vehicleOriginUsed = Boolean(vehicleOrigin && origin === vehicleOrigin);

    if (
      googleMapsConnected &&
      this.googleMapsService &&
      origin &&
      destination &&
      isValidLatLng(origin.latitude, origin.longitude) &&
      isValidLatLng(destination.latitude, destination.longitude)
    ) {
      try {
        const route = await this.googleMapsService.estimateRoute(
          input.companyId,
          origin,
          destination,
        );
        if (route) {
          const trafficSeconds = route.durationInTrafficSeconds ?? route.durationSeconds;
          const minutes = Math.max(1, Math.round(trafficSeconds / 60));
          return {
            minutes,
            distanceMeters: route.distanceMeters,
            distanceText: route.distanceText,
            durationInTrafficMinutes: route.durationInTrafficSeconds
              ? Math.max(1, Math.round(route.durationInTrafficSeconds / 60))
              : null,
            source: 'google_maps',
            cartrackConnected,
            googleMapsConnected: true,
            vehicleOriginUsed,
            warning: vehicleOriginUsed
              ? null
              : cartrackConnected
                ? 'Route uses job/site origin — supply live vehicle GPS for technician-to-site ETA.'
                : null,
          };
        }
      } catch {
        // Fall through to default with honest warning.
      }
    }

    let warning: string | null = null;
    if (googleMapsConnected && (!origin || !destination)) {
      warning =
        vehicleOrigin == null && cartrackConnected
          ? 'Travel estimate is approximate: Cartrack is connected but no live vehicle coordinates were supplied, and one or both endpoints lack verified coordinates — using default travel minutes.'
          : 'Travel estimate is approximate: Google Maps is connected, but one or both job sites are missing map coordinates. Add or verify site coordinates for live routing minutes; using default travel minutes for now.';
    } else if (!googleMapsConnected && cartrackConnected) {
      warning =
        vehicleOrigin != null
          ? 'Technician GPS is available for presence, but Google Maps routing is not connected — using default travel minutes (no invented ETA).'
          : 'Travel estimate is approximate: Cartrack can show GPS presence, but Google Maps routing is not connected — using default travel minutes.';
    } else if (!googleMapsConnected && (!origin || !destination)) {
      warning =
        'Travel estimate is approximate: Google Maps routing is not connected and job site coordinates are incomplete — using default travel minutes.';
    }

    return {
      minutes: input.defaultMinutes,
      distanceMeters: null,
      distanceText: null,
      durationInTrafficMinutes: null,
      source: 'default',
      cartrackConnected,
      googleMapsConnected,
      vehicleOriginUsed,
      warning,
    };
  }

  private async loadJobCoords(
    companyId: string,
    jobId: string,
  ): Promise<{ latitude: number; longitude: number } | null> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.companyId, companyId), eq(jobs.id, jobId)),
      columns: {
        snapshotLatitude: true,
        snapshotLongitude: true,
      },
    });
    if (
      job &&
      isValidLatLng(job.snapshotLatitude, job.snapshotLongitude) &&
      job.snapshotLatitude != null &&
      job.snapshotLongitude != null
    ) {
      return { latitude: job.snapshotLatitude, longitude: job.snapshotLongitude };
    }
    return null;
  }
}
