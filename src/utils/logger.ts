const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;

const currentLevel = (process.env.LOG_LEVEL as keyof typeof LOG_LEVELS) || 'info';

function log(level: keyof typeof LOG_LEVELS, ...args: unknown[]) {
  if (LOG_LEVELS[level] <= LOG_LEVELS[currentLevel]) {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`[${timestamp}] [${level.toUpperCase()}]`, ...args);
  }
}

export const logger = {
  error: (...args: unknown[]) => log('error', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  debug: (...args: unknown[]) => log('debug', ...args),
};
