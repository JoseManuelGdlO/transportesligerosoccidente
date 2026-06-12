import { parseSicofiResponse } from "./parseResponse";
import { sicofiTimeoutMs } from "./config";
import type { SicofiFactura40Request } from "./types";
import type { TimbradoResult } from "../types";

export async function sicofiPostFactura40(url: string, payload: SicofiFactura40Request): Promise<TimbradoResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sicofiTimeoutMs());
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, application/xml, text/xml" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") ?? undefined;
    const body = await res.text();
    if (!res.ok) {
      let msg = `Sicofi respondió ${res.status}`;
      try {
        const j = JSON.parse(body) as Record<string, unknown>;
        if (typeof j.Mensaje === "string") msg = j.Mensaje;
        else if (typeof j.error === "string") msg = j.error;
        else if (typeof j.message === "string") msg = j.message;
      } catch {
        if (body.trim()) msg = body.trim().slice(0, 500);
      }
      throw new Error(msg);
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
