export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogLevelFilter = 'none' | LogLevel;

export interface LogRecord {
  id?: number;
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export interface SessionRecord {
  id?: number;
  timestamp: string;
  session_start: true;
  system: SystemInfo;
}

export interface SystemInfo {
  userAgent: string;
  language: string;
  screen: string;
  viewport: string;
  timezone: string;
  online: boolean;
  cpuCores: number | string;
  memory: number | string;
  connection: string;
  performance: {
    heapUsed: number | string;
    heapTotal: number | string;
    loadTime: number;
  };
}

export interface LoggerConfig {
  enabled: boolean;
  level: LogLevelFilter;
}
