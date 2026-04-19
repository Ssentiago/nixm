// lib/api/modules/keys.ts
import { PublicKeyRecord } from '@/models/publicKeysRecord';
import { ApiClient } from '../definitions';

export class KeysModule {
  constructor(private api: ApiClient) {}

  upload(publicKey: string, deviceId: string) {
    return this.api.request<void>('/keys/upload', {
      method: 'POST',
      headers: {
        'X-Device-ID': deviceId,
      },
      body: JSON.stringify({ public_key: publicKey }),
    });
  }

  keysFor(userId: string): Promise<PublicKeyRecord[]> {
    return this.api.request<PublicKeyRecord[]>(`/keys/${userId}`);
  }
}
