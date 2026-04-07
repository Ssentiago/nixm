import React from 'react';
import { AppProvider, useAppContext } from '@/hooks/AppContext';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from '@/pages/Landing';
import AppContainer from './components/AppContainer';
import Login from '@/pages/Login';
import { AuthProvider } from '@/hooks/AuthContext';
import Register from '@/pages/Register';
import ProtectedRoute from '@/components/routing/ProtectedRoute';
import PublicRoute from '@/components/routing/PublicRoute';
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
                    <Login />
                  </PublicRoute>
                }
              />
              <Route
                path='/register'
                element={
                  <PublicRoute>
                    <Register />
                  </PublicRoute>
                }
              />
              <Route
                path='/dashboard'
                element={
                  <ProtectedRoute>
                    <></>
                  </ProtectedRoute>
                }
              />
            </Routes>{' '}
          </BrowserRouter>
        </AppContainer>
      </AuthProvider>
    </AppProvider>
  );
};

export default App;
