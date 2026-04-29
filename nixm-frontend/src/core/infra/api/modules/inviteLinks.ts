import { User } from '@/core/infra/api/modules/users';
import { ApiClient } from '../definitions';

export interface CreateInviteRequest {
  invite_type: 'one-time' | 'timed';
  expires_in?: number;
}

export interface InviteLinkRecord {
  id: number; // i64
  code: string; // UUID-код ссылки
  invite_type: 'one-time' | 'timed';
  expires_at: string | null; // ISO 8601 timestamp или null
  used: boolean;
  revoked: boolean;
  created_at: string; // ISO 8601 timestamp
}

export class InvitesModule {
  constructor(private api: ApiClient) {}

  create(req: CreateInviteRequest): Promise<InviteLinkRecord> {
    return this.api.request<InviteLinkRecord>('/invites', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  list(): Promise<InviteLinkRecord[]> {
    return this.api.request<InviteLinkRecord[]>('/invites');
  }

  revoke(id: number): Promise<void> {
    return this.api.request<void>(`/invites/${id}/revoke`, {
      method: 'POST',
    });
  }

  delete(id: number): Promise<void> {
    return this.api.request<void>(`/invites/${id}`, {
      method: 'DELETE',
    });
  }
  resolve(code: string): Promise<User> {
    return this.api.request<User>(`/invites/resolve/${code}`);
  }
}
