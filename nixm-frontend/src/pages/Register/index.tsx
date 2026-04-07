import { useState, useEffect } from 'react'; // 1. Добавили useEffect
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const Register = () => {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    if (isRegistered) {
      setSuccess('Registration successful! Redirecting...');
      const timer = setTimeout(() => navigate('/', { replace: true }), 1500);
      return () => clearTimeout(timer);
    }
  }, [isRegistered, navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('Username taken');
        } else if (response.status === 500) {
          throw new Error('Internal server error. Try again later');
        } else {
          throw new Error(`Error: ${response.status}`);
        }
      }

      setIsRegistered(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='flex flex-col min-h-screen'>
      <header className='w-full border-b border-border/50 text-center py-4'>
        <h1 className='text-2xl font-bold tracking-tighter'>Sign Up to Nixm</h1>
      </header>

      <main className='flex-1 flex flex-col items-center justify-center p-4'>
        <form onSubmit={handleSubmit} className='w-full max-w-sm space-y-4'>
          {error && (
            <div className='p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md'>
              {error}
            </div>
          )}

          {success && (
            <div className='p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-md'>
              {success}
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='username'>Username</Label>
            <Input
              id='username'
              name='username'
              placeholder='enter username'
              required
              disabled={isLoading || !!success}
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
              disabled={isLoading || !!success}
            />
          </div>

          <Button
            type='submit'
            className='w-full'
            disabled={isLoading || !!success}
          >
            {isLoading ? 'Registering...' : 'Sign Up'}
          </Button>
        </form>
      </main>
    </div>
  );
};

export default Register;
