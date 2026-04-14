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

  let refreshPromise: Promise<AccessToken> | null = null;

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    api.setToken(token);
    if (token) {
      ws.connect(() => token);
    } else {
      ws.disconnect();
    }
  }, [token]);
  const updateAccessToken = async () => {
    try {
      setIsLoading(true);
      if (!refreshPromise) {
        refreshPromise = api.auth.updateAccessToken();
      }

      const data = await refreshPromise;

      if (!data.access_token) {
        console.error('No access token');
        return;
      }

      tokenRef.current = data.access_token;
      setToken(data.access_token);
      return data.access_token;
    } catch (e) {
      setToken(null);
    } finally {
      setIsLoading(false);
      refreshPromise = null;
    }
  };

  useEffect(() => {
    (async () => {
      const me = await api.auth.me();
      setMe(me);
    })();
  }, [token]);

  useEffect(() => {
    updateAccessToken();
  }, []);

  const login = (token: string) => {
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
