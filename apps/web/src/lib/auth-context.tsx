import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthSession, AuthUser } from '@titan/shared';
import * as api from './api-client';
import * as teamApi from './team-api';
import { clearAllQueryCache, clearQueryCacheForScope } from './query-cache';
import { resetPreloadSession } from './preload-coordinator';
import {
  cacheStaffSessionForOffline,
  clearAllMobileOfflineData,
  readCachedStaffSession,
} from './mobile-offline-queue';

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signup: (input: {
    companyName: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
  login: (input: {
    email: string;
    password: string;
  }) => Promise<{ user: AuthUser; session: AuthSession }>;
  acceptInvite: (input: {
    token: string;
    firstName: string;
    lastName: string;
    password: string;
  }) => Promise<api.AuthPayload>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        let restored: Awaited<ReturnType<typeof api.restoreSession>> = null;
        try {
          restored = await api.restoreSession();
        } catch {
          restored = null;
        }

        if (cancelled) {
          return;
        }

        if (restored) {
          setUser(restored.user);
          setAccessToken(restored.session.accessToken);
          await cacheStaffSessionForOffline({
            user: restored.user as unknown as Record<string, unknown>,
            accessToken: restored.session.accessToken,
          });
          return;
        }

        // Offline reopen: use short-lived cached access token if still valid.
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const cached = await readCachedStaffSession();
          if (cached) {
            setUser(cached.user as unknown as AuthUser);
            setAccessToken(cached.accessToken);
            return;
          }
        } else {
          // Online refresh failed ⇒ session expired — clear protected local data.
          await clearAllMobileOfflineData();
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

  const applyAuth = useCallback((payload: { user: AuthUser; session: AuthSession }) => {
    setUser((previous) => {
      if (previous && previous.id !== payload.user.id) {
        clearAllQueryCache();
        resetPreloadSession();
        void clearAllMobileOfflineData();
      }
      return payload.user;
    });
    setAccessToken(payload.session.accessToken);
    void cacheStaffSessionForOffline({
      user: payload.user as unknown as Record<string, unknown>,
      accessToken: payload.session.accessToken,
    });
  }, []);

  const signup = useCallback(
    async (input: {
      companyName: string;
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }) => {
      const result = await api.signup(input);
      applyAuth(result);
    },
    [applyAuth],
  );

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const result = await api.login(input);
      applyAuth(result);
      return result;
    },
    [applyAuth],
  );

  const acceptInvite = useCallback(
    async (input: { token: string; firstName: string; lastName: string; password: string }) => {
      const result = await teamApi.acceptInvite(input);
      applyAuth(result);
      return result;
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    const scope = user
      ? {
          tenantId: user.companyId,
          actorId: user.id,
          actorKind: 'staff' as const,
          roleName: user.roleName,
        }
      : null;

    await api.logout();
    if (scope) {
      clearQueryCacheForScope(scope);
    }
    clearAllQueryCache();
    resetPreloadSession();
    await clearAllMobileOfflineData();
    setUser(null);
    setAccessToken(null);
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isLoading,
      isAuthenticated: Boolean(user && accessToken),
      signup,
      login,
      acceptInvite,
      logout,
    }),
    [user, accessToken, isLoading, signup, login, acceptInvite, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
