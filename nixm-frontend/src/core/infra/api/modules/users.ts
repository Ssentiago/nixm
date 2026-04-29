import { ApiClient } from '@/core/infra/api/definitions';

export interface User {
  id: string;
  username: string;
  bio?: string;
  avatar_url?: string;
}

export class UsersModule {
  constructor(private api: ApiClient) {}

  getUser(userId: string): Promise<User> {
    return this.api.request<User>(`/users/${userId}`, {
      method: 'GET',
    });
  }

  updateBio(bio: string): Promise<void> {
    return this.api.request<void>('/users/update_bio', {
      method: 'POST',
      body: JSON.stringify({ bio }),
    });
  }

  uploadAvatar(formData: FormData): Promise<{ avatar_url: string }> {
    return this.api.request<{ avatar_url: string }>('/users/upload_avatar', {
      method: 'POST',
      body: formData,
    });
  }

  me() {
    return this.api.request<User>('/users/me');
  }
}
