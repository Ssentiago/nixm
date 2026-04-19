import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useRef,
  SetStateAction,
  Dispatch,
} from 'react';
import { api } from '@/lib/api/api';
import { ws } from '@/lib/websocket/service';
import { AccessToken, User } from '@/lib/api/modules/auth';

interface AuthContextType {
  token: string | null;
  setToken: Dispatch<SetStateAction<string | null>>;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  me: User | null;
  setMe: Dispatch<SetStateAction<User | null>>;
  myDeviceId: string | null;
  setMyDeviceId: Dispatch<SetStateAction<string | null>>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [me, setMe] = useState<null | User>(null);
  const tokenRef = useRef<string | null>(null);
  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);
  const myDeviceIdRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    myDeviceIdRef.current = myDeviceId;
    console.log(`Device id: ${myDeviceId}`);
  }, [myDeviceId]);
  const refreshPromiseRef = useRef<Promise<AccessToken> | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    myDeviceIdRef.current = myDeviceId;
  }, [myDeviceId]);

  useEffect(() => {
    api.setToken(token);
  }, [token]);

  useEffect(() => {
    if (token && myDeviceId) {
      ws.connect(
        () => tokenRef.current, // реф, всегда свежий
        () => myDeviceIdRef.current, // тоже реф
      );
    } else {
      ws.disconnect();
    }
  }, [token, myDeviceId]);
  const updateAccessToken = async () => {
    try {
      setIsLoading(true);
      if (!refreshPromiseRef.current) {
        refreshPromiseRef.current = api.auth.updateAccessToken();
      }

      const data = await refreshPromiseRef.current;

      if (!data.access_token) {
        console.error('No access token');
        return;
      }

      setToken(data.access_token);
      scheduleRefresh(data.expires_in);
      return data.access_token;
    } catch (e) {
      setToken(null);
    } finally {
      setIsLoading(false);
      refreshPromiseRef.current = null;
    }
  };

  useEffect(() => {
    if (!token) {
      setMe(null);
      return;
    }
    (async () => {
      try {
        const me = await api.auth.me();
        setMe(me);
      } catch {
        setMe(null);
      }
    })();
  }, [token]);

  const scheduleRefresh = (expiresIn: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const delay = (expiresIn - 5) * 1000; // за 5 сек до истечения
    if (delay <= 0) {
      updateAccessToken();
      return;
    }

    refreshTimerRef.current = setTimeout(() => {
      updateAccessToken();
    }, delay);
  };

  useEffect(() => {
    updateAccessToken();
  }, []);

  const login = (token: string) => {
    console.log('login called, token:', token);
    setToken(token);
  };

  const logout = async () => {
    setToken(null);
    await api.auth.logout();
    ws.disconnect();
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        setToken,
        login,
        logout,
        isAuthenticated: !!token,
        isLoading,
        me,
        setMe,
        myDeviceId,
        setMyDeviceId,
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
