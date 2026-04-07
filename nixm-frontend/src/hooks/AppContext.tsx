import { createContext, useContext, useState } from 'react';

type Page = 'auth' | 'app' | 'landing';

interface AppContextType {
  page: Page;
  setPage: (page: Page) => void;
}

const AppContextProvider = createContext<AppContextType | null>(null);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [page, setPage] = useState<Page>('landing');

  return (
    <AppContextProvider.Provider value={{ page, setPage }}>
      {children}
    </AppContextProvider.Provider>
  );
};

export const useAppContext = () => {
  const ctx = useContext(AppContextProvider);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
};
