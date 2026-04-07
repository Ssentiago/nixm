import React from 'react';
import { AppProvider, useAppContext } from '@/hooks/AppContext';

const App = () => {
  return <AppProvider>Hello from NIXM</AppProvider>;
};

export default App;
