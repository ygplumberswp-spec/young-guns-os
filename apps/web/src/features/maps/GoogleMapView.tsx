import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@titan/ui';
import { Link } from 'wouter';
import { useAuth } from '../../lib/auth-context';
import { fetchGoogleMapsBrowserConfig } from '../../lib/google-maps-api';
import {
  decideMapCameraAction,
  resolveContextKey,
  resolveFollowId,
} from './map-camera-policy';

export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  label?: string;
  tone?: 'customer' | 'vehicle' | 'job';
  /** Provider heading in degrees — rotates the vehicle marker when supplied. */
  headingDegrees?: number | null;
};

/** Breadcrumb trail drawn behind a followed vehicle, from stored provider readings. */
export type MapTrail = {
  points: Array<{ latitude: number; longitude: number }>;
};

export type GoogleMapViewProps = {
  markers?: MapMarker[];
  routePolyline?: string | null;
  height?: number | string;
  className?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /**
   * When this value changes, the camera recenters to the current markers once.
   * Use for job/context switches — not for live GPS polling.
   */
  contextKey?: string | null;
  /** Alias for contextKey (existing call sites). */
  cameraContextKey?: string | null;
  /**
   * When set, the camera follows this marker on position updates (Follow Vehicle).
   * Off by default — manual pan/zoom is preserved.
   */
  followVehicleId?: string | null;
  /** Alias for followVehicleId. */
  followMarkerId?: string | null;
  /** Parent increments to trigger a one-shot locate/fitBounds. */
  locateToken?: number | null;
  /**
   * Called when the operator pans or zooms the map themselves. Follow mode uses this to
   * suspend re-centring so the map does not fight the person reading it.
   */
  onManualMapMove?: () => void;
  /** Breadcrumb trail behind the followed vehicle. */
  trail?: MapTrail | null;
  /** Zoom applied when centring on a single followed vehicle. */
  followZoom?: number;
  /** Shows the native full-screen control. */
  allowFullscreen?: boolean;
};

type GoogleMapTypeId = 'roadmap' | 'satellite' | 'hybrid' | 'terrain';

type GoogleMapInstance = {
  fitBounds: (b: unknown) => void;
  setCenter: (c: { lat: number; lng: number }) => void;
  setZoom: (z: number) => void;
  getZoom: () => number | undefined;
  setMapTypeId: (id: GoogleMapTypeId) => void;
  getMapTypeId: () => string;
};

type GoogleMarkerInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
  setPosition: (c: { lat: number; lng: number }) => void;
  setTitle: (title: string) => void;
  setIcon: (icon: unknown) => void;
};

type GooglePolylineInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
  setPath: (path: unknown) => void;
};

declare global {
  interface Window {
    google?: {
      maps: {
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMapInstance;
        Marker: new (opts: Record<string, unknown>) => GoogleMarkerInstance;
        event: {
          addListener: (instance: unknown, eventName: string, handler: () => void) => unknown;
        };
        LatLngBounds: new () => { extend: (c: { lat: number; lng: number }) => void };
        geometry?: { encoding?: { decodePath: (path: string) => unknown } };
        Polyline: new (opts: Record<string, unknown>) => GooglePolylineInstance;
        ControlPosition: {
          TOP_RIGHT: unknown;
          LEFT_BOTTOM: unknown;
        };
        MapTypeControlStyle: {
          HORIZONTAL_BAR: unknown;
          DROPDOWN_MENU: unknown;
        };
        MapTypeId: {
          ROADMAP: GoogleMapTypeId;
          SATELLITE: GoogleMapTypeId;
          HYBRID: GoogleMapTypeId;
          TERRAIN: GoogleMapTypeId;
        };
        SymbolPath: {
          FORWARD_CLOSED_ARROW: unknown;
          CIRCLE: unknown;
        };
      };
    };
    __titanGoogleMapsLoader?: Promise<void>;
  }
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__titanGoogleMapsLoader) return window.__titanGoogleMapsLoader;

  window.__titanGoogleMapsLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps JavaScript API'));
    document.head.appendChild(script);
  });

  return window.__titanGoogleMapsLoader;
}

/**
 * A vehicle marker points the way the provider says the vehicle was facing. Without a
 * heading it stays a plain dot rather than guessing a direction from previous positions.
 */
function vehicleMarkerIcon(marker: MapMarker): unknown {
  const gmaps = window.google?.maps;
  if (!gmaps || marker.tone !== 'vehicle') return undefined;

  const heading = marker.headingDegrees;
  const hasHeading = typeof heading === 'number' && Number.isFinite(heading);

  return {
    path: hasHeading ? gmaps.SymbolPath.FORWARD_CLOSED_ARROW : gmaps.SymbolPath.CIRCLE,
    scale: hasHeading ? 5 : 6,
    rotation: hasHeading ? heading : 0,
    fillColor: '#0ea5e9',
    fillOpacity: 1,
    strokeColor: '#0c4a6e',
    strokeWeight: 2,
  };
}

function applyCameraToMarkers(map: GoogleMapInstance, markers: MapMarker[]) {
  if (markers.length === 0 || !window.google?.maps) return;
  if (markers.length === 1) {
    map.setCenter({ lat: markers[0]!.latitude, lng: markers[0]!.longitude });
    map.setZoom(14);
    return;
  }
  const bounds = new window.google.maps.LatLngBounds();
  for (const marker of markers) {
    bounds.extend({ lat: marker.latitude, lng: marker.longitude });
  }
  map.fitBounds(bounds);
}

export function GoogleMapView({
  markers = [],
  routePolyline = null,
  height = 280,
  className = '',
  emptyTitle = 'Map unavailable',
  emptyDescription = 'Google Maps is not connected or no verified coordinates are available. TITAN will not invent markers.',
  contextKey = null,
  cameraContextKey = null,
  followVehicleId = null,
  followMarkerId = null,
  locateToken = null,
  onManualMapMove,
  trail = null,
  followZoom = 15,
  allowFullscreen = false,
}: GoogleMapViewProps) {
  const { accessToken } = useAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const overlayMarkersRef = useRef<Map<string, GoogleMarkerInstance>>(new Map());
  const polylineRef = useRef<GooglePolylineInstance | null>(null);
  const trailPolylineRef = useRef<GooglePolylineInstance | null>(null);
  const didInitialCameraRef = useRef(false);
  /** Read inside map listeners, which are registered once and must not capture a stale prop. */
  const onManualMapMoveRef = useRef(onManualMapMove);
  /** Tracks which vehicle the camera last locked onto, so a new target zooms in once. */
  const lastFollowTargetRef = useRef<string | null>(null);
  const lastCameraContextKeyRef = useRef<string | null | undefined>(undefined);
  const lastLocateTokenRef = useRef<number | null>(null);
  /** Persists map type across marker/GPS refreshes; never reset on overlay updates. */
  const mapTypeRef = useRef<GoogleMapTypeId>('roadmap');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [browserKeyMissing, setBrowserKeyMissing] = useState(false);

  const hasContent = markers.length > 0 || Boolean(routePolyline);

  useEffect(() => {
    onManualMapMoveRef.current = onManualMapMove;
  }, [onManualMapMove]);

  // Create the map once — never tear down on marker/GPS polling updates.
  useEffect(() => {
    let cancelled = false;

    async function ensureMap() {
      if (!accessToken || !containerRef.current || !hasContent) return;
      if (mapRef.current) return;

      try {
        const config = await fetchGoogleMapsBrowserConfig(accessToken);
        if (cancelled) return;
        if (!config.enabled || !config.browserApiKey) {
          setBrowserKeyMissing(true);
          setError('browser_key_missing');
          setReady(false);
          return;
        }
        setBrowserKeyMissing(false);

        await loadGoogleMapsScript(config.browserApiKey);
        if (cancelled || !containerRef.current || !window.google?.maps || mapRef.current) return;

        const gmaps = window.google.maps;
        const map = new gmaps.Map(containerRef.current, {
          mapTypeId: mapTypeRef.current,
          mapTypeControl: true,
          mapTypeControlOptions: {
            style: gmaps.MapTypeControlStyle.HORIZONTAL_BAR,
            position: gmaps.ControlPosition.TOP_RIGHT,
            mapTypeIds: [
              gmaps.MapTypeId.ROADMAP,
              gmaps.MapTypeId.SATELLITE,
              gmaps.MapTypeId.HYBRID,
            ],
          },
          zoomControl: true,
          zoomControlOptions: {
            position: gmaps.ControlPosition.LEFT_BOTTOM,
          },
          streetViewControl: false,
          fullscreenControl: allowFullscreen,
          scaleControl: true,
          zoom: 12,
          center: {
            lat: markers[0]?.latitude ?? -33.9249,
            lng: markers[0]?.longitude ?? 18.4241,
          },
          gestureHandling: 'greedy',
        });

        // `dragstart` only fires for a real user gesture, so this cannot be tripped by
        // TITAN's own re-centring. Zoom is deliberately not treated as a manual move —
        // the operator is meant to be able to zoom while still following.
        gmaps.event.addListener(map, 'dragstart', () => {
          onManualMapMoveRef.current?.();
        });

        gmaps.event.addListener(map, 'maptypeid_changed', () => {
          const next = String(map.getMapTypeId()).toLowerCase() as GoogleMapTypeId;
          if (
            next === 'roadmap' ||
            next === 'satellite' ||
            next === 'hybrid' ||
            next === 'terrain'
          ) {
            mapTypeRef.current = next;
          }
        });

        mapRef.current = map;
        setReady(true);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Map failed to load');
          setReady(false);
        }
      }
    }

    void ensureMap();
    return () => {
      cancelled = true;
    };
    // Intentionally omit markers — map instance must survive live updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, hasContent, allowFullscreen]);

  // Sync overlays; camera moves only on initial load, context change, or follow mode.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps || !ready) return;
    if (!hasContent) return;

    const gmaps = window.google.maps;
    const nextIds = new Set(markers.map((marker) => marker.id));

    for (const [id, marker] of overlayMarkersRef.current) {
      if (!nextIds.has(id)) {
        marker.setMap(null);
        overlayMarkersRef.current.delete(id);
      }
    }

    for (const marker of markers) {
      const existing = overlayMarkersRef.current.get(marker.id);
      if (existing) {
        existing.setPosition({ lat: marker.latitude, lng: marker.longitude });
        if (marker.label) existing.setTitle(marker.label);
        existing.setIcon(vehicleMarkerIcon(marker));
      } else {
        const created = new gmaps.Marker({
          map,
          position: { lat: marker.latitude, lng: marker.longitude },
          title: marker.label,
          icon: vehicleMarkerIcon(marker),
        });
        overlayMarkersRef.current.set(marker.id, created);
      }
    }

    // Breadcrumb trail behind the followed vehicle. Dashed, so it never reads as a
    // routed path — the straight segments between readings are not the road driven.
    const trailPoints = (trail?.points ?? []).map((point) => ({
      lat: point.latitude,
      lng: point.longitude,
    }));

    if (trailPoints.length > 1) {
      if (trailPolylineRef.current) {
        trailPolylineRef.current.setPath(trailPoints);
        trailPolylineRef.current.setMap(map);
      } else {
        trailPolylineRef.current = new gmaps.Polyline({
          map,
          path: trailPoints,
          strokeColor: '#0ea5e9',
          strokeOpacity: 0,
          strokeWeight: 3,
          icons: [
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, scale: 3 },
              offset: '0',
              repeat: '12px',
            },
          ],
        });
      }
    } else if (trailPolylineRef.current) {
      trailPolylineRef.current.setMap(null);
      trailPolylineRef.current = null;
    }

    if (routePolyline && gmaps.geometry?.encoding) {
      const path = gmaps.geometry.encoding.decodePath(routePolyline);
      if (polylineRef.current) {
        polylineRef.current.setPath(path);
        polylineRef.current.setMap(map);
      } else {
        polylineRef.current = new gmaps.Polyline({
          map,
          path,
          strokeColor: '#1f7aec',
          strokeOpacity: 0.9,
          strokeWeight: 4,
        });
      }
    } else if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    const resolvedContextKey = resolveContextKey({ contextKey, cameraContextKey });
    const resolvedFollowId = resolveFollowId({ followVehicleId, followMarkerId });
    const cameraAction = decideMapCameraAction({
      didInitialCamera: didInitialCameraRef.current,
      previousContextKey: lastCameraContextKeyRef.current,
      contextKey: resolvedContextKey,
      followVehicleId: resolvedFollowId,
      locateToken,
      previousLocateToken: lastLocateTokenRef.current,
    });

    if (cameraAction === 'initial' || cameraAction === 'context_change' || cameraAction === 'locate') {
      applyCameraToMarkers(map, markers);
      didInitialCameraRef.current = true;
      lastCameraContextKeyRef.current = resolvedContextKey;
      if (locateToken != null) lastLocateTokenRef.current = locateToken;
      return;
    }

    if (cameraAction === 'follow_vehicle' && resolvedFollowId) {
      const target = markers.find((marker) => marker.id === resolvedFollowId);
      if (target) {
        map.setCenter({ lat: target.latitude, lng: target.longitude });
        // Zoom in once when a new vehicle is picked up, then leave zoom to the operator
        // so they can zoom freely while following.
        if (lastFollowTargetRef.current !== resolvedFollowId) {
          map.setZoom(followZoom);
          lastFollowTargetRef.current = resolvedFollowId;
        }
      }
      return;
    }

    if (!resolvedFollowId) {
      lastFollowTargetRef.current = null;
    }
  }, [
    markers,
    routePolyline,
    trail,
    contextKey,
    cameraContextKey,
    followVehicleId,
    followMarkerId,
    followZoom,
    locateToken,
    ready,
    hasContent,
  ]);

  // Full unmount cleanup only.
  useEffect(() => {
    return () => {
      for (const marker of overlayMarkersRef.current.values()) {
        marker.setMap(null);
      }
      overlayMarkersRef.current.clear();
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      trailPolylineRef.current?.setMap(null);
      trailPolylineRef.current = null;
      mapRef.current = null;
      didInitialCameraRef.current = false;
      lastCameraContextKeyRef.current = undefined;
      lastFollowTargetRef.current = null;
    };
  }, []);

  if (browserKeyMissing || error === 'browser_key_missing') {
    return (
      <EmptyState
        title={emptyTitle}
        description="Connect Google Maps and add a referrer-restricted browser key to render interactive maps."
        action={
          <Link href="/integrations/google-maps" className="jobs-link">
            Open Google Maps settings
          </Link>
        }
      />
    );
  }

  if (!hasContent) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  if (error && error !== 'browser_key_missing') {
    return <EmptyState title="Map Error" description={error} />;
  }

  return (
    <div
      className={`titan-google-map ${className}`.trim()}
      style={{ height, width: '100%', borderRadius: '0.75rem', overflow: 'hidden' }}
    >
      <div
        ref={containerRef}
        className="titan-google-map__canvas"
        style={{ width: '100%', height: '100%' }}
      />
      {!ready ? <p className="page-muted titan-google-map__loading">Loading map…</p> : null}
    </div>
  );
}
