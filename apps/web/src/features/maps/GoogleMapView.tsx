import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@titan/ui';
import { Link } from 'wouter';
import { useAuth } from '../../lib/auth-context';
import { fetchGoogleMapsBrowserConfig } from '../../lib/google-maps-api';

export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  label?: string;
  tone?: 'customer' | 'vehicle' | 'job';
};

export type GoogleMapViewProps = {
  markers?: MapMarker[];
  routePolyline?: string | null;
  height?: number | string;
  className?: string;
  emptyTitle?: string;
  emptyDescription?: string;
};

declare global {
  interface Window {
    google?: {
      maps: {
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
          fitBounds: (b: unknown) => void;
          setCenter: (c: { lat: number; lng: number }) => void;
          setZoom: (z: number) => void;
        };
        Marker: new (opts: Record<string, unknown>) => unknown;
        LatLngBounds: new () => { extend: (c: { lat: number; lng: number }) => void };
        geometry?: { encoding?: { decodePath: (path: string) => unknown } };
        Polyline: new (opts: Record<string, unknown>) => unknown;
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

export function GoogleMapView({
  markers = [],
  routePolyline = null,
  height = 280,
  className = '',
  emptyTitle = 'Map unavailable',
  emptyDescription = 'Google Maps is not connected or no verified coordinates are available. TITAN will not invent markers.',
}: GoogleMapViewProps) {
  const { accessToken } = useAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      if (!accessToken || !containerRef.current) return;
      try {
        const config = await fetchGoogleMapsBrowserConfig(accessToken);
        if (cancelled) return;
        if (!config.enabled || !config.browserApiKey) {
          setError('browser_key_missing');
          setReady(false);
          return;
        }
        if (markers.length === 0 && !routePolyline) {
          setError('no_markers');
          setReady(false);
          return;
        }

        await loadGoogleMapsScript(config.browserApiKey);
        if (cancelled || !containerRef.current || !window.google?.maps) return;

        const map = new window.google.maps.Map(containerRef.current, {
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoom: 12,
          center: { lat: markers[0]?.latitude ?? -33.9249, lng: markers[0]?.longitude ?? 18.4241 },
        });

        const bounds = new window.google.maps.LatLngBounds();
        for (const marker of markers) {
          new window.google.maps.Marker({
            map,
            position: { lat: marker.latitude, lng: marker.longitude },
            title: marker.label,
          });
          bounds.extend({ lat: marker.latitude, lng: marker.longitude });
        }

        if (routePolyline && window.google.maps.geometry?.encoding) {
          const path = window.google.maps.geometry.encoding.decodePath(routePolyline);
          new window.google.maps.Polyline({
            map,
            path,
            strokeColor: '#22d3ee',
            strokeOpacity: 0.9,
            strokeWeight: 4,
          });
        }

        if (markers.length > 1) map.fitBounds(bounds);
        setReady(true);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Map failed to load');
          setReady(false);
        }
      }
    }

    void mount();
    return () => {
      cancelled = true;
    };
  }, [accessToken, markers, routePolyline]);

  if (error === 'browser_key_missing') {
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

  if (error === 'no_markers') {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  if (error && error !== 'browser_key_missing' && error !== 'no_markers') {
    return <EmptyState title="Map error" description={error} />;
  }

  return (
    <div
      className={`titan-google-map ${className}`.trim()}
      style={{ height, width: '100%', borderRadius: '0.75rem', overflow: 'hidden' }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {!ready ? <p className="page-muted" style={{ padding: '0.75rem' }}>Loading map…</p> : null}
    </div>
  );
}
