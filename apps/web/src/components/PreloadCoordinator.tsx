import { useStaffIdlePreload, useNavTiming } from '../lib/preload-coordinator';

/** Starts role-aware idle route preloading and navigation timing after authentication. */
export function PreloadCoordinator() {
  useStaffIdlePreload();
  useNavTiming();
  return null;
}
