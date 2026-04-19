// KEYS STORE
export interface KeyRecord {
  id: string;
  privateKey: string;
  publicKey: string;
  deviceId: string;
}

export type PublicKeyData = Omit<KeyRecord, 'privateKey'>;

// MESSAGES STORE
export type MessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export interface StoredMessage {
  messageId: string;
  from: string;
  to: string;
  peerId: string;
  direction: 'sent' | 'received';
  ciphertext: string;
  iv: string;
  timestamp: number;
  status: MessageStatus;
  system?: boolean;
}
