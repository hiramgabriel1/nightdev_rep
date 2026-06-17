const levels = { info: 'INFO', warn: 'WARN', error: 'ERROR', debug: 'DEBUG' }

function format(level: string, msg: string) {
  return `[${new Date().toISOString()}] ${level}: ${msg}`
}

export const logger = {
  info: (msg: string) => console.log(format(levels.info, msg)),
  warn: (msg: string) => console.warn(format(levels.warn, msg)),
  error: (msg: string, err?: unknown) => console.error(format(levels.error, `${msg}${err ? ` - ${err}` : ''}`)),
  debug: (msg: string) => console.debug(format(levels.debug, msg)),
}
