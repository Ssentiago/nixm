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
import { AccessToken, User } from '@/lib/api/modules/auth';

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
      try {
        const me = await api.auth.me();
        setMyProfile(me);
      } catch {
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

      if (!refreshPromiseRef.current) {
        refreshPromiseRef.current = api.auth.updateAccessToken();
      }

      const data = await refreshPromiseRef.current;

      if (!data.access_token) {
        console.error('[Auth] No access token in response');
        return;
      }

      setToken(data.access_token);
      scheduleRefreshRef.current?.(data.expires_in);
    } catch {
      setToken(null);
    } finally {
      setIsLoading(false);
      refreshPromiseRef.current = null;
    }
  }, []);

  scheduleRefreshRef.current = (expiresIn: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const delay = (expiresIn - 5) * 1000;

    if (delay <= 0) {
      updateAccessToken();
      return;
    }

    refreshTimerRef.current = setTimeout(() => updateAccessToken(), delay);
  };

  useEffect(() => {
    updateAccessToken();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const login = (token: string) => setToken(token);

  const logout = async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setToken(null);
    await api.auth.logout();
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
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
