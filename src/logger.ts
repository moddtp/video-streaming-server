import pino, { type LoggerOptions } from 'pino';
import { config } from './config';

/** Shared pino options, reused for both the standalone logger and Fastify's. */
export const loggerOptions: LoggerOptions = {
  level: config.logLevel,
  transport: config.logPretty
    ? {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      }
    : undefined,
};

/** Standalone logger for non-request logging (startup, ffmpeg, sessions). */
export const logger = pino(loggerOptions);

export type Logger = typeof logger;
