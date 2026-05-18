import type { FuelDownloadParams, FuelProviderCredentials, FuelReportProvider } from "./types";

const DEFAULT_TIMEOUT_MS = Number(process.env.FUEL_PROVIDER_TIMEOUT_MS || 120_000);

export class HttpFuelProvider implements FuelReportProvider {
  constructor(private readonly creds: FuelProviderCredentials) {}

  async downloadReport(params: FuelDownloadParams): Promise<Buffer> {
    const method = this.creds.method ?? (process.env.FUEL_PROVIDER_METHOD === "POST" ? "POST" : "GET");
    const headers: Record<string, string> = {
      Accept:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,*/*",
    };

    if (this.creds.usuario && this.creds.password) {
      const token = Buffer.from(`${this.creds.usuario}:${this.creds.password}`).toString("base64");
      headers.Authorization = `Basic ${token}`;
    }

    const bearer = process.env.FUEL_PROVIDER_BEARER;
    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    let url = this.creds.url;
    let init: RequestInit = { method, headers, signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) };

    if (method === "GET") {
      const u = new URL(url);
      const inicioKey = process.env.FUEL_PROVIDER_QUERY_INICIO || "inicio";
      const finKey = process.env.FUEL_PROVIDER_QUERY_FIN || "fin";
      u.searchParams.set(inicioKey, params.inicio);
      u.searchParams.set(finKey, params.fin);
      url = u.toString();
    } else {
      headers["Content-Type"] = "application/json";
      init = {
        ...init,
        body: JSON.stringify({ inicio: params.inicio, fin: params.fin }),
      };
    }

    const res = await fetch(url, init);
    if (!res.ok) {
      const snippet = await res.text().catch(() => "");
      throw new Error(
        `Proveedor de combustible respondió ${res.status} ${res.statusText}${snippet ? `: ${snippet.slice(0, 200)}` : ""}`,
      );
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32) {
      throw new Error("El archivo descargado del proveedor está vacío o es inválido");
    }
    return buf;
  }
}
