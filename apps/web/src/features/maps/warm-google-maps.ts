import { fetchGoogleMapsBrowserConfig } from '../../lib/google-maps-api';
import { loadGoogleMapsScript } from './google-maps-loader';

/**
 * YG-CUTOVER-001D — warm Maps browser-config + script off the critical dashboard path.
 * Failures are swallowed; GoogleMapView still owns truthful empty/error states.
 */
export async function warmGoogleMapsForDashboard(accessToken: string): Promise<void> {
  try {
    const config = await fetchGoogleMapsBrowserConfig(accessToken);
    if (!config.enabled || !config.browserApiKey) return;
    await loadGoogleMapsScript(config.browserApiKey);
  } catch {
    // Non-critical warmup — map panel will surface connection state when it mounts.
  }
}
