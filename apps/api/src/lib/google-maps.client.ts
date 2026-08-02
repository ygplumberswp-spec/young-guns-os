import type {
  GoogleGeocodedAddress,
  GoogleLatLng,
  GoogleMapsServiceFlag,
  GoogleMapsServiceProbe,
  GoogleMapsServicesConfig,
  GooglePlacePrediction,
  GoogleRouteEstimate,
} from '@titan/shared';
import { classifyGoogleMapsApiStatus } from '@titan/shared';

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

/** Fixed Cape Town reference points for connection probes only — not used as fake job pins. */
const PROBE_ORIGIN = { latitude: -33.9249, longitude: 18.4241 };
const PROBE_DESTINATION = { latitude: -33.9352, longitude: 18.4197 };

function component(
  components: Array<{ long_name: string; short_name: string; types: string[] }>,
  type: string,
): string | null {
  const hit = components.find((entry) => entry.types.includes(type));
  return hit?.long_name ?? null;
}

function mapAddressResult(input: {
  placeId?: string | null;
  formattedAddress?: string | null;
  fallbackAddress: string;
  location: { lat: number; lng: number };
  components: Array<{ long_name: string; short_name: string; types: string[] }>;
}): GoogleGeocodedAddress {
  return {
    placeId: input.placeId ?? null,
    formattedAddress: input.formattedAddress ?? input.fallbackAddress,
    street: [component(input.components, 'street_number'), component(input.components, 'route')]
      .filter(Boolean)
      .join(' ')
      .trim() || null,
    suburb:
      component(input.components, 'sublocality') ??
      component(input.components, 'sublocality_level_1') ??
      component(input.components, 'neighborhood'),
    city:
      component(input.components, 'locality') ??
      component(input.components, 'administrative_area_level_2'),
    province: component(input.components, 'administrative_area_level_1'),
    postalCode: component(input.components, 'postal_code'),
    country: component(input.components, 'country'),
    latitude: input.location.lat,
    longitude: input.location.lng,
  };
}

export class GoogleMapsClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GoogleMapsClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Probe enabled services independently. One disabled/unavailable API does not
   * fail the whole integration — callers summarise with summarizeGoogleMapsServiceProbes.
   */
  async probeServices(services: GoogleMapsServicesConfig): Promise<GoogleMapsServiceProbe[]> {
    const flags: GoogleMapsServiceFlag[] = [
      'geocoding',
      'places',
      'routes',
      'directions',
      'distanceMatrix',
      'mapsJavascript',
    ];

    const results: GoogleMapsServiceProbe[] = [];
    for (const flag of flags) {
      if (!services[flag]) {
        results.push({
          service: flag,
          status: 'disabled',
          message: 'Disabled in TITAN settings — not tested.',
          keyStatus: null,
        });
        continue;
      }

      if (flag === 'mapsJavascript') {
        // Browser keys are typically HTTP-referrer restricted; server cannot fully validate.
        results.push({
          service: 'mapsJavascript',
          status: 'skipped',
          message:
            'Maps JavaScript is validated in the browser via the referrer-restricted key. Server probe skipped (expected).',
          keyStatus: null,
        });
        continue;
      }

      results.push(await this.probeServerService(flag));
    }
    return results;
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

    // Prefer Places API (New); fall back to legacy Autocomplete if New is not enabled.
    try {
      return await this.autocompletePlacesNew(input);
    } catch (error) {
      if (!(error instanceof GoogleMapsClientError)) throw error;
      return this.autocompletePlacesLegacy(input);
    }
  }

  private async autocompletePlacesNew(input: {
    query: string;
    sessionToken?: string;
    region?: string;
    language?: string;
  }): Promise<GooglePlacePrediction[]> {
    const body: Record<string, unknown> = {
      input: input.query.trim(),
      includedRegionCodes: ['za'],
    };
    if (input.sessionToken) body.sessionToken = input.sessionToken;
    if (input.language) body.languageCode = input.language;

    const json = await this.postJson<{
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }>;
      error?: { message?: string; status?: string };
    }>('https://places.googleapis.com/v1/places:autocomplete', body, {
      'X-Goog-FieldMask':
        'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
    });

    if (json.error?.message) {
      throw new GoogleMapsClientError(json.error.message, json.error.status ?? 'REQUEST_DENIED');
    }

    return (json.suggestions ?? [])
      .map((suggestion) => suggestion.placePrediction)
      .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction?.placeId))
      .map((prediction) => ({
        placeId: prediction.placeId!,
        description: prediction.text?.text ?? prediction.structuredFormat?.mainText?.text ?? '',
        mainText:
          prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? prediction.placeId!,
        secondaryText: prediction.structuredFormat?.secondaryText?.text ?? '',
      }));
  }

  private async autocompletePlacesLegacy(input: {
    query: string;
    sessionToken?: string;
    region?: string;
    language?: string;
  }): Promise<GooglePlacePrediction[]> {
    const params = new URLSearchParams({
      input: input.query.trim(),
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
      throw new GoogleMapsClientError(
        json.error_message ?? `Places autocomplete failed: ${json.status}`,
        json.status,
      );
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
    return mapAddressResult({
      placeId: result.place_id,
      formattedAddress: result.formatted_address,
      fallbackAddress: trimmed,
      location: result.geometry.location,
      components: result.address_components ?? [],
    });
  }

  async reverseGeocode(input: GoogleLatLng): Promise<GoogleGeocodedAddress | null> {
    if (
      !Number.isFinite(input.latitude) ||
      !Number.isFinite(input.longitude) ||
      input.latitude < -90 ||
      input.latitude > 90 ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      return null;
    }

    const params = new URLSearchParams({
      latlng: `${input.latitude},${input.longitude}`,
      key: this.apiKey,
      region: 'za',
    });
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
      throw new GoogleMapsClientError(
        json.error_message ?? `Reverse geocoding failed: ${json.status}`,
        json.status,
      );
    }

    const result = json.results?.[0];
    const location = result?.geometry?.location ?? {
      lat: input.latitude,
      lng: input.longitude,
    };
    if (!result) return null;
    return mapAddressResult({
      placeId: result.place_id,
      formattedAddress: result.formatted_address,
      fallbackAddress: `${input.latitude},${input.longitude}`,
      location,
      components: result.address_components ?? [],
    });
  }

  async placeDetails(placeId: string): Promise<GoogleGeocodedAddress | null> {
    try {
      return await this.placeDetailsNew(placeId);
    } catch (error) {
      if (!(error instanceof GoogleMapsClientError)) throw error;
      return this.placeDetailsLegacy(placeId);
    }
  }

  private async placeDetailsNew(placeId: string): Promise<GoogleGeocodedAddress | null> {
    const id = placeId.startsWith('places/') ? placeId : `places/${placeId}`;
    const json = await this.getJsonAuthed<{
      id?: string;
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
      error?: { message?: string; status?: string };
    }>(`https://places.googleapis.com/v1/${id}`, {
      'X-Goog-FieldMask': 'id,formattedAddress,location,addressComponents',
    });

    if (json.error?.message) {
      throw new GoogleMapsClientError(json.error.message, json.error.status ?? 'REQUEST_DENIED');
    }
    if (
      typeof json.location?.latitude !== 'number' ||
      typeof json.location?.longitude !== 'number'
    ) {
      return null;
    }

    const components = (json.addressComponents ?? []).map((entry) => ({
      long_name: entry.longText ?? '',
      short_name: entry.shortText ?? '',
      types: entry.types ?? [],
    }));

    return mapAddressResult({
      placeId: placeId.replace(/^places\//, ''),
      formattedAddress: json.formattedAddress,
      fallbackAddress: '',
      location: { lat: json.location.latitude, lng: json.location.longitude },
      components,
    });
  }

  private async placeDetailsLegacy(placeId: string): Promise<GoogleGeocodedAddress | null> {
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
      throw new GoogleMapsClientError(
        json.error_message ?? `Place details failed: ${json.status}`,
        json.status,
      );
    }

    const result = json.result;
    const location = result.geometry?.location;
    if (!location) return null;
    return mapAddressResult({
      placeId: result.place_id ?? placeId,
      formattedAddress: result.formatted_address,
      fallbackAddress: '',
      location,
      components: result.address_components ?? [],
    });
  }

  /** Routes API (computeRoutes) — preferred traffic-aware path when enabled in GCP. */
  async computeRoutes(input: {
    origin: GoogleLatLng;
    destination: GoogleLatLng;
  }): Promise<GoogleRouteEstimate | null> {
    const json = await this.postJson<{
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
      }>;
      error?: { message?: string; status?: string };
    }>(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        origin: {
          location: {
            latLng: { latitude: input.origin.latitude, longitude: input.origin.longitude },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: input.destination.latitude,
              longitude: input.destination.longitude,
            },
          },
        },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: false,
        languageCode: 'en-ZA',
        units: 'METRIC',
      },
      {
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
    );

    if (json.error?.message) {
      throw new GoogleMapsClientError(json.error.message, json.error.status ?? 'REQUEST_DENIED');
    }

    const route = json.routes?.[0];
    if (!route || typeof route.distanceMeters !== 'number' || !route.duration) {
      return null;
    }

    const durationSeconds = parseRoutesDurationSeconds(route.duration);
    if (durationSeconds == null) return null;

    const km = route.distanceMeters / 1000;
    const distanceText = km >= 1 ? `${km.toFixed(1)} km` : `${route.distanceMeters} m`;
    const durationText = formatDurationLabel(durationSeconds);

    return {
      distanceMeters: route.distanceMeters,
      distanceText,
      durationSeconds,
      durationText,
      durationInTrafficSeconds: durationSeconds,
      durationInTrafficText: durationText,
      polyline: route.polyline?.encodedPolyline ?? null,
      source: 'google_maps',
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

  private async probeServerService(
    service: Exclude<GoogleMapsServiceFlag, 'mapsJavascript'>,
  ): Promise<GoogleMapsServiceProbe> {
    try {
      if (service === 'geocoding') {
        const result = await this.geocodeAddress('Cape Town, South Africa');
        return {
          service,
          status: result ? 'available' : 'unavailable',
          message: result
            ? 'Geocoding API responded successfully.'
            : 'Geocoding returned no results for the probe query.',
          keyStatus: 'configured',
        };
      }

      if (service === 'places') {
        const predictions = await this.autocompletePlaces({ query: 'Cape Town' });
        return {
          service,
          status: 'available',
          message:
            predictions.length > 0
              ? 'Places Autocomplete responded successfully.'
              : 'Places Autocomplete responded (zero predictions for probe query).',
          keyStatus: 'configured',
        };
      }

      if (service === 'routes') {
        const route = await this.computeRoutes({
          origin: PROBE_ORIGIN,
          destination: PROBE_DESTINATION,
        });
        return {
          service,
          status: route ? 'available' : 'unavailable',
          message: route
            ? 'Routes API responded successfully.'
            : 'Routes API returned no route for the probe path.',
          keyStatus: 'configured',
        };
      }

      if (service === 'directions') {
        const route = await this.directions({
          origin: PROBE_ORIGIN,
          destination: PROBE_DESTINATION,
          departureTime: 'now',
        });
        return {
          service,
          status: route ? 'available' : 'unavailable',
          message: route
            ? 'Directions API responded successfully.'
            : 'Directions returned no route for the probe path.',
          keyStatus: 'configured',
        };
      }

      const matrix = await this.distanceMatrix({
        origin: PROBE_ORIGIN,
        destination: PROBE_DESTINATION,
        departureTime: 'now',
      });
      return {
        service,
        status: matrix ? 'available' : 'unavailable',
        message: matrix
          ? 'Distance Matrix API responded successfully.'
          : 'Distance Matrix returned no element for the probe path.',
        keyStatus: 'configured',
      };
    } catch (error) {
      const status = error instanceof GoogleMapsClientError ? error.status : undefined;
      const message =
        error instanceof Error ? error.message : 'Google Maps service probe failed';
      return {
        service,
        status: 'unavailable',
        message,
        keyStatus: classifyGoogleMapsApiStatus(status, message),
      };
    }
  }

  private async getJson<T>(url: string): Promise<T> {
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new GoogleMapsClientError(
        text || `Google Maps HTTP ${response.status}`,
        String(response.status),
      );
    }
    return (await response.json()) as T;
  }

  private async getJsonAuthed<T>(url: string, extraHeaders: Record<string, string>): Promise<T> {
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        ...extraHeaders,
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new GoogleMapsClientError(
        text || `Google Maps HTTP ${response.status}`,
        String(response.status),
      );
    }
    return (await response.json()) as T;
  }

  private async postJson<T>(
    url: string,
    body: Record<string, unknown>,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new GoogleMapsClientError(
        text || `Google Maps HTTP ${response.status}`,
        String(response.status),
      );
    }
    return (await response.json()) as T;
  }
}

function parseRoutesDurationSeconds(duration: string): number | null {
  // Routes API returns values like "123s"
  const match = /^(\d+(?:\.\d+)?)s$/.exec(duration.trim());
  if (!match) return null;
  return Math.round(Number(match[1]));
}

function formatDurationLabel(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}
