import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from '@/hooks/AppContext';
import './index.css';
import { TooltipProvider } from '@/components/ui/tooltip';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </TooltipProvider>
  </StrictMode>,
);
