import { getConfig, setEnabled, setLevel } from './config';
import { logsDB } from './db';
import {
  LogLevel,
  LogLevelFilter,
  LogRecord,
  SystemInfo,
} from './typing/definitions';

const LEVELS: LogLevelFilter[] = ['none', 'debug', 'info', 'warn', 'error'];

const CONSOLE_METHODS: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

class Logger {
  constructor() {
    this.writeSessionInfo();
  }

  setLevel(level: LogLevelFilter): void {
    setLevel(level);
  }
  setEnabled(enabled: boolean): void {
    setEnabled(enabled);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  async exportLogs(): Promise<string> {
    const [logs, sessions] = await Promise.all([
      logsDB.logs.getAll(),
      logsDB.sessions.getAll(),
    ]);

    if (logs.length === 0 && sessions.length === 0) return '';

    let result = '=== SESSION INFO ===\n';
    sessions.forEach(s => {
      result += JSON.stringify(s, null, 2) + '\n\n';
    });

    result += '\n=== LOGS ===\n';
    logs.forEach(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const ctx = log.context ?? {};
      const location = ctx.fileName
        ? `${ctx.fileName}:${ctx.lineNumber}${ctx.functionName ? ` (${String(ctx.functionName)})` : ''}`
        : 'unknown';

      result += `[${time}] ${log.level.toUpperCase().padEnd(5)} | ${location}\n`;
      result += `  ${log.message}\n`;

      const extra = { ...ctx };
      delete extra.fileName;
      delete extra.lineNumber;
      delete extra.columnNumber;
      delete extra.functionName;

      if (Object.keys(extra).length > 0) {
        result += `  Context: ${JSON.stringify(extra)}\n`;
      }
      result += '\n';
    });

    return result;
  }

  async sendLogsToServer(): Promise<void> {
    // TODO: отправка логов на сервер для удалённой диагностики
  }

  async getStats() {
    const [entries, sessions] = await Promise.all([
      logsDB.logs.count(),
      logsDB.sessions.getAll().then(s => s.length),
    ]);
    return { entries, sessions };
  }

  async clear(): Promise<void> {
    await Promise.all([logsDB.logs.clear(), logsDB.sessions.clear()]);
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const config = getConfig();
    if (!config.enabled) return;
    if (!this.shouldLog(level, config.level)) return;

    const entry: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    if (import.meta.env.DEV) {
      const ctx = context ?? {};
      const location = ctx.fileName ? `${ctx.fileName}:${ctx.lineNumber}` : '';
      console[CONSOLE_METHODS[level]](
        `[${level.toUpperCase()}] ${location ? `(${location}) ` : ''}${message}`,
        Object.keys(ctx).length ? ctx : '',
      );
    }

    logsDB.logs.save(entry);
  }

  private shouldLog(
    messageLevel: LogLevel,
    configLevel: LogLevelFilter,
  ): boolean {
    if (configLevel === 'none') return false;
    return LEVELS.indexOf(messageLevel) >= LEVELS.indexOf(configLevel);
  }

  private getSystemInfo(): SystemInfo {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      screen: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      online: navigator.onLine,
      cpuCores: navigator.hardwareConcurrency ?? 'unknown',
      memory: (navigator as any).deviceMemory ?? 'unknown',
      connection: (navigator as any).connection?.effectiveType ?? 'unknown',
      performance: {
        heapUsed: (performance as any).memory?.usedJSHeapSize ?? 'unknown',
        heapTotal: (performance as any).memory?.totalJSHeapSize ?? 'unknown',
        loadTime: performance.now(),
      },
    };
  }

  private writeSessionInfo(): void {
    const config = getConfig();
    if (!config.enabled) return;
    logsDB.sessions.save({
      timestamp: new Date().toISOString(),
      session_start: true,
      system: this.getSystemInfo(),
    });
  }
}

export const logger = new Logger();
