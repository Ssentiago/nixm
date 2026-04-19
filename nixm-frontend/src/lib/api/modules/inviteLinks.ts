import { User } from '@/lib/api/modules/auth';

export interface CreateInviteRequest {
  invite_type: 'one-time' | 'timed';
  expires_in?: number; // секунды, только для timed
}

// Ответ сервера (то, что получаем)
// Поля должны совпадать с Rust InviteLinkResponse
export interface InviteLinkRecord {
  id: number; // i64
  code: string; // UUID-код ссылки
  invite_type: 'one-time' | 'timed';
  expires_at: string | null; // ISO 8601 timestamp или null
  used: boolean;
  revoked: boolean;
  created_at: string; // ISO 8601 timestamp
}

// Вспомогательный тип для удобной работы с датой
export interface InviteLink extends InviteLinkRecord {
  // Можно добавить вычисляемые поля на фронте, если нужно
  // isExpired: boolean; // вычисляется по expires_at
}

// lib/api/modules/invites.ts
import { ApiClient } from '../definitions';

export class InvitesModule {
  constructor(private api: ApiClient) {}

  // Создать новую инвайт-ссылку
  create(req: CreateInviteRequest): Promise<InviteLinkRecord> {
    return this.api.request<InviteLinkRecord>('/invites', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  // Получить все ссылки текущего пользователя
  list(): Promise<InviteLinkRecord[]> {
    return this.api.request<InviteLinkRecord[]>('/invites');
  }

  // Отозвать ссылку (без удаления, флаг revoked = true)
  revoke(id: number): Promise<void> {
    return this.api.request<void>(`/invites/${id}/revoke`, {
      method: 'POST',
    });
  }

  // Полностью удалить ссылку из БД
  delete(id: number): Promise<void> {
    return this.api.request<void>(`/invites/${id}`, {
      method: 'DELETE',
    });
  }
  resolve(code: string): Promise<User> {
    return this.api.request<User>(`/invites/resolve/${code}`);
  }
}
