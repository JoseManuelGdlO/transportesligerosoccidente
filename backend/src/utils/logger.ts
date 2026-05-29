import { isLogLevelAtLeast, type LogLevel } from "../config/env";

const SENSITIVE_KEY_PATTERN =
  /password|passwd|token|secret|authorization|api[_-]?key|refresh[_-]?token|access[_-]?token|credential/i;

const MAX_LOG_JSON_LENGTH = 2048;

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
} as const;

function useColor(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  return Boolean(process.stdout.isTTY);
}

function statusColor(status: number): string {
  if (status >= 500) return ANSI.red;
  if (status >= 400) return ANSI.yellow;
  if (status >= 300) return ANSI.cyan;
  return ANSI.green;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function truncateSerialized(value: string): string {
  if (value.length <= MAX_LOG_JSON_LENGTH) return value;
  return `${value.slice(0, MAX_LOG_JSON_LENGTH)}…[truncated]`;
}

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[max depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}…[truncated]` : value;
  }
  if (typeof value !== "object") return value;
  if (Buffer.isBuffer(value)) return "[buffer]";
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = "***";
    } else {
      result[key] = sanitizeForLog(entry, depth + 1);
    }
  }
  return result;
}

function formatPayload(value: unknown): string {
  try {
    const sanitized = sanitizeForLog(value);
    const serialized = JSON.stringify(sanitized);
    return truncateSerialized(serialized);
  } catch {
    return "[unserializable]";
  }
}

function log(level: LogLevel, message: string): void {
  if (!isLogLevelAtLeast(level)) return;
  switch (level) {
    case "error":
      console.error(message);
      break;
    case "warn":
      console.warn(message);
      break;
    default:
      console.log(message);
      break;
  }
}

export function formatRequestLine(
  timestamp: string,
  method: string,
  url: string,
  status: number,
  durationMs: number,
): string {
  const plain = `${timestamp} ${method} ${url} ${status} ${durationMs}ms`;
  if (!useColor()) return plain;

  const { reset, bold } = ANSI;
  const sc = statusColor(status);
  return `${timestamp} ${bold}${method}${reset} ${url} ${sc}${status}${reset} ${durationMs}ms`;
}

export const logger = {
  error(message: string): void {
    log("error", message);
  },
  warn(message: string): void {
    log("warn", message);
  },
  info(message: string): void {
    log("info", message);
  },
  debug(message: string): void {
    log("debug", message);
  },
  request(line: string): void {
    if (!isLogLevelAtLeast("info")) return;
    console.log(line);
  },
  formatPayload,
};
