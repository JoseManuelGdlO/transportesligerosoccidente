import { num } from "../../../utils/numbers";
import type { TimbradoContext } from "../types";

/** Validaciones adicionales para timbrado Sicofi Factura40. */
export function validateSicofiFactura40(ctx: TimbradoContext): string[] {
  const issues: string[] = [];
  const { tipo, trip, tenant, ubicaciones, mercancias, truck, driver, client } = ctx;

  const isSicofi = (tenant.pac_proveedor || "").toLowerCase() === "sicofi";
  if (isSicofi && !tenant.pac_usuario) issues.push("PAC: falta usuario Sicofi");
  if (isSicofi && !tenant.pac_token_enc) issues.push("PAC: falta contraseña Sicofi");

  if (!client.regimen_fiscal) issues.push("Cliente: falta régimen fiscal");
  if (!client.cp) issues.push("Cliente: falta código postal fiscal");

  if (tipo === "ingreso") {
    if (num(trip.tarifa) <= 0) issues.push("Viaje: la tarifa debe ser mayor a 0 para factura de ingreso");
  }

  for (const u of ubicaciones) {
    const label = u.orden === 1 ? "origen" : u.orden === ubicaciones.length ? "destino final" : `parada ${u.orden}`;
    if (!u.colonia_clave && !u.colonia) {
      issues.push(`Ubicación ${label}: falta colonia o clave SAT de colonia`);
    }
    if (!u.municipio_clave && !u.municipio) {
      issues.push(`Ubicación ${label}: falta municipio o clave SAT de municipio`);
    }
  }

  for (const m of mercancias) {
    if (!m.clave_prod_serv) issues.push(`Mercancía "${m.descripcion}": falta clave bienes transportados`);
    if (!m.unidad) issues.push(`Mercancía "${m.descripcion}": falta unidad`);
    if (!m.peso_kg || num(m.peso_kg) <= 0) {
      issues.push(`Mercancía "${m.descripcion}": falta peso en kg`);
    }
  }

  if (!truck?.config_vehicular) issues.push("Camión: falta configuración vehicular SAT");
  if (!truck?.perm_sct) issues.push("Camión: falta permiso SCT");
  if (!driver?.rfc) issues.push("Operador: falta RFC");
  if (!driver?.licencia_federal && !driver?.licencia) {
    issues.push("Operador: falta licencia federal");
  }

  return issues;
}
