import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useRef,
  SetStateAction,
  Dispatch,
  useCallback,
} from 'react';
import { api } from '@/lib/api/api';
import { ws } from '@/lib/websocket/service';
import { AccessToken } from '@/lib/api/modules/auth';
import { logger } from '@/lib/logger';
import { User } from '@/lib/api/modules/users';

interface AuthContextType {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  myProfile: User | null;
  setMyProfile: Dispatch<SetStateAction<User | null>>;
}

const useProfile = (token: string | null) => {
  const [myProfile, setMyProfile] = useState<User | null>(null);

  useEffect(() => {
    if (!token) {
      setMyProfile(null);
      return;
    }

    (async () => {
      logger.debug('Auth: fetching user profile');
      try {
        const me = await api.users.me();
        logger.info('Auth: profile loaded', { username: me.username });
        setMyProfile(me);
      } catch (e) {
        logger.error('Auth: failed to load profile', { error: String(e) });
        setMyProfile(null);
      }
    })();
  }, [token]);

  return { myProfile, setMyProfile };
};

const useSession = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshPromiseRef = useRef<Promise<AccessToken> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefreshRef = useRef<(expiresIn: number) => void>();

  useEffect(() => {
    api.setToken(token);
  }, [token]);

  const updateAccessToken = useCallback(async () => {
    try {
      setIsLoading(true);
      logger.debug('Auth: starting token refresh');

      if (!refreshPromiseRef.current) {
        refreshPromiseRef.current = api.auth.updateAccessToken();
      }

      const data = await refreshPromiseRef.current;

      if (!data.access_token) {
        logger.error('Auth: no access token in refresh response');
        return;
      }

      logger.info('Auth: token successfully refreshed', {
        expiresIn: data.expires_in,
      });
      setToken(data.access_token);
      scheduleRefreshRef.current?.(data.expires_in);
    } catch (e) {
      logger.warn('Auth: session refresh failed or expired', {
        error: String(e),
      });
      setToken(null);
    } finally {
      setIsLoading(false);
      refreshPromiseRef.current = null;
    }
  }, []);

  scheduleRefreshRef.current = (expiresIn: number) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    const delay = (expiresIn - 5) * 1000;
    logger.debug('Auth: scheduling next refresh', { delayMs: delay });

    if (delay <= 0) {
      updateAccessToken();
      return;
    }

    refreshTimerRef.current = setTimeout(() => {
      logger.debug('Auth: refresh timer triggered');
      updateAccessToken();
    }, delay);
  };

  useEffect(() => {
    logger.debug('Auth: initial session check');
    updateAccessToken();

    return () => {
      if (refreshTimerRef.current) {
        logger.debug('Auth: cleaning up session timers');
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [updateAccessToken]);

  const login = (token: string) => {
    logger.info('Auth: user logged in manually');
    setToken(token);
  };

  const logout = async () => {
    logger.info('Auth: initiating logout');
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setToken(null);
    try {
      await api.auth.logout();
      logger.info('Auth: logout successful');
    } catch (e) {
      logger.error('Auth: logout request failed', { error: String(e) });
    }
  };

  return { token, isLoading, isAuthenticated: !!token, login, logout };
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { token, isLoading, isAuthenticated, logout, login } = useSession();
  const { myProfile, setMyProfile } = useProfile(token);

  return (
    <AuthContext.Provider
      value={{
        token,
        login,
        logout,
        isAuthenticated,
        isLoading,
        myProfile,
        setMyProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    const err = new Error('useAuth must be used within AuthProvider');
    logger.error('Auth: context usage error', { error: err.message });
    throw err;
  }
  return context;
};
