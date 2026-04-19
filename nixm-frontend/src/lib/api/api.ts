// lib/api/index.ts
import { AuthModule } from '@/lib/api/modules/auth';
import { ApiClient } from '@/lib/api/definitions';
import { KeysModule } from '@/lib/api/modules/keys';
import { InvitesModule } from '@/lib/api/modules/inviteLinks';
import { MessagesModule } from '@/lib/api/modules/messages';
import { UsersModule } from '@/lib/api/modules/users';

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: any,
    message?: string,
  ) {
    const detailedMessage =
      message || ApiError.extractMessage(data) || `HTTP ${status}`;
    super(detailedMessage);
    this.name = 'ApiError';
  }

  toString(): string {
    return this.message;
  }

  private static extractMessage(data: any): string | null {
    if (!data) return null;
    if (typeof data === 'string') return data;
    if (typeof data === 'object') {
      return data.message || data.error || JSON.stringify(data);
    }
    return null;
  }
}
class Api implements ApiClient {
  public auth: AuthModule;
  public keys: KeysModule;
  public invites: InvitesModule;
  public messages: MessagesModule;
  public users: UsersModule;

  private token: string | null = null;
  private readonly API_PREFIX = '/api';

  constructor() {
    this.auth = new AuthModule(this);
    this.keys = new KeysModule(this);
    this.invites = new InvitesModule(this);
    this.messages = new MessagesModule(this);
    this.users = new UsersModule(this);
  }

  setToken(token: string | null) {
    this.token = token;
  }

  async request<T>(path: string, options?: RequestInit): Promise<T> {
    // Собираем путь: '/api' + '/auth/login' = '/api/auth/login'
    let url;
    try {
      url = new URL(`${this.API_PREFIX}${path}`, 'http://localhost:5900');
    } catch (e) {
      throw new Error(`Invalid API path: ${path}`);
    }

    const headers = new Headers(options?.headers);
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    if (!(options?.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const text = await response.text();

      const errorPayload = { message: text };

      throw new ApiError(response.status, errorPayload);
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }
}

export const api = new Api();
