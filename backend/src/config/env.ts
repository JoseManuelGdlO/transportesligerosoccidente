export type LogLevel = "error" | "warn" | "info" | "debug";

const LOG_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

function parseLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || "info").trim().toLowerCase();
  if (LOG_LEVELS.includes(raw as LogLevel)) return raw as LogLevel;
  console.warn(`[config] Invalid LOG_LEVEL "${raw}", falling back to info`);
  return "info";
}

const logLevelRank: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export function isLogLevelAtLeast(level: LogLevel): boolean {
  return logLevelRank[config.logLevel] >= logLevelRank[level];
}

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  logLevel: parseLogLevel(),
};
