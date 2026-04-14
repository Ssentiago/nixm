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
import * as wasi from 'node:wasi';

interface User {
  id: string;
  username: string;
}

interface AuthContextType {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  interceptor: (path: string, option?: RequestInit) => Promise<Response>;
  user: User | null;
  myDeviceId: string | null;
  setMyDeviceId: Dispatch<SetStateAction<string | null>>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<null | User>(null);
  const tokenRef = useRef<string | null>(null);
  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);

  let refreshPromise: Promise<string | null> | null = null;

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  const updateAccessToken = async () => {
    try {
      setIsLoading(true);
      const resp = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include', // отправляет куки
      });

      if (!resp.ok) {
        throw new Error('No available session found');
      }

      const data = await resp.json();

      tokenRef.current = data.access_token; // сразу обновляем ref
      setToken(data.access_token);
      return data.access_token;
    } catch (e) {
      setToken(null);
    } finally {
      setIsLoading(false);
      refreshPromise = null;
    }
  };

  const apiInterceptor = async (path: string, option?: RequestInit) => {
    let response;
    const opts = option ?? {};

    response = await fetch(path, {
      ...opts,
      headers: {
        ...(opts.headers ?? {}),
        Authorization: `Bearer ${tokenRef.current}`,
      },
    });

    if (response.status !== 401) {
      return response;
    }

    if (!refreshPromise) {
      refreshPromise = updateAccessToken();
    }

    const access = await refreshPromise;

    if (!access) {
      return response;
    }

    response = await fetch(path, {
      ...opts,
      headers: {
        ...(opts.headers ?? {}),
        Authorization: `Bearer ${access}`,
      },
    });

    return response;
  };

  useEffect(() => {
    console.log('got token: ', token);
    if (token) {
      const resp = apiInterceptor('/api/auth/me', {
        method: 'GET',
      })
        .then(async resp => {
          const data = await resp.json();
          const user: User = data.user;
          setUser(user);
        })
        .catch(e => {
          setUser(null);
        });
    } else {
      setUser(null);
    }
  }, [token]);

  useEffect(() => {
    updateAccessToken();
  }, []);

  const login = (newToken: string) => {
    setToken(newToken);
  };

  const logout = async () => {
    setToken(null);
    await apiInterceptor('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        login,
        logout,
        isAuthenticated: !!token,
        isLoading,
        interceptor: apiInterceptor,
        user,
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
