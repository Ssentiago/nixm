// lib/api/index.ts
import { AuthModule } from '@/lib/api/modules/auth';
import { ApiClient } from '@/lib/api/definitions';
import { KeysModule } from '@/lib/api/modules/Keys';
import { InvitesModule } from '@/lib/api/modules/inviteLinks';

class Api implements ApiClient {
  public auth: AuthModule;
  public keys: KeysModule;
  public invites: InvitesModule;

  private token: string | null = null;
  private readonly API_PREFIX = '/api';

  constructor() {
    this.auth = new AuthModule(this);
    this.keys = new KeysModule(this);
    this.invites = new InvitesModule(this);
  }

  setToken(token: string | null) {
    this.token = token;
  }

  async request<T>(path: string, options?: RequestInit): Promise<T> {
    // Собираем путь: '/api' + '/auth/login' = '/api/auth/login'
    let url;
    try {
      url = new URL(`${this.API_PREFIX}${path}`, window.location.origin);
    } catch (e) {
      throw new Error(`Invalid API path: ${path}`);
    }

    const headers = new Headers(options?.headers);
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API ${response.status}: ${text}`);
    }

    // Пустой ответ (204)
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }
}

export const api = new Api();
