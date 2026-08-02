import type {
  GoogleGeocodedAddress,
  GoogleLatLng,
  GoogleMapsBrowserConfig,
  GoogleMapsConnectionSummary,
  GoogleMapsServicesConfig,
  GoogleMapsTestResult,
  GooglePlacePrediction,
  GoogleRouteEstimate,
} from '@titan/shared';
import { request } from './api-client';

export type SaveGoogleMapsConnectionInput = {
  /** Omit/empty keeps the stored encrypted server key when updating. */
  apiKey?: string | null;
  browserApiKey?: string | null;
  services?: Partial<GoogleMapsServicesConfig>;
};

export async function fetchGoogleMapsConnection(
  accessToken: string,
): Promise<GoogleMapsConnectionSummary> {
  const data = await request<{ connection: GoogleMapsConnectionSummary }>(
    '/integrations/google-maps',
    { accessToken },
  );
  return data.connection;
}

export async function fetchGoogleMapsBrowserConfig(
  accessToken: string,
): Promise<GoogleMapsBrowserConfig> {
  const data = await request<{ config: GoogleMapsBrowserConfig }>(
    '/integrations/google-maps/browser-config',
    { accessToken },
  );
  return data.config;
}

export async function validateGoogleMapsCredentials(
  accessToken: string,
  input: SaveGoogleMapsConnectionInput,
): Promise<GoogleMapsTestResult> {
  const data = await request<{ result: GoogleMapsTestResult }>(
    '/integrations/google-maps/credentials/validate',
    { accessToken, method: 'POST', body: input },
  );
  return data.result;
}

export async function saveGoogleMapsConnection(
  accessToken: string,
  input: SaveGoogleMapsConnectionInput,
): Promise<GoogleMapsConnectionSummary> {
  const data = await request<{ connection: GoogleMapsConnectionSummary }>(
    '/integrations/google-maps',
    { accessToken, method: 'PUT', body: input },
  );
  return data.connection;
}

export async function testGoogleMapsConnection(
  accessToken: string,
): Promise<GoogleMapsTestResult> {
  const data = await request<{ result: GoogleMapsTestResult }>('/integrations/google-maps/test', {
    accessToken,
    method: 'POST',
    body: {},
  });
  return data.result;
}

export async function disconnectGoogleMaps(
  accessToken: string,
): Promise<GoogleMapsConnectionSummary> {
  const data = await request<{ connection: GoogleMapsConnectionSummary }>(
    '/integrations/google-maps',
    { accessToken, method: 'DELETE' },
  );
  return data.connection;
}

export async function autocompleteGooglePlaces(
  accessToken: string,
  query: string,
  sessionToken?: string,
): Promise<GooglePlacePrediction[]> {
  const data = await request<{ predictions: GooglePlacePrediction[] }>(
    '/integrations/google-maps/places/autocomplete',
    {
      accessToken,
      method: 'POST',
      body: { query, sessionToken },
    },
  );
  return data.predictions;
}

export async function geocodeGoogleAddress(
  accessToken: string,
  address: string,
): Promise<GoogleGeocodedAddress | null> {
  const data = await request<{ result: GoogleGeocodedAddress | null }>(
    '/integrations/google-maps/geocode',
    { accessToken, method: 'POST', body: { address } },
  );
  return data.result;
}

export async function fetchGooglePlaceDetails(
  accessToken: string,
  placeId: string,
): Promise<GoogleGeocodedAddress | null> {
  const data = await request<{ result: GoogleGeocodedAddress | null }>(
    '/integrations/google-maps/places/details',
    { accessToken, method: 'POST', body: { placeId } },
  );
  return data.result;
}

export async function estimateGoogleRoute(
  accessToken: string,
  origin: GoogleLatLng,
  destination: GoogleLatLng,
): Promise<GoogleRouteEstimate | null> {
  const data = await request<{ result: GoogleRouteEstimate | null }>(
    '/integrations/google-maps/route',
    { accessToken, method: 'POST', body: { origin, destination } },
  );
  return data.result;
}
