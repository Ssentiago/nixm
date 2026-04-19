import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api/api';

const BANNED_USERNAMES = [
  // Служебные и системные
  'admin',
  'administrator',
  'root',
  'system',
  'nixm',
  'official',
  'support',
  'moderator',
  'mod',
  'staff',
  'dev',
  'developer',
  'security',
  'bot',

  // Роли и владельцы
  'owner',
  'creator',
  'founder',
  'nixm_owner',
  'nixm_admin',
  'nixm_staff',
  'nixm_support',
  'nixm_official',
  'nixm_dev',
  'nixm_bot',

  // Технические эндпоинты (чтобы не путать роутинг)
  'api',
  'auth',
  'login',
  'signup',
  'register',
  'null',
  'undefined',
  'index',
  'home',
  'settings',
  'config',
  'profile',
  'user',
  'guest',

  // Попытки подделки статуса
  'verified',
  'check',
  'confirmed',
  'service',
];
const SIgnUp = () => {
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

    const formData = new FormData(e.currentTarget);
    const username = (formData.get('username') as string).trim();
    const password = (formData.get('password') as string).trim();
    const passwordAgain = (formData.get('password-again') as string).trim();

    if (!username.match(/^[A-Za-z0-9_-]{3,32}$/)) {
      return setError(
        'Username should contains only latin letters, digits, underscore and minus, and must be 3..32 length.',
      );
    }

    if (BANNED_USERNAMES.includes(username.toLowerCase())) {
      return setError('Username is not allowed.');
    }

    if (password !== passwordAgain) return setError("Passwords don't match");
    if (password.length < 8) return setError('Password too short');

    const regex =
      /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/;
    if (!password.match(regex)) {
      return setError('Password must be at least 8 characters long...');
    }

    setIsLoading(true); // Включаем лоадер только когда данные валидны
    try {
      // Ждем ответа от бэка
      await api.auth.register({ username, password });

      // Если мы здесь — регистрация в БД прошла успешно
      setIsRegistered(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className='flex flex-col min-h-screen'>
      {/* Большой заголовок */}
      <header className='w-full border-b border-border/50 text-center py-8'>
        <h1 className='text-5xl font-bold tracking-tighter'>Sign Up to Nixm</h1>
      </header>

      <main className='flex-1 flex flex-col items-center justify-center p-8'>
        <form
          onSubmit={handleSubmit}
          className='w-full max-w-md space-y-8' // ← шире и больше отступов
        >
          {error && (
            <div className='p-4 text-base text-red-600 bg-red-50 border border-red-200 rounded-xl'>
              {error}
            </div>
          )}

          {success && (
            <div className='p-4 text-base text-green-600 bg-green-50 border border-green-200 rounded-xl'>
              {success}
            </div>
          )}

          <div className='space-y-3'>
            <Label htmlFor='username' className='text-lg font-medium'>
              Username
            </Label>
            <Input
              id='username'
              name='username'
              placeholder='enter username'
              className='text-lg py-6' // ← крупнее
              required
              disabled={isLoading || !!success}
            />
          </div>

          <div className='space-y-3'>
            <Label htmlFor='password' className='text-lg font-medium'>
              Password
            </Label>
            <Input
              id='password'
              name='password'
              type='password'
              placeholder='enter password'
              className='text-lg py-6'
              autoComplete='new-password'
              required
              disabled={isLoading || !!success}
            />
          </div>

          <div className='space-y-3'>
            <Label htmlFor='password-again' className='text-lg font-medium'>
              Password again
            </Label>
            <Input
              id='password-again'
              name='password-again'
              type='password'
              placeholder='enter password'
              className='text-lg py-6'
              required
              disabled={isLoading || !!success}
            />
          </div>

          <Button
            type='submit'
            disabled={isLoading || !!success}
            className={`
    w-full py-7 rounded-2xl text-xl font-bold tracking-tight transition-all
    ${
      isLoading || !!success
        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' // Состояние при загрузке
        : 'bg-zinc-100 text-zinc-950 hover:bg-zinc-300 active:scale-[0.98]' // Активное состояние
    }
  `}
          >
            {isLoading ? 'Registering...' : 'Sign Up'}
          </Button>
        </form>
      </main>
    </div>
  );
};

export default SIgnUp;
