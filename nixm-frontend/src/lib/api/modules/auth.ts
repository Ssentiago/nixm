import { ApiClient } from '@/lib/api/definitions';

interface AccessToken {
  access_token: string;
  expires_in: number;
}

export class AuthModule {
  constructor(private api: ApiClient) {}

  login(credentials: { email: string; password: string }) {
    return this.api.request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  register(data: { email: string; password: string; username: string }) {
    return this.api.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  logout() {
    return this.api.request('/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  }

  me() {
    // return this.api.request<User>('/auth/me');
  }

  updateAccessToken() {
    return this.api.request<AccessToken>('/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
  }
}
