import { parseSicofiResponse } from "./parseResponse";
import { sicofiTimeoutMs } from "./config";
import { enhanceSicofiErrorMessage } from "./sicofiErrors";
import type { SicofiFactura40Request } from "./types";
import type { TimbradoResult } from "../types";

export { enhanceSicofiErrorMessage } from "./sicofiErrors";

export class SicofiHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(enhanceSicofiErrorMessage(message));
    this.name = "SicofiHttpError";
    this.status = status;
  }
}

export function isSicofiHttp401(e: unknown): boolean {
  return e instanceof SicofiHttpError && e.status === 401;
}

export async function sicofiPostFactura40(
  url: string,
  payload: SicofiFactura40Request,
  accessToken: string,
): Promise<TimbradoResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sicofiTimeoutMs());
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, application/xml, text/xml",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") ?? undefined;
    const body = await res.text();
    if (!res.ok) {
      let msg = `Sicofi respondió ${res.status}`;
      try {
        const j = JSON.parse(body) as Record<string, unknown>;
        if (typeof j.message === "string") msg = j.message;
        else if (typeof j.Mensaje === "string") msg = j.Mensaje;
        else if (typeof j.error === "string") msg = j.error;
        const errors = j.errors as Record<string, string[] | string> | undefined;
        if (errors && typeof errors === "object") {
          const parts = Object.entries(errors).flatMap(([k, v]) =>
            Array.isArray(v) ? v.map((e) => `${k}: ${e}`) : [`${k}: ${v}`],
          );
          if (parts.length) msg = `${msg} — ${parts.join("; ")}`;
        }
      } catch {
        if (body.trim()) msg = body.trim().slice(0, 500);
      }
      throw new SicofiHttpError(res.status, msg);
    }
    return parseSicofiResponse(body, contentType);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Timeout al conectar con Sicofi");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
