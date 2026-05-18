import type { Tenant } from "../../models/Tenant";
import { decryptSecret } from "../../utils/fiscalCrypto";
import { FileFuelProvider } from "./fileFuelProvider";
import { HttpFuelProvider } from "./httpFuelProvider";
import type { FuelProviderCredentials, FuelReportProvider } from "./types";

export type { FuelDownloadParams, FuelReportProvider } from "./types";

export function resolveFuelCredentials(tenant: Tenant): FuelProviderCredentials | null {
  const filePath = process.env.FUEL_SYNC_FILE_PATH?.trim();
  if (filePath) {
    return { url: filePath, method: "GET" };
  }

  const url = (tenant.fuel_proveedor_url || process.env.FUEL_PROVIDER_URL || "").trim();
  if (!url) return null;

  const usuario = tenant.fuel_proveedor_usuario || process.env.FUEL_PROVIDER_USER || null;
  let password: string | null = null;
  if (tenant.fuel_proveedor_password_enc) {
    password = decryptSecret(tenant.fuel_proveedor_password_enc);
  } else if (process.env.FUEL_PROVIDER_PASSWORD) {
    password = process.env.FUEL_PROVIDER_PASSWORD;
  }

  return {
    url,
    usuario,
    password,
    method: process.env.FUEL_PROVIDER_METHOD === "POST" ? "POST" : "GET",
  };
}

export function tenantFuelSyncEnabled(tenant: Tenant): boolean {
  if (tenant.fuel_sync_habilitado) return true;
  if (process.env.FUEL_SYNC_ENABLED === "true" && resolveFuelCredentials(tenant)) return true;
  return false;
}

export function createFuelProvider(creds: FuelProviderCredentials): FuelReportProvider {
  const filePath = process.env.FUEL_SYNC_FILE_PATH?.trim();
  if (filePath) return new FileFuelProvider(filePath);
  return new HttpFuelProvider(creds);
}
