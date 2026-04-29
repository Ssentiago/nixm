import { LoggerConfig, LogLevelFilter } from './typing/definitions';

const CONFIG_KEY = 'nixm-logger-config';

const DEFAULT_CONFIG: LoggerConfig = {
  enabled: import.meta.env.DEV,
  level: import.meta.env.DEV ? 'debug' : 'warn',
};

export function getConfig(): LoggerConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (!stored) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function setConfig(config: Partial<LoggerConfig>): void {
  try {
    const current = getConfig();
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...current, ...config }));
  } catch {
    console.warn('[Logger] Failed to save config to localStorage');
  }
}

export function setLevel(level: LogLevelFilter): void {
  setConfig({ level });
}

export function setEnabled(enabled: boolean): void {
  setConfig({ enabled });
}
