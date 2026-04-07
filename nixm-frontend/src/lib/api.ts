import { useAuth } from '@/hooks/AuthContext';

export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {},
) => {
  const { token } = useAuth();

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
};
