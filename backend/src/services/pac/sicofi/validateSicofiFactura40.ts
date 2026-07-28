import { num } from "../../../utils/numbers";
import { satRfcIssue } from "../../../utils/rfcSat";
import { bienesTranspCpIssue, configVehicularIssue, permSctIssue } from "../../../utils/cartaPorteSat";
import type { TimbradoContext } from "../types";
import { isPublicoGeneralReceptor } from "./publicoGeneral";
import { normalizeFiscalUbicaciones } from "../../tripFiscalService";
import { hasLocalidadesForEstado } from "../../satUbicacionCatalogService";
import { isValidEstadoSatCode } from "../../postalia/domicilioSatResolver";

/**
 * Validaciones pre-timbrado específicas de Sicofi Factura40 y reglas SAT frecuentes.
 *
 * Complementa `validateCartaPorteData` en `cartaPorteService`. No lanza excepciones:
 * devuelve una lista de mensajes en español para mostrar en preview.
 *
 * @param ctx - Contexto del viaje a timbrar.
 * @returns Lista vacía si todo es válido; mensajes descriptivos si hay problemas.
 */
export async function validateSicofiFactura40(ctx: TimbradoContext): Promise<string[]> {
  const issues: string[] = [];
  const { tipo, trip, tenant, ubicaciones, mercancias, truck, driver, client } = ctx;

  const isSicofi = (tenant.pac_proveedor || "").toLowerCase() === "sicofi";
  if (isSicofi && !tenant.pac_usuario) issues.push("PAC: falta usuario Sicofi");
  if (isSicofi && !tenant.pac_token_enc) issues.push("PAC: falta contraseña Sicofi");

  if (!client.regimen_fiscal) issues.push("Cliente: falta régimen fiscal");
  if (!client.cp) issues.push("Cliente: falta código postal fiscal");
  const clientRfcIssue = satRfcIssue("Cliente", client.rfc);
  if (clientRfcIssue) issues.push(clientRfcIssue);
  const driverRfcIssue = satRfcIssue("Operador", driver?.rfc);
  if (driverRfcIssue) issues.push(driverRfcIssue);

  if (tipo === "ingreso") {
    if (num(trip.tarifa) <= 0) issues.push("Viaje: la tarifa debe ser mayor a 0 para factura de ingreso");
    const stored = Array.isArray(trip.cfdi_conceptos) ? trip.cfdi_conceptos : [];
    if (stored.length > 0) {
      const suma = stored.reduce(
        (s, c) => s + (Number(c.valor_unitario) || 0) * (Number(c.cantidad) || 1),
        0,
      );
      if (suma <= 0) {
        issues.push("Viaje: la suma de conceptos CFDI debe ser mayor a 0 para factura de ingreso");
      }
      for (let i = 0; i < stored.length; i++) {
        const c = stored[i];
        if (!String(c.descripcion ?? "").trim()) {
          issues.push(`Concepto CFDI ${i + 1}: falta descripción`);
        }
        if (!String(c.clave_prod_serv ?? "").trim()) {
          issues.push(`Concepto CFDI ${i + 1}: falta clave de producto/servicio`);
        }
      }
    }
  }

  for (const u of normalizeFiscalUbicaciones(ubicaciones)) {
    const label = u.orden === 1 ? "origen" : "destino final";
    const ubicRfcIssue = satRfcIssue(`Ubicación ${label}`, u.rfc || client.rfc);
    if (ubicRfcIssue) issues.push(ubicRfcIssue);
    if (!(u.nombre?.trim() || client.razon_social?.trim())) {
      issues.push(`Ubicación ${label}: falta razón social`);
    }
    if (!u.cp?.trim()) {
      issues.push(`Ubicación ${label}: falta código postal`);
    }
    if (!isValidEstadoSatCode(u.estado)) {
      issues.push(`Ubicación ${label}: falta estado (clave SAT)`);
    }
    if (!u.municipio_clave?.trim() && !u.municipio?.trim()) {
      issues.push(`Ubicación ${label}: falta municipio o clave SAT`);
    }
    if (!u.colonia_clave?.trim() && !u.colonia?.trim()) {
      issues.push(`Ubicación ${label}: falta colonia o clave SAT`);
    }
    const estado = u.estado?.trim().toUpperCase() ?? "";
    if (estado && (await hasLocalidadesForEstado(estado)) && !u.localidad_clave?.trim() && !u.localidad?.trim()) {
      issues.push(`Ubicación ${label}: falta localidad o clave SAT`);
    }
  }

  for (const m of mercancias) {
    const bienesIssue = bienesTranspCpIssue(`Mercancía "${m.descripcion}"`, m.clave_prod_serv);
    if (bienesIssue) issues.push(bienesIssue);
    if (!m.unidad) issues.push(`Mercancía "${m.descripcion}": falta unidad`);
    if (!m.peso_kg || num(m.peso_kg) <= 0) {
      issues.push(`Mercancía "${m.descripcion}": falta peso en kg`);
    }
  }

  const publicoGeneral = isPublicoGeneralReceptor(client);

  if (tipo === "ingreso" && publicoGeneral) {
    issues.push(
      "Ingreso con Carta Porte: no use RFC genérico XAXX010101000; capture un cliente con RFC real inscrito en el SAT",
    );
  }

  if (tipo === "traslado") {
    if (!tenant.rfc) issues.push("Empresa: falta RFC del emisor (debe coincidir con el CSD en Sicofi)");
    if (!tenant.razon_social) issues.push("Empresa: falta razón social del emisor");
    if (!tenant.cp_fiscal) issues.push("Empresa: falta código postal fiscal (LugarDeExpedicion)");
  }
  const configIssue = configVehicularIssue("Camión", truck?.config_vehicular);
  if (configIssue) issues.push(configIssue);
  const permIssue = permSctIssue("Camión", truck?.perm_sct);
  if (permIssue) issues.push(permIssue);
  if (!driver?.licencia_federal && !driver?.licencia) {
    issues.push("Operador: falta licencia federal");
  }

  return issues;
}
