export enum LogLevel {
  Info = 'INFO',
  Warn = 'WARN',
  Error = 'ERROR',
  Debug = 'DEBUG',
}

type LogMessage = string | Record<string, unknown>

class Logger {
  private format(level: LogLevel, msg: LogMessage): string {
    const timestamp = new Date().toISOString()
    const content = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)
    return `[${timestamp}] ${level}: ${content}`
  }

  info(msg: LogMessage): void {
    console.log(this.format(LogLevel.Info, msg))
  }

  warn(msg: LogMessage): void {
    console.warn(this.format(LogLevel.Warn, msg))
  }

  error(msg: LogMessage, err?: unknown): void {
    const detail = err instanceof Error ? err.message : err
    console.error(this.format(LogLevel.Error, `${msg}${detail ? ` - ${detail}` : ''}`))
  }

  debug(msg: LogMessage): void {
    console.debug(this.format(LogLevel.Debug, msg))
  }
}

export const logger = new Logger()
