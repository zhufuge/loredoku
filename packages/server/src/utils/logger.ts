import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
