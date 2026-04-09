import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/AuthContext';
import { generateAndSaveKeys, getPublicData, hasKeys } from '@/lib/crypto';

const SignIn = () => {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { interceptor } = useAuth();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid username of password');
        } else if (response.status === 500) {
          throw new Error('Internal server error. Try again later');
        } else {
          throw new Error(`Error: ${response.status}`);
        }
      }

      console.log('Logged successfully');

      const { access_token } = await response.json();
      login(access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='flex flex-col min-h-screen'>
      <header className='w-full border-b border-border/50 text-center py-4'>
        <h1 className='text-2xl font-bold tracking-tighter'>Sign in to Nixm</h1>
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
