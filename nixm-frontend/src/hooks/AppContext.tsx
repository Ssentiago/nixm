import { createContext, useContext, useState } from 'react';

interface AppContextType {}

const AppContextProvider = createContext<AppContextType | null>(null);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <AppContextProvider.Provider value={{}}>
      {children}
    </AppContextProvider.Provider>
  );
};

export const useAppContext = () => {
  const ctx = useContext(AppContextProvider);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
};
