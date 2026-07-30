import { usePortalIdlePreload, useNavTiming } from '../lib/preload-coordinator';

export function PortalPreloadCoordinator() {
  usePortalIdlePreload();
  useNavTiming();
  return null;
}
