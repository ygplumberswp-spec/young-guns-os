import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PortalAuthSession, PortalAuthUser } from '@titan/shared';
import * as portalApi from './portal-api-client';
import { clearAllQueryCache, clearQueryCacheForScope } from './query-cache';
import { resetPreloadSession } from './preload-coordinator';

type PortalAuthContextValue = {
  user: PortalAuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PortalAuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const restored = await portalApi.restorePortalSession();

        if (cancelled) {
          return;
        }

        if (restored) {
          setUser(restored.user);
          setAccessToken(restored.session.accessToken);
          return;
        }

        setUser(null);
        setAccessToken(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const applyAuth = useCallback((payload: { user: PortalAuthUser; session: PortalAuthSession }) => {
    setUser((previous) => {
      if (previous && previous.id !== payload.user.id) {
        clearAllQueryCache();
        resetPreloadSession();
      }
      return payload.user;
    });
    setAccessToken(payload.session.accessToken);
  }, []);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const result = await portalApi.portalLogin(input);
      applyAuth(result);
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    const scope = user
      ? {
          tenantId: user.companyId,
          actorId: user.id,
          actorKind: 'portal' as const,
          customerId: user.customerId,
        }
      : null;

    await portalApi.portalLogout();
    if (scope) {
      clearQueryCacheForScope(scope);
    }
    clearAllQueryCache();
    resetPreloadSession();
    setUser(null);
    setAccessToken(null);
  }, [user]);

  const value = useMemo<PortalAuthContextValue>(
    () => ({
      user,
      accessToken,
      isLoading,
      isAuthenticated: Boolean(user && accessToken),
      login,
      logout,
    }),
    [user, accessToken, isLoading, login, logout],
  );

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

export function usePortalAuth() {
  const context = useContext(PortalAuthContext);

  if (!context) {
    throw new Error('usePortalAuth must be used within PortalAuthProvider');
  }

  return context;
}
