import { ApiClient } from '@/lib/api/definitions';

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
    return this.api.request<{ avatar_url: string }>('/users/upload', {
      method: 'POST',
      body: formData,
      // Content-Type не ставим — браузер сам выставит multipart с boundary
    });
  }

  me() {
    return this.api.request<User>('/auth/me');
  }
}
