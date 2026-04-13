export interface PublicKeyRecord {
  device_id: string; // UUID
  public_key: string; // Base64 SPKI
}

export interface DeviceInfo {
  device_id: string;
  public_key: string;
  last_seen?: string; // ISO timestamp, опционально
  is_active?: boolean;
}
