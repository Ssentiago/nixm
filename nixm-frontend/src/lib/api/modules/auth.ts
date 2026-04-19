import { ApiClient } from '@/lib/api/definitions';

export interface AccessToken {
  access_token: string;
  expires_in: number;
}

export interface User {
  id: string;
  username: string;
  bio: string;
  avatar_url: string;
}

export class AuthModule {
  constructor(private api: ApiClient) {}

  async login(credentials: { username: string; password: string }) {
    const rawData = await this.api.request<{
      access_token: string;
      expires_in: string;
    }>('/auth/login', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(credentials),
    });

    return {
      access_token: rawData.access_token,
      expires_in: Number(rawData.expires_in),
    };
  }

  register(data: { username: string; password: string }) {
    return this.api.request('/auth/register', {
      method: 'POST',
      credentials: 'include',
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
    return this.api.request<User>('/auth/me');
  }

  updateAccessToken() {
    return this.api.request<AccessToken>('/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
  }
}
