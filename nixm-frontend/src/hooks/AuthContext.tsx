import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';

interface AuthContextType {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // При старте пробуем получить access через refresh (кука отправится автоматически)
  useEffect(() => {
    fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include', // отправляет куки
    })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('no session');
      })
      .then(data => setToken(data.access_token))
      .catch(() => setToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = (newToken: string) => {
    setToken(newToken);
  };

  const logout = () => {
    setToken(null);
    // опционально: POST /api/auth/logout чтобы отозвать refresh в БД
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        login,
        logout,
        isAuthenticated: !!token,
        isLoading,
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
