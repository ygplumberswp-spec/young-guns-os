import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { FleetLiveMapVehicle, FleetMovementDisplayState } from '@titan/shared';
import { FLEET_MOVEMENT_LABELS } from '@titan/shared';
import { Button } from '@titan/ui';
import { resolveMapProviderConfig } from '../../lib/map-provider';
import { FleetMapFallbackList } from './FleetMapFallbackList';
import 'maplibre-gl/dist/maplibre-gl.css';

const MARKER_COLORS: Record<FleetMovementDisplayState, string> = {
  driving: '#16a34a',
  parked: '#2563eb',
  idling: '#d97706',
  ignition_off: '#64748b',
  off_duty: '#94a3b8',
  gps_stale: '#ea580c',
  tracker_offline: '#dc2626',
  unknown: '#64748b',
};

const TRAILS_SOURCE = 'fleet-trails';
const TRAILS_LAYER = 'fleet-trails-line';

type FleetLiveMapCanvasProps = {
  vehicles: FleetLiveMapVehicle[];
  selectedVehicleId: string | null;
  onSelect: (vehicleId: string) => void;
  onMapStatusChange?: (status: { ready: boolean; error: string | null }) => void;
};

function positionedVehicles(vehicles: FleetLiveMapVehicle[]) {
  return vehicles.filter(
    (vehicle) =>
      vehicle.latitude != null &&
      vehicle.longitude != null &&
      Number.isFinite(vehicle.latitude) &&
      Number.isFinite(vehicle.longitude),
  );
}

function markerLabel(vehicle: FleetLiveMapVehicle): string {
  return vehicle.registration ?? vehicle.name ?? 'VEH';
}

function movementState(vehicle: FleetLiveMapVehicle): FleetMovementDisplayState {
  return vehicle.displayState ?? 'unknown';
}

function buildMarkerElement(vehicle: FleetLiveMapVehicle, selected: boolean): HTMLSpanElement {
  const label = markerLabel(vehicle);
  const short = label.length > 10 ? label.slice(-6) : label;
  const state = movementState(vehicle);
  const el = document.createElement('span');
  el.className = `fleet-live-map-marker-pin fleet-live-map-marker--${state}${
    vehicle.isStale ? ' is-stale' : ''
  }${selected ? ' is-selected' : ''}`;
  el.style.setProperty('--marker-color', MARKER_COLORS[state]);
  el.textContent = short;
  el.title = `${label} · ${FLEET_MOVEMENT_LABELS[state]}`;
  return el;
}

type TrailFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { vehicleId: string; selected: boolean };
    geometry: {
      type: 'LineString';
      coordinates: [number, number][];
    };
  }>;
};

function buildTrailGeoJson(
  vehicles: FleetLiveMapVehicle[],
  selectedVehicleId: string | null,
): TrailFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: vehicles
      .filter((vehicle) => vehicle.trailToday.length >= 2)
      .map((vehicle) => ({
        type: 'Feature',
        properties: {
          vehicleId: vehicle.vehicleId,
          selected: selectedVehicleId === vehicle.vehicleId,
        },
        geometry: {
          type: 'LineString',
          coordinates: vehicle.trailToday.map((point) => [point.longitude, point.latitude]),
        },
      })),
  };
}

export function FleetLiveMapCanvas({
  vehicles,
  selectedVehicleId,
  onSelect,
  onMapStatusChange,
}: FleetLiveMapCanvasProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const fitOnceRef = useRef(false);
  const providerConfig = resolveMapProviderConfig();
  const [mapError, setMapError] = useState<string | null>(
    providerConfig.configured ? null : 'Map could not load',
  );
  const [mapReady, setMapReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const reportStatus = useCallback(
    (ready: boolean, error: string | null) => {
      setMapReady(ready);
      setMapError(error);
      onMapStatusChange?.({ ready, error });
    },
    [onMapStatusChange],
  );

  const fitAllVehicles = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const positioned = positionedVehicles(vehicles);
    if (positioned.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const vehicle of positioned) {
      bounds.extend([vehicle.longitude!, vehicle.latitude!]);
    }
    map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 500 });
  }, [vehicles]);

  useEffect(() => {
    const host = mapHostRef.current;
    if (!host || !providerConfig.configured) {
      reportStatus(false, mapError ?? 'Map could not load');
      return;
    }

    let cancelled = false;

    const map = new maplibregl.Map({
      container: host,
      style: providerConfig.styleUrl,
      center: [18.7174, -33.8293],
      zoom: 14,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      if (cancelled) return;
      map.addSource(TRAILS_SOURCE, {
        type: 'geojson',
        data: buildTrailGeoJson(vehicles, selectedVehicleId),
      });
      map.addLayer({
        id: TRAILS_LAYER,
        type: 'line',
        source: TRAILS_SOURCE,
        paint: {
          'line-color': [
            'case',
            ['get', 'selected'],
            '#2563eb',
            'rgba(37, 99, 235, 0.55)',
          ],
          'line-width': ['case', ['get', 'selected'], 4, 2],
        },
      });
      reportStatus(true, null);
      requestAnimationFrame(() => map.resize());
    });

    const loadTimer = window.setTimeout(() => {
      if (!cancelled && !map.loaded()) {
        reportStatus(false, 'Map could not load');
      }
    }, 20_000);

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(host);

    return () => {
      cancelled = true;
      window.clearTimeout(loadTimer);
      resizeObserver.disconnect();
      for (const marker of markersRef.current.values()) {
        marker.remove();
      }
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      fitOnceRef.current = false;
    };
  }, [providerConfig.configured, providerConfig.styleUrl, reportStatus, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const source = map.getSource(TRAILS_SOURCE) as maplibregl.GeoJSONSource | undefined;
    source?.setData(buildTrailGeoJson(vehicles, selectedVehicleId));

    const positioned = positionedVehicles(vehicles);
    const seen = new Set<string>();

    for (const vehicle of positioned) {
      seen.add(vehicle.vehicleId);
      const selected = selectedVehicleId === vehicle.vehicleId;
      const existing = markersRef.current.get(vehicle.vehicleId);
      if (existing) {
        existing.setLngLat([vehicle.longitude!, vehicle.latitude!]);
        const root = existing.getElement();
        root.replaceChildren(buildMarkerElement(vehicle, selected));
      } else {
        const root = document.createElement('div');
        root.className = 'fleet-live-map-maplibre-marker';
        root.appendChild(buildMarkerElement(vehicle, selected));
        root.addEventListener('click', () => onSelect(vehicle.vehicleId));
        const marker = new maplibregl.Marker({
          element: root,
          anchor: 'center',
        })
          .setLngLat([vehicle.longitude!, vehicle.latitude!])
          .addTo(map);
        markersRef.current.set(vehicle.vehicleId, marker);
      }
    }

    for (const [vehicleId, marker] of markersRef.current.entries()) {
      if (!seen.has(vehicleId)) {
        marker.remove();
        markersRef.current.delete(vehicleId);
      }
    }

    if (!fitOnceRef.current && positioned.length > 0) {
      fitOnceRef.current = true;
      fitAllVehicles();
    } else if (selectedVehicleId) {
      const selected = positioned.find((vehicle) => vehicle.vehicleId === selectedVehicleId);
      if (selected) {
        map.easeTo({
          center: [selected.longitude!, selected.latitude!],
          duration: 400,
        });
      }
    }

    requestAnimationFrame(() => map.resize());
  }, [vehicles, selectedVehicleId, onSelect, fitAllVehicles, mapReady]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
      mapRef.current?.resize();
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await shell.requestFullscreen();
  }

  function retryMap() {
    fitOnceRef.current = false;
    reportStatus(false, null);
    setRetryKey((value) => value + 1);
  }

  const positioned = positionedVehicles(vehicles);

  if (positioned.length === 0) {
    return (
      <div className="fleet-live-map-canvas fleet-live-map-canvas--empty" aria-label="Fleet live map">
        <p className="page-muted fleet-live-map-empty">
          Waiting for first automatic GPS update from Cartrack background sync.
        </p>
        {vehicles.length > 0 ? (
          <FleetMapFallbackList vehicles={vehicles} message="No GPS coordinates yet" />
        ) : null}
      </div>
    );
  }

  if (!providerConfig.configured) {
    return (
      <div className="fleet-live-map-shell fleet-live-map-shell--fallback">
        <FleetMapFallbackList
          vehicles={vehicles}
          onRetry={retryMap}
          message={providerConfig.reason ?? 'Map could not load'}
        />
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={`fleet-live-map-shell${isFullscreen ? ' fleet-live-map-shell--fullscreen' : ''}`}
    >
      <div className="fleet-live-map-toolbar">
        <span className="page-muted fleet-live-map-toolbar__meta">
          {mapReady ? `${positioned.length} on map · ${providerConfig.provider}` : 'Loading map…'}
        </span>
        <div className="fleet-live-map-toolbar__actions">
          <Button variant="secondary" type="button" onClick={fitAllVehicles}>
            Fit vehicles
          </Button>
          <Button variant="secondary" type="button" onClick={() => void toggleFullscreen()}>
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </Button>
          {mapError ? (
            <Button variant="secondary" type="button" onClick={retryMap}>
              Retry
            </Button>
          ) : null}
        </div>
      </div>

      {mapError ? (
        <div className="fleet-live-map-error" role="alert">
          <FleetMapFallbackList vehicles={vehicles} onRetry={retryMap} message={mapError} />
        </div>
      ) : null}

      <div
        ref={mapHostRef}
        className="fleet-live-map-maplibre-host"
        aria-label="Fleet live map"
        data-map-ready={mapReady ? 'true' : 'false'}
      />
    </div>
  );
}
