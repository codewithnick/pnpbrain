import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogContext = Record<string, unknown>;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLogLevel(): LogLevel {
  const raw = process.env['LOG_LEVEL']?.toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return process.env['NODE_ENV'] === 'production' ? 'info' : 'debug';
}

const activeLogLevel = resolveLogLevel();

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[activeLogLevel];
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(process.env['NODE_ENV'] === 'production' ? {} : { stack: value.stack }),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
        const shouldRedact = /authorization|cookie|token|secret|api[-_]?key/i.test(key);
        return [key, shouldRedact ? '[redacted]' : sanitizeValue(entryValue)];
      }),
    );
  }

  return value;
}

function writeLog(level: LogLevel, message: string, context: LogContext = {}): void {
  if (!shouldLog(level)) return;

  const sanitizedContext = sanitizeValue(context);
  const payload = {
    timestamp: new Date().toISOString(),
    service: 'pnpbrain-backend',
    level,
    message,
    ...(sanitizedContext && typeof sanitizedContext === 'object' ? sanitizedContext : {}),
  };

  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  debug(message: string, context?: LogContext) {
    writeLog('debug', message, context);
  },
  info(message: string, context?: LogContext) {
    writeLog('info', message, context);
  },
  warn(message: string, context?: LogContext) {
    writeLog('warn', message, context);
  },
  error(message: string, context?: LogContext) {
    writeLog('error', message, context);
  },
};

export function getRequestId(req: Request, res?: Response): string | undefined {
  const headerValue = req.header('x-request-id')?.trim();
  if (headerValue) return headerValue;

  const responseValue = res?.getHeader('x-request-id');
  return typeof responseValue === 'string' ? responseValue : undefined;
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = getRequestId(req, res) ?? randomUUID();
  const startedAt = process.hrtime.bigint();

  res.setHeader('x-request-id', requestId);

  logger.info('request_started', {
    requestId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  });

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const context = {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
    };

    if (res.statusCode >= 500) {
      logger.error('request_completed', context);
      return;
    }

    if (res.statusCode >= 400) {
      logger.warn('request_completed', context);
      return;
    }

    logger.info('request_completed', context);
  });

  next();
}
