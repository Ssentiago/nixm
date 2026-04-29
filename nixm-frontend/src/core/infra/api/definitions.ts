export interface ApiClient {
  request<T>(path: string, options?: RequestInit): Promise<T>;
  setToken(token: string | null): void;
}
