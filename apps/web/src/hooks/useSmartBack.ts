import { useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  readLastModule,
  resolveSmartBackFallback,
} from '../lib/back-navigation';
import { stageNavStateForFallback } from './useTitanNavigationHistory';

export { resolveSmartBackFallback } from '../lib/back-navigation';

export function useSmartBack(explicitFallback?: string) {
  const [location, navigate] = useLocation();

  const fallback =
    explicitFallback ??
    (location === '/' ? (readLastModule() ?? '/') : resolveSmartBackFallback(location));

  const goBack = useCallback(() => {
    stageNavStateForFallback(fallback);

    if (typeof window !== 'undefined' && window.history.length > 1) {
      const referrer = document.referrer;
      if (referrer && referrer.includes(window.location.origin)) {
        window.history.back();
        return;
      }
    }
    navigate(fallback);
  }, [fallback, navigate]);

  return { fallback, goBack };
}
