/**
 * Supplier Maps Intelligence — V1 foundation types only.
 *
 * Owner reporting / planning extension points for supplier locations, repeated
 * visits, travel, collections, extra distance, and multi-stop routing.
 *
 * Hard rules for V1:
 * - No charging / billing / surcharge logic
 * - No fake supplier pins or invented routes in UI
 * - Advisory / reporting data shapes only — wire when real supplier geo exists
 */

import type { GoogleLatLng, GoogleRouteEstimate } from './google-maps.js';

/** Why a supplier stop appears on a technician's day. */
export type SupplierStopPurpose =
  | 'collection'
  | 'delivery'
  | 'purchase'
  | 'return'
  | 'inspection'
  | 'other';

/**
 * Stored or resolved supplier site coordinates.
 * Coordinates must come from verified Maps geocode / place details — never invented.
 */
export type SupplierLocationGeo = {
  supplierId: string;
  supplierName: string;
  placeId: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeStatus: 'unverified' | 'verified' | 'failed' | null;
  /** Optional label for a branch / yard (e.g. "Cape Town DC"). */
  siteLabel: string | null;
};

/** One stop in a multi-stop supplier / job day plan (advisory only). */
export type SupplierRouteStop = {
  stopId: string;
  kind: 'job' | 'supplier' | 'depot' | 'other';
  purpose: SupplierStopPurpose | null;
  label: string;
  location: GoogleLatLng | null;
  placeId: string | null;
  scheduledAt: string | null;
  /** Linked TITAN entities when known. */
  jobId: string | null;
  supplierId: string | null;
  purchaseOrderId: string | null;
};

/**
 * Extra distance attributed to a supplier detour vs a direct job→job path.
 * Reporting only — never used to charge customers in V1.
 */
export type SupplierExtraDistanceReport = {
  fromStopId: string;
  toStopId: string;
  viaSupplierStopId: string;
  directDistanceMeters: number | null;
  viaSupplierDistanceMeters: number | null;
  extraDistanceMeters: number | null;
  extraDurationSeconds: number | null;
  source: 'google_maps' | 'unavailable';
  warning: string | null;
};

/** Repeated supplier visit pattern for Owner reporting (foundation). */
export type SupplierRepeatedVisitInsight = {
  supplierId: string;
  supplierName: string;
  visitCount: number;
  windowStart: string;
  windowEnd: string;
  totalTravelMeters: number | null;
  totalTravelMinutes: number | null;
  source: 'google_maps' | 'default' | 'unavailable';
  honestyNote: string;
};

/**
 * Multi-stop day suggestion for Owner review.
 * Never auto-reorders bookings. No charging fields.
 */
export type SupplierMultiStopSuggestion = {
  technicianId: string | null;
  technicianName: string | null;
  planDate: string;
  stops: SupplierRouteStop[];
  /** Ordered stop ids when a real Maps route optimisation was computed; otherwise null. */
  suggestedStopOrder: string[] | null;
  totalDistanceMeters: number | null;
  totalDurationSeconds: number | null;
  routeLegs: GoogleRouteEstimate[] | null;
  source: 'google_maps' | 'unavailable';
  /** Always true in V1 — owner must act in Scheduling / Job 360. */
  requiresOwnerApproval: true;
  wouldChangeSchedule: true;
  honestyNote: string;
};

export type SupplierMapsCapabilityState =
  | 'not_configured'
  | 'locations_unverified'
  | 'ready_for_reporting'
  | 'provider_unavailable';

export function resolveSupplierMapsCapability(input: {
  googleMapsConnected: boolean;
  hasVerifiedSupplierLocation: boolean;
  providerError?: boolean;
}): SupplierMapsCapabilityState {
  if (input.providerError) return 'provider_unavailable';
  if (!input.googleMapsConnected) return 'not_configured';
  if (!input.hasVerifiedSupplierLocation) return 'locations_unverified';
  return 'ready_for_reporting';
}

export function formatSupplierMapsCapabilityLabel(state: SupplierMapsCapabilityState): string {
  switch (state) {
    case 'ready_for_reporting':
      return 'Supplier locations ready for Owner travel reporting';
    case 'locations_unverified':
      return 'Google Maps connected — verify supplier addresses to enable travel reporting';
    case 'provider_unavailable':
      return 'Google Maps provider unavailable for supplier routing';
    case 'not_configured':
    default:
      return 'Supplier Maps reporting not configured';
  }
}

/**
 * Compute extra distance when both legs are real Google routes.
 * Returns null extras (with honesty warning) when either leg is missing — never invents.
 */
export function computeSupplierExtraDistance(input: {
  direct: Pick<GoogleRouteEstimate, 'distanceMeters' | 'durationSeconds'> | null;
  viaSupplier: Pick<GoogleRouteEstimate, 'distanceMeters' | 'durationSeconds'> | null;
  fromStopId: string;
  toStopId: string;
  viaSupplierStopId: string;
}): SupplierExtraDistanceReport {
  if (!input.direct || !input.viaSupplier) {
    return {
      fromStopId: input.fromStopId,
      toStopId: input.toStopId,
      viaSupplierStopId: input.viaSupplierStopId,
      directDistanceMeters: input.direct?.distanceMeters ?? null,
      viaSupplierDistanceMeters: input.viaSupplier?.distanceMeters ?? null,
      extraDistanceMeters: null,
      extraDurationSeconds: null,
      source: 'unavailable',
      warning:
        'Extra supplier distance unavailable — need real Google Maps routes for both the direct path and the via-supplier path.',
    };
  }

  return {
    fromStopId: input.fromStopId,
    toStopId: input.toStopId,
    viaSupplierStopId: input.viaSupplierStopId,
    directDistanceMeters: input.direct.distanceMeters,
    viaSupplierDistanceMeters: input.viaSupplier.distanceMeters,
    extraDistanceMeters: Math.max(
      0,
      input.viaSupplier.distanceMeters - input.direct.distanceMeters,
    ),
    extraDurationSeconds: Math.max(
      0,
      input.viaSupplier.durationSeconds - input.direct.durationSeconds,
    ),
    source: 'google_maps',
    warning: null,
  };
}

/** Empty multi-stop suggestion when real optimisation data is not available. */
export function emptySupplierMultiStopSuggestion(input: {
  technicianId: string | null;
  technicianName: string | null;
  planDate: string;
  stops: SupplierRouteStop[];
  reason: string;
}): SupplierMultiStopSuggestion {
  return {
    technicianId: input.technicianId,
    technicianName: input.technicianName,
    planDate: input.planDate,
    stops: input.stops,
    suggestedStopOrder: null,
    totalDistanceMeters: null,
    totalDurationSeconds: null,
    routeLegs: null,
    source: 'unavailable',
    requiresOwnerApproval: true,
    wouldChangeSchedule: true,
    honestyNote: input.reason,
  };
}
