import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthSession, AuthUser, StaffSessionUxState } from '@titan/shared';
import * as api from './api-client';
import * as teamApi from './team-api';
import { clearAllQueryCache, clearQueryCacheForScope } from './query-cache';
import { resetPreloadSession } from './preload-coordinator';
import {
  cacheStaffSessionForOffline,
  clearAllMobileOfflineData,
  readCachedStaffSession,
} from './mobile-offline-queue';
import {
  decodeAccessTokenExpiryMs,
  publishStaffSessionEvent,
  subscribeStaffSessionEvents,
} from './session-sync';
import { SESSION_EXPIRY_WARNING_MS } from '@titan/shared';

/** Why the user is anonymous after bootstrap (drives login banner / redirect). */
export type SessionBootstrapState = 'loading' | 'authenticated' | 'missing' | 'expired' | 'unreachable';

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionBootstrap: SessionBootstrapState;
  sessionUxState: StaffSessionUxState | null;
  dismissSessionUxState: () => void;
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
  const [sessionUxState, setSessionUxState] = useState<StaffSessionUxState | null>('restoring');

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setSessionUxState('restoring');
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
          setSessionUxState('restored');
          publishStaffSessionEvent({
            type: 'login',
            accessToken: restored.payload.session.accessToken,
            expiresIn: restored.payload.session.expiresIn,
          });
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
            setSessionUxState('restored');
            return;
          }
        } else if (restored.status === 'expired') {
          // Online refresh rejected an existing cookie — clear protected local data.
          await clearAllMobileOfflineData();
          setSessionUxState('sign_in_again');
        } else if (restored.status === 'unreachable') {
          setSessionUxState('connection_lost');
        } else {
          setSessionUxState(null);
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

  useEffect(() => {
    return subscribeStaffSessionEvents((event) => {
      if (event.type === 'logout' || event.type === 'session_expired') {
        setUser(null);
        setAccessToken(null);
        setSessionBootstrap('expired');
        setSessionUxState('sign_in_again');
        return;
      }

      if (event.type === 'refresh' || event.type === 'login') {
        setAccessToken(event.accessToken);
        setSessionBootstrap('authenticated');
        setSessionUxState('restored');
      }
    });
  }, []);

  useEffect(() => {
    function handleOnline() {
      setSessionUxState((current) => (current === 'connection_lost' ? 'reconnecting' : current));
    }

    function handleOffline() {
      setSessionUxState('connection_lost');
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const expiryMs = decodeAccessTokenExpiryMs(accessToken);
    if (!expiryMs) {
      return;
    }

    const warnAt = expiryMs - SESSION_EXPIRY_WARNING_MS;
    const delay = warnAt - Date.now();
    if (delay <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSessionUxState((current) => (current === 'restored' ? 'expiring_soon' : current));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [accessToken]);

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
    setSessionUxState('restored');
    publishStaffSessionEvent({
      type: 'login',
      accessToken: payload.session.accessToken,
      expiresIn: payload.session.expiresIn,
    });
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
    publishStaffSessionEvent({ type: 'logout' });
    if (scope) {
      clearQueryCacheForScope(scope);
    }
    clearAllQueryCache();
    resetPreloadSession();
    await clearAllMobileOfflineData();
    setUser(null);
    setAccessToken(null);
    setSessionBootstrap('missing');
    setSessionUxState(null);
  }, [user]);

  const dismissSessionUxState = useCallback(() => {
    setSessionUxState(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isLoading,
      isAuthenticated: Boolean(user && accessToken),
      sessionBootstrap,
      sessionUxState,
      dismissSessionUxState,
      signup,
      login,
      completeLoginMfa,
      acceptInvite,
      logout,
    }),
    [user, accessToken, isLoading, sessionBootstrap, sessionUxState, dismissSessionUxState, signup, login, completeLoginMfa, acceptInvite, logout],
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
