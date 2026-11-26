import { CONFIG } from '../config.js';

const SENSITIVE_KEY_PATTERN = /password|secret|token|authorization|cookie|otp|code|address|phone|key/i;
const IRAN_PHONE_PATTERN = /(?:\+?98|0098|0)9\d{9}/g;

function maskString(input: string): string {
  return input.replace(IRAN_PHONE_PATTERN, (match) => {
    if (match.length < 7) return '***';
    return `${match.slice(0, 4)}***${match.slice(-3)}`;
  });
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[TRUNCATED]';
  if (typeof value === 'string') return maskString(value);
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = sanitizeValue(val, depth + 1);
    }
  }
  return out;
}

type LogLevel = 'info' | 'warn' | 'error';

function emit(level: LogLevel, event: string, meta?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    service: 'ChikojA-api',
    event,
    ...(meta ? (sanitizeValue(meta) as Record<string, unknown>) : {}),
  };

  const line =
    CONFIG.NODE_ENV === 'production'
      ? JSON.stringify(payload)
      : `[${payload.ts}] [${level.toUpperCase()}] ${event}${meta ? ' ' + JSON.stringify(sanitizeValue(meta)) : ''}`;

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (event: string, meta?: Record<string, unknown>) => emit('info', event, meta),
  warn: (event: string, meta?: Record<string, unknown>) => emit('warn', event, meta),
  error: (event: string, meta?: Record<string, unknown>) => emit('error', event, meta),
};
