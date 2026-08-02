/** Google Maps Platform — enterprise location types (V1). Real coordinates only. */

export type GoogleMapsServiceFlag =
  | 'places'
  | 'geocoding'
  | 'directions'
  | 'distanceMatrix'
  | 'mapsJavascript';

export type GoogleMapsServicesConfig = Record<GoogleMapsServiceFlag, boolean>;

export const DEFAULT_GOOGLE_MAPS_SERVICES: GoogleMapsServicesConfig = {
  places: true,
  geocoding: true,
  directions: true,
  distanceMatrix: true,
  mapsJavascript: true,
};

export type GoogleMapsConnectionSummary = {
  provider: 'google_maps';
  status: 'disconnected' | 'pending' | 'connected' | 'error';
  connected: boolean;
  hasApiKey: boolean;
  hasBrowserApiKey: boolean;
  services: GoogleMapsServicesConfig;
  lastValidatedAt: string | null;
  lastError: string | null;
  healthLabel: string;
};

export type GoogleMapsBrowserConfig = {
  enabled: boolean;
  browserApiKey: string | null;
  services: GoogleMapsServicesConfig;
  defaultRegion: string;
  defaultLanguage: string;
};

export type GooglePlacePrediction = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

export type GoogleGeocodedAddress = {
  placeId: string | null;
  formattedAddress: string;
  street: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
};

export type GoogleLatLng = {
  latitude: number;
  longitude: number;
};

export type GoogleRouteEstimate = {
  distanceMeters: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
  /** Traffic-aware when available from Directions/Distance Matrix. */
  durationInTrafficSeconds: number | null;
  durationInTrafficText: string | null;
  polyline: string | null;
  source: 'google_maps' | 'default';
};

export type GoogleMapsTestResult = {
  ok: boolean;
  message: string;
  testedAt: string;
  servicesChecked: GoogleMapsServiceFlag[];
};

export type PropertyGeoFields = {
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  formattedAddress: string | null;
  geocodedAt: string | null;
  geocodeStatus: 'unverified' | 'verified' | 'failed' | null;
};

export type JobLocationGeo = PropertyGeoFields & {
  navigateUrl: string | null;
};

export function buildGoogleMapsNavigateUrl(input: {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  placeId?: string | null;
}): string | null {
  if (input.placeId?.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination_place_id=${encodeURIComponent(input.placeId.trim())}`;
  }
  if (
    typeof input.latitude === 'number' &&
    typeof input.longitude === 'number' &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    return `https://www.google.com/maps/dir/?api=1&destination=${input.latitude},${input.longitude}`;
  }
  const address = input.address?.trim();
  if (!address) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export function isValidLatLng(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}
