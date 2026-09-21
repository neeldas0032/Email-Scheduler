type Level = 'info' | 'warn' | 'error';

function log(level: Level, scope: string, message: string, meta?: unknown) {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${scope}] ${message}`;
  if (meta !== undefined) console[level](line, meta);
  else console[level](line);
}

export const logger = {
  info: (scope: string, message: string, meta?: unknown) => log('info', scope, message, meta),
  warn: (scope: string, message: string, meta?: unknown) => log('warn', scope, message, meta),
  error: (scope: string, message: string, meta?: unknown) => log('error', scope, message, meta),
};
