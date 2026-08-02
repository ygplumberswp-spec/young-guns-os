import type {
  GoogleGeocodedAddress,
  GoogleLatLng,
  GooglePlacePrediction,
  GoogleRouteEstimate,
} from '@titan/shared';

export class GoogleMapsClientError extends Error {
  constructor(
    message: string,
    readonly status?: string,
  ) {
    super(message);
    this.name = 'GoogleMapsClientError';
  }
}

type GoogleMapsClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
};

function component(
  components: Array<{ long_name: string; short_name: string; types: string[] }>,
  type: string,
): string | null {
  const hit = components.find((entry) => entry.types.includes(type));
  return hit?.long_name ?? null;
}

export class GoogleMapsClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GoogleMapsClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const result = await this.geocodeAddress('Cape Town, South Africa');
      if (!result) {
        return { ok: false, message: 'Geocoding returned no results for test query.' };
      }
      return { ok: true, message: 'Google Maps Geocoding API responded successfully.' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Google Maps connection test failed',
      };
    }
  }

  async autocompletePlaces(input: {
    query: string;
    sessionToken?: string;
    region?: string;
    language?: string;
  }): Promise<GooglePlacePrediction[]> {
    const query = input.query.trim();
    if (query.length < 2) return [];

    const params = new URLSearchParams({
      input: query,
      key: this.apiKey,
      components: 'country:za',
    });
    if (input.sessionToken) params.set('sessiontoken', input.sessionToken);
    if (input.language) params.set('language', input.language);
    if (input.region) params.set('region', input.region);

    const json = await this.getJson<{
      status: string;
      error_message?: string;
      predictions?: Array<{
        place_id: string;
        description: string;
        structured_formatting?: { main_text?: string; secondary_text?: string };
      }>;
    }>(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);

    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      throw new GoogleMapsClientError(json.error_message ?? `Places autocomplete failed: ${json.status}`, json.status);
    }

    return (json.predictions ?? []).map((prediction) => ({
      placeId: prediction.place_id,
      description: prediction.description,
      mainText: prediction.structured_formatting?.main_text ?? prediction.description,
      secondaryText: prediction.structured_formatting?.secondary_text ?? '',
    }));
  }

  async geocodeAddress(address: string): Promise<GoogleGeocodedAddress | null> {
    const trimmed = address.trim();
    if (!trimmed) return null;

    const params = new URLSearchParams({ address: trimmed, key: this.apiKey, region: 'za' });
    const json = await this.getJson<{
      status: string;
      error_message?: string;
      results?: Array<{
        place_id?: string;
        formatted_address?: string;
        geometry?: { location?: { lat: number; lng: number } };
        address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
      }>;
    }>(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);

    if (json.status === 'ZERO_RESULTS') return null;
    if (json.status !== 'OK') {
      throw new GoogleMapsClientError(json.error_message ?? `Geocoding failed: ${json.status}`, json.status);
    }

    const result = json.results?.[0];
    if (!result?.geometry?.location) return null;
    const components = result.address_components ?? [];

    return {
      placeId: result.place_id ?? null,
      formattedAddress: result.formatted_address ?? trimmed,
      street: [component(components, 'street_number'), component(components, 'route')]
        .filter(Boolean)
        .join(' ')
        .trim() || null,
      suburb:
        component(components, 'sublocality') ??
        component(components, 'sublocality_level_1') ??
        component(components, 'neighborhood'),
      city:
        component(components, 'locality') ??
        component(components, 'administrative_area_level_2'),
      province: component(components, 'administrative_area_level_1'),
      postalCode: component(components, 'postal_code'),
      country: component(components, 'country'),
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
    };
  }

  async placeDetails(placeId: string): Promise<GoogleGeocodedAddress | null> {
    const params = new URLSearchParams({
      place_id: placeId,
      key: this.apiKey,
      fields: 'place_id,formatted_address,geometry,address_component',
    });
    const json = await this.getJson<{
      status: string;
      error_message?: string;
      result?: {
        place_id?: string;
        formatted_address?: string;
        geometry?: { location?: { lat: number; lng: number } };
        address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
      };
    }>(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);

    if (json.status !== 'OK' || !json.result?.geometry?.location) {
      if (json.status === 'ZERO_RESULTS' || json.status === 'NOT_FOUND') return null;
      throw new GoogleMapsClientError(json.error_message ?? `Place details failed: ${json.status}`, json.status);
    }

    const result = json.result;
    const location = result.geometry?.location;
    if (!location) return null;
    const components = result.address_components ?? [];
    return {
      placeId: result.place_id ?? placeId,
      formattedAddress: result.formatted_address ?? '',
      street: [component(components, 'street_number'), component(components, 'route')]
        .filter(Boolean)
        .join(' ')
        .trim() || null,
      suburb:
        component(components, 'sublocality') ??
        component(components, 'sublocality_level_1') ??
        component(components, 'neighborhood'),
      city:
        component(components, 'locality') ??
        component(components, 'administrative_area_level_2'),
      province: component(components, 'administrative_area_level_1'),
      postalCode: component(components, 'postal_code'),
      country: component(components, 'country'),
      latitude: location.lat,
      longitude: location.lng,
    };
  }

  async distanceMatrix(input: {
    origin: GoogleLatLng;
    destination: GoogleLatLng;
    departureTime?: 'now' | number;
  }): Promise<GoogleRouteEstimate | null> {
    const params = new URLSearchParams({
      origins: `${input.origin.latitude},${input.origin.longitude}`,
      destinations: `${input.destination.latitude},${input.destination.longitude}`,
      key: this.apiKey,
      mode: 'driving',
      units: 'metric',
      departure_time: input.departureTime === undefined ? 'now' : String(input.departureTime),
      traffic_model: 'best_guess',
    });

    const json = await this.getJson<{
      status: string;
      error_message?: string;
      rows?: Array<{
        elements?: Array<{
          status: string;
          distance?: { value: number; text: string };
          duration?: { value: number; text: string };
          duration_in_traffic?: { value: number; text: string };
        }>;
      }>;
    }>(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`);

    if (json.status !== 'OK') {
      throw new GoogleMapsClientError(json.error_message ?? `Distance Matrix failed: ${json.status}`, json.status);
    }

    const element = json.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK' || !element.distance || !element.duration) {
      return null;
    }

    return {
      distanceMeters: element.distance.value,
      distanceText: element.distance.text,
      durationSeconds: element.duration.value,
      durationText: element.duration.text,
      durationInTrafficSeconds: element.duration_in_traffic?.value ?? null,
      durationInTrafficText: element.duration_in_traffic?.text ?? null,
      polyline: null,
      source: 'google_maps',
    };
  }

  async directions(input: {
    origin: GoogleLatLng;
    destination: GoogleLatLng;
    departureTime?: 'now' | number;
  }): Promise<GoogleRouteEstimate | null> {
    const params = new URLSearchParams({
      origin: `${input.origin.latitude},${input.origin.longitude}`,
      destination: `${input.destination.latitude},${input.destination.longitude}`,
      key: this.apiKey,
      mode: 'driving',
      departure_time: input.departureTime === undefined ? 'now' : String(input.departureTime),
      traffic_model: 'best_guess',
    });

    const json = await this.getJson<{
      status: string;
      error_message?: string;
      routes?: Array<{
        overview_polyline?: { points?: string };
        legs?: Array<{
          distance?: { value: number; text: string };
          duration?: { value: number; text: string };
          duration_in_traffic?: { value: number; text: string };
        }>;
      }>;
    }>(`https://maps.googleapis.com/maps/api/directions/json?${params}`);

    if (json.status === 'ZERO_RESULTS') return null;
    if (json.status !== 'OK') {
      throw new GoogleMapsClientError(json.error_message ?? `Directions failed: ${json.status}`, json.status);
    }

    const route = json.routes?.[0];
    const leg = route?.legs?.[0];
    if (!leg?.distance || !leg.duration) return null;

    return {
      distanceMeters: leg.distance.value,
      distanceText: leg.distance.text,
      durationSeconds: leg.duration.value,
      durationText: leg.duration.text,
      durationInTrafficSeconds: leg.duration_in_traffic?.value ?? null,
      durationInTrafficText: leg.duration_in_traffic?.text ?? null,
      polyline: route?.overview_polyline?.points ?? null,
      source: 'google_maps',
    };
  }

  private async getJson<T>(url: string): Promise<T> {
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new GoogleMapsClientError(`Google Maps HTTP ${response.status}`, String(response.status));
    }
    return (await response.json()) as T;
  }
}
