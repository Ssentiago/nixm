import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/AuthContext';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to='/login' replace />;
  return <>{children}</>;
};

export default ProtectedRoute;
