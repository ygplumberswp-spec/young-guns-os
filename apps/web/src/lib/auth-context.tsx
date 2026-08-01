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

/** Why the user is anonymous after bootstrap (drives login banner / redirect). */
export type SessionBootstrapState = 'loading' | 'authenticated' | 'missing' | 'expired' | 'unreachable';

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionBootstrap: SessionBootstrapState;
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
  }) => Promise<api.LoginResponse>;
  completeLoginMfa: (input: {
    mfaChallengeToken: string;
    code: string;
  }) => Promise<api.AuthPayload>;
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
  const [sessionBootstrap, setSessionBootstrap] = useState<SessionBootstrapState>('loading');

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        let restored: api.RestoreSessionResult = { status: 'missing' };
        try {
          restored = await api.restoreSession();
        } catch {
          restored = { status: 'unreachable' };
        }

        if (cancelled) {
          return;
        }

        if (restored.status === 'authenticated') {
          setUser(restored.payload.user);
          setAccessToken(restored.payload.session.accessToken);
          setSessionBootstrap('authenticated');
          await cacheStaffSessionForOffline({
            user: restored.payload.user as unknown as Record<string, unknown>,
            accessToken: restored.payload.session.accessToken,
          });
          return;
        }

        // Offline reopen: use short-lived cached access token if still valid.
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const cached = await readCachedStaffSession();
          if (cached) {
            setUser(cached.user as unknown as AuthUser);
            setAccessToken(cached.accessToken);
            setSessionBootstrap('authenticated');
            return;
          }
        } else if (restored.status === 'expired') {
          // Online refresh rejected an existing cookie — clear protected local data.
          await clearAllMobileOfflineData();
        }

        setUser(null);
        setAccessToken(null);
        setSessionBootstrap(restored.status);
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
    setSessionBootstrap('authenticated');
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
      if (api.isLoginMfaChallenge(result)) {
        return result;
      }
      applyAuth(result);
      return result;
    },
    [applyAuth],
  );

  const completeLoginMfa = useCallback(
    async (input: { mfaChallengeToken: string; code: string }) => {
      const result = await api.completeLoginMfa(input);
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
    setSessionBootstrap('missing');
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isLoading,
      isAuthenticated: Boolean(user && accessToken),
      sessionBootstrap,
      signup,
      login,
      completeLoginMfa,
      acceptInvite,
      logout,
    }),
    [user, accessToken, isLoading, sessionBootstrap, signup, login, completeLoginMfa, acceptInvite, logout],
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
