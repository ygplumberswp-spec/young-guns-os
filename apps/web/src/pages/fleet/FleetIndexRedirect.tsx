import { useEffect } from 'react';
import { useLocation } from 'wouter';

/** Redirect legacy /fleet index to Live Map — prevents dispatch board fallback. */
export function FleetIndexRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/fleet/live-map');
  }, [setLocation]);

  return null;
}
