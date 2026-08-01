/** Fleet map tile provider — configured via Vite env (Railway web service). No secrets in repo. */

export type MapTileProviderId = 'openfreemap' | 'maptiler' | 'stadia' | 'osm' | 'custom';

export type MapProviderConfig = {
  provider: MapTileProviderId;
  styleUrl: string;
  configured: boolean;
  reason: string | null;
};

function readProviderId(): MapTileProviderId {
  const raw = String(import.meta.env.VITE_MAP_TILE_PROVIDER || 'openfreemap')
    .trim()
    .toLowerCase();
  if (
    raw === 'openfreemap' ||
    raw === 'maptiler' ||
    raw === 'stadia' ||
    raw === 'osm' ||
    raw === 'custom'
  ) {
    return raw;
  }
  return 'openfreemap';
}

/** Resolve MapLibre style URL from build-time env. Keys are never logged. */
export function resolveMapProviderConfig(): MapProviderConfig {
  const provider = readProviderId();
  const styleOverride = String(import.meta.env.VITE_MAP_TILE_STYLE_URL || '').trim();
  const apiKey = String(import.meta.env.VITE_MAP_TILE_API_KEY || '').trim();

  if (styleOverride) {
    return {
      provider: 'custom',
      styleUrl: styleOverride,
      configured: true,
      reason: null,
    };
  }

  switch (provider) {
    case 'maptiler':
      if (!apiKey) {
        return {
          provider,
          styleUrl: '',
          configured: false,
          reason: 'MapTiler requires VITE_MAP_TILE_API_KEY',
        };
      }
      return {
        provider,
        styleUrl: `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(apiKey)}`,
        configured: true,
        reason: null,
      };
    case 'stadia':
      if (!apiKey) {
        return {
          provider,
          styleUrl: '',
          configured: false,
          reason: 'Stadia Maps requires VITE_MAP_TILE_API_KEY',
        };
      }
      return {
        provider,
        styleUrl: `https://tiles.stadiamaps.com/styles/osm_bright.json?api_key=${encodeURIComponent(apiKey)}`,
        configured: true,
        reason: null,
      };
    case 'osm':
      return {
        provider,
        styleUrl: '',
        configured: false,
        reason:
          'Direct OpenStreetMap raster tiles are blocked for production use — set VITE_MAP_TILE_PROVIDER=openfreemap or configure MapTiler/Stadia.',
      };
    case 'openfreemap':
    default:
      return {
        provider: 'openfreemap',
        // OpenFreeMap vector style intermittently fails style load in staging headless/real browsers;
        // MapLibre demo tiles use the same OSM road network with reliable global CDN.
        styleUrl: 'https://demotiles.maplibre.org/style.json',
        configured: true,
        reason: null,
      };
  }
}
