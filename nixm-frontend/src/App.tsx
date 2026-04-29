import { AppProvider } from '@/hooks/AppContext';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Landing from '@/pages/Landing';
import AppContainer from './components/AppContainer';
import SignIn from '@/pages/SignIn';
import { AuthProvider } from '@/hooks/AuthContext';
import SignUp from '@/pages/SignUp';
import ProtectedRoute from '@/components/routing/ProtectedRoute';
import PublicRoute from '@/components/routing/PublicRoute';
import Dashboard from '@/pages/Dashboard/Dashboard';
import { CryptoContextProvider } from '@/hooks/CryptoContext';
import { ChatContextProvider } from '@/hooks/ChatContext';
import { NotificationsProvider } from '@/hooks/NotificationContext';
import { AppInitializer } from '@/components/routing/AppInitializer';

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
                    <SignUp />
                  </PublicRoute>
                }
              />
              <Route
                path='/dashboard'
                element={
                  <ProtectedRoute>
                    <CryptoContextProvider>
                      <AppInitializer>
                        <NotificationsProvider>
                          <ChatContextProvider>
                            <Dashboard />
                          </ChatContextProvider>
                        </NotificationsProvider>
                      </AppInitializer>
                    </CryptoContextProvider>
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
