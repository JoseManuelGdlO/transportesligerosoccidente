import type { Request, Response, NextFunction } from "express";
import { isLogLevelAtLeast } from "../config/env";
import { formatRequestLine, logger } from "../utils/logger";

function isMultipart(req: Request): boolean {
  const contentType = req.get("content-type") || "";
  return contentType.includes("multipart/form-data");
}

function hasQueryParams(query: Request["query"]): boolean {
  return Object.keys(query).length > 0;
}

function hasBody(body: unknown): boolean {
  if (body === null || body === undefined) return false;
  if (typeof body !== "object") return true;
  if (Array.isArray(body)) return body.length > 0;
  return Object.keys(body as Record<string, unknown>).length > 0;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const timestamp = new Date().toISOString();
    const base = formatRequestLine(timestamp, req.method, req.originalUrl, res.statusCode, durationMs);

    if (!isLogLevelAtLeast("debug")) {
      logger.request(base);
      return;
    }

    const parts: string[] = [base];

    if (hasQueryParams(req.query)) {
      parts.push(`query=${logger.formatPayload(req.query)}`);
    }

    if (isMultipart(req)) {
      parts.push("body=[multipart]");
    } else if (hasBody(req.body)) {
      parts.push(`body=${logger.formatPayload(req.body)}`);
    }

    logger.debug(parts.join(" "));
  });

  next();
}
