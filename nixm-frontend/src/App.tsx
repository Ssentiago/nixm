import React from 'react';
import { AppProvider, useAppContext } from '@/hooks/AppContext';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from '@/pages/Landing';
import AppContainer from './components/AppContainer';
import SignIn from '@/pages/SignIn';
import { AuthProvider } from '@/hooks/AuthContext';
import SIgnUp from '@/pages/SignUp';
import ProtectedRoute from '@/components/routing/ProtectedRoute';
import PublicRoute from '@/components/routing/PublicRoute';
import Dashboard from '@/pages/Dashboard/Dashboard';
import KeysGuard from '@/components/routing/KeyGuard';
import { CryptoContextProvider } from '@/hooks/CryptoContext';
import { ChatContextProvider } from '@/hooks/ChatContext';
import { NotificationsProvider } from '@/hooks/NotificationContext';
const App = () => {
  return (
    <AppProvider>
      <AuthProvider>
        <AppContainer>
          <BrowserRouter>
            <Routes>
              <Route
                path='/'
                element={
                  <PublicRoute>
                    <Landing />
                  </PublicRoute>
                }
              />
              <Route
                path='/login'
                element={
                  <PublicRoute>
                    <SignIn />
                  </PublicRoute>
                }
              />
              <Route
                path='/register'
                element={
                  <PublicRoute>
                    <SIgnUp />
                  </PublicRoute>
                }
              />
              <Route
                path='/dashboard'
                element={
                  <ProtectedRoute>
                    <KeysGuard>
                      <CryptoContextProvider>
                        <NotificationsProvider>
                          <ChatContextProvider>
                            <Dashboard />
                          </ChatContextProvider>
                        </NotificationsProvider>
                      </CryptoContextProvider>
                    </KeysGuard>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </BrowserRouter>
        </AppContainer>
      </AuthProvider>
    </AppProvider>
  );
};

export default App;
