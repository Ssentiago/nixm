import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
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
  interceptor: (path: string, option: any) => Promise<Response>;
  user: User | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<null | User>(null);

  let refreshPromise: Promise<string | null> | null = null;
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

      setToken(data.access_token);
      return data.access_token;
    } catch (e) {
      setToken(null);
    } finally {
      setIsLoading(false);
      refreshPromise = null;
    }
  };

  const apiInterceptor = async (path: string, option: any) => {
    let response;

    response = await fetch(path, {
      ...option,
      headers: { ...option.headers, Authorization: `Bearer ${token}` },
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
      ...option,
      headers: { ...option.headers, Authorization: `Bearer ${access}` },
    });

    return response;
  };

  useEffect(() => {
    if (token) {
      const resp = apiInterceptor('/api/user/me', {
        method: 'GET',
      })
        .then(async resp => {
          const data = await resp.json();
          const user: User = data.user;
          setUser(user);
        })
        .catch(() => setUser(null));
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
