import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { FleetLiveMapVehicle, FleetMovementDisplayState } from '@titan/shared';
import { FLEET_MOVEMENT_LABELS } from '@titan/shared';
import { Button } from '@titan/ui';
import 'leaflet/dist/leaflet.css';

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

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

function buildMarkerHtml(vehicle: FleetLiveMapVehicle, selected: boolean): string {
  const label = markerLabel(vehicle);
  const short = label.length > 10 ? label.slice(-6) : label;
  const color = MARKER_COLORS[vehicle.displayState];
  const staleClass = vehicle.isStale ? ' is-stale' : '';
  const selectedClass = selected ? ' is-selected' : '';
  return `<span class="fleet-live-map-marker-pin fleet-live-map-marker--${vehicle.displayState}${staleClass}${selectedClass}" style="--marker-color:${color}">${short}</span>`;
}

export function FleetLiveMapCanvas({
  vehicles,
  selectedVehicleId,
  onSelect,
  onMapStatusChange,
}: FleetLiveMapCanvasProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const trailsLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const fitOnceRef = useRef(false);
  const [mapError, setMapError] = useState<string | null>(null);
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
    const bounds = L.latLngBounds(
      positioned.map((vehicle) => [vehicle.latitude!, vehicle.longitude!] as L.LatLngTuple),
    );
    map.fitBounds(bounds.pad(0.25), { maxZoom: 16, animate: true });
  }, [vehicles]);

  useEffect(() => {
    const host = mapHostRef.current;
    if (!host) return;

    let cancelled = false;
    let tileErrors = 0;

    const map = L.map(host, {
      zoomControl: true,
      attributionControl: true,
    }).setView([-33.8293, 18.7174], 14);

    mapRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);
    trailsLayerRef.current = L.layerGroup().addTo(map);

    const tileLayer = L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    });
    tileLayerRef.current = tileLayer;

    tileLayer.on('tileerror', () => {
      tileErrors += 1;
      if (tileErrors >= 3 && !cancelled) {
        reportStatus(false, 'Map tiles failed to load. Check network or try again.');
      }
    });

    tileLayer.on('load', () => {
      if (!cancelled && tileErrors === 0) {
        reportStatus(true, null);
      }
    });

    tileLayer.addTo(map);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(host);

    requestAnimationFrame(() => {
      map.invalidateSize();
      reportStatus(true, null);
    });

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      trailsLayerRef.current = null;
      tileLayerRef.current = null;
      fitOnceRef.current = false;
    };
  }, [reportStatus, retryKey]);

  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    const trailsLayer = trailsLayerRef.current;
    if (!map || !markersLayer || !trailsLayer) return;

    markersLayer.clearLayers();
    trailsLayer.clearLayers();

    const positioned = positionedVehicles(vehicles);
    if (positioned.length === 0) {
      return;
    }

    for (const vehicle of vehicles) {
      if (vehicle.trailToday.length >= 2) {
        trailsLayer.addLayer(
          L.polyline(
            vehicle.trailToday.map(
              (point) => [point.latitude, point.longitude] as L.LatLngTuple,
            ),
            {
              color:
                selectedVehicleId === vehicle.vehicleId
                  ? 'var(--titan-accent, #2563eb)'
                  : 'rgba(37, 99, 235, 0.55)',
              weight: selectedVehicleId === vehicle.vehicleId ? 4 : 2,
            },
          ),
        );
      }
    }

    for (const vehicle of positioned) {
      const selected = selectedVehicleId === vehicle.vehicleId;
      const icon = L.divIcon({
        className: 'fleet-live-map-leaflet-marker',
        html: buildMarkerHtml(vehicle, selected),
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      const marker = L.marker([vehicle.latitude!, vehicle.longitude!], { icon });
      marker.bindTooltip(
        `${markerLabel(vehicle)} · ${FLEET_MOVEMENT_LABELS[vehicle.displayState]}`,
        { direction: 'top', offset: [0, -18] },
      );
      marker.on('click', () => onSelect(vehicle.vehicleId));
      markersLayer.addLayer(marker);

      if (selected) {
        marker.openTooltip();
      }
    }

    if (!fitOnceRef.current) {
      fitOnceRef.current = true;
      fitAllVehicles();
    } else if (selectedVehicleId) {
      const selected = positioned.find((vehicle) => vehicle.vehicleId === selectedVehicleId);
      if (selected) {
        map.panTo([selected.latitude!, selected.longitude!], { animate: true });
      }
    }

    requestAnimationFrame(() => map.invalidateSize());
  }, [vehicles, selectedVehicleId, onSelect, fitAllVehicles]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
      mapRef.current?.invalidateSize();
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
          {mapReady ? `${positioned.length} on map` : 'Loading map…'}
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
              Retry map
            </Button>
          ) : null}
        </div>
      </div>

      {mapError ? (
        <div className="fleet-live-map-error" role="alert">
          <p>{mapError}</p>
          <p className="page-muted">Vehicle list on the left remains available while the map recovers.</p>
        </div>
      ) : null}

      <div
        ref={mapHostRef}
        className="fleet-live-map-leaflet-host"
        aria-label="Fleet live map"
        data-map-ready={mapReady ? 'true' : 'false'}
      />
    </div>
  );
}
