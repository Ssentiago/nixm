import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/AuthContext';
import { api, ApiError } from '@/core/infra/api/api';
import { logger } from '@/core/services/logger';

const SignIn = () => {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries()) as {
      username: string;
      password: string;
    };

    logger.debug('SignIn: login attempt started', { username: data.username });

    try {
      const resp = await api.auth.login(data);

      logger.info('SignIn: authentication successful', {
        username: data.username,
      });
      login(resp.access_token);
    } catch (err) {
      if (err instanceof ApiError) {
        logger.warn('SignIn: authentication rejected', {
          username: data.username,
          status: err.status,
          message: err.toString(),
        });
        setError(err.toString());
      } else {
        logger.error('SignIn: unexpected login error', {
          username: data.username,
          error: String(err),
        });
        setError('An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='flex flex-col min-h-screen'>
      <header className='w-full border-b border-border/50 py-4 text-center'>
        <Link to='/' className='text-xl font-bold tracking-tighter'>
          Nixm
        </Link>
        <h1 className='text-xl font-semibold'>Sign In</h1>
      </header>
      <main className='flex-1 flex flex-col items-center justify-center p-4'>
        <form onSubmit={handleSubmit} className='w-full max-w-sm space-y-4'>
          {error && (
            <div className='p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md'>
              {error}
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='username'>Username</Label>
            <Input
              id='username'
              name='username'
              placeholder='enter username'
              required
              disabled={isLoading}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='password'>Password</Label>
            <Input
              id='password'
              name='password'
              type='password'
              placeholder='enter password'
              required
              disabled={isLoading}
            />
          </div>

          <Button type='submit' className='w-full' disabled={isLoading}>
            {isLoading ? 'Logging...' : 'Sign In'}
          </Button>
        </form>
      </main>
    </div>
  );
};

export default SignIn;
