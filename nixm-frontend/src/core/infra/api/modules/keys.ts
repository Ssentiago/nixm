import { ApiClient } from '../definitions';

export interface PublicKeyRecord {
  device_id: string; // UUID
  public_key: string; // Base64 SPKI
}

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
