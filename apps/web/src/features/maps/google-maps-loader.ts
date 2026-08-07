/**
 * Shared Google Maps JS loader — singleton so dashboard warmup and map mount share one script.
 */

declare global {
  interface Window {
    __titanGoogleMapsLoader?: Promise<void>;
  }
}

type GoogleMapsWindow = Window & {
  google?: { maps?: unknown };
};

/** Load Maps JS once; safe to call from dashboard warmup before the map panel mounts. */
export function loadGoogleMapsScript(apiKey: string): Promise<void> {
  const win = window as GoogleMapsWindow;
  if (win.google?.maps) return Promise.resolve();
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
