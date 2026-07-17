import { logger } from "../../utils/logger";
import type { PostaliaCodigoPostalResponse } from "./types";

const DEFAULT_BASE_URL = "https://postalia.com.mx/api/codigos-postales";
const DEFAULT_TIMEOUT_MS = 10_000;

function postaliaBaseUrl(): string {
  return (process.env.POSTALIA_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function postaliaToken(): string {
  return (process.env.POSTALIA_API_TOKEN || "").trim();
}

function postaliaTimeoutMs(): number {
  const n = Number(process.env.POSTALIA_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

export function isPostaliaConfigured(): boolean {
  return !!postaliaToken();
}

export class PostaliaClient {
  private readonly cache = new Map<string, PostaliaCodigoPostalResponse>();

  async fetchCodigoPostal(cp: string): Promise<PostaliaCodigoPostalResponse> {
    const cpNorm = cp.trim();
    if (!/^\d{5}$/.test(cpNorm)) {
      throw new Error(`Código postal inválido: ${cpNorm}`);
    }

    const cached = this.cache.get(cpNorm);
    if (cached) return cached;

    const token = postaliaToken();
    if (!token) {
      throw new Error(
        "POSTALIA_API_TOKEN no configurado; no se puede enriquecer el domicilio automáticamente",
      );
    }

    const url = `${postaliaBaseUrl()}/${cpNorm}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), postaliaTimeoutMs());

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const snippet = await res.text().catch(() => "");
        throw new Error(
          `Postalia respondió ${res.status}${snippet ? `: ${snippet.slice(0, 200)}` : ""}`,
        );
      }

      const data = (await res.json()) as PostaliaCodigoPostalResponse;
      if (!data?.codigo_postal) {
        throw new Error(`Postalia no devolvió datos válidos para CP ${cpNorm}`);
      }

      this.cache.set(cpNorm, data);
      return data;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`Timeout al consultar Postalia para CP ${cpNorm}`);
      }
      logger.warn(`[Postalia] Error consultando CP ${cpNorm}: ${e instanceof Error ? e.message : e}`);
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
}
