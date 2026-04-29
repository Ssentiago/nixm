import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/AuthContext';

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to='/dashboard' replace />;
  return <>{children}</>;
};

export default PublicRoute;
