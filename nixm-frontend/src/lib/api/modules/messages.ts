import { ApiClient } from '@/lib/api/definitions';

export interface RemoteMessage {
  messageId: string;
  senderDeviceId: string;
  from: string;
  to: string;
  timestamp: number;
  iv: string;
  ciphertext: string;
}

interface HistoryResponse {
  messages: RemoteMessage[];
}

export class MessagesModule {
  constructor(private api: ApiClient) {}

  async getHistory(
    peerId: string,
    deviceId: string,
    before?: number,
    limit = 50,
  ): Promise<RemoteMessage[]> {
    const params = new URLSearchParams({
      device_id: deviceId,
      limit: String(limit),
      ...(before !== undefined && { before: String(before) }),
    });

    const response = await this.api.request<HistoryResponse>(
      `/messages/${peerId}?${params}`,
      { method: 'GET' },
    );

    return response.messages;
  }
}
