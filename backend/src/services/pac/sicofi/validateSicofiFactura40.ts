import { num } from "../../../utils/numbers";
import { satRfcIssue } from "../../../utils/rfcSat";
import { bienesTranspCpIssue, configVehicularIssue, permSctIssue } from "../../../utils/cartaPorteSat";
import type { TimbradoContext } from "../types";
import { isPublicoGeneralReceptor } from "./publicoGeneral";
import { normalizeFiscalUbicaciones } from "../../tripFiscalService";

/**
 * Validaciones pre-timbrado específicas de Sicofi Factura40 y reglas SAT frecuentes.
 *
 * Complementa `validateCartaPorteData` en `cartaPorteService`. No lanza excepciones:
 * devuelve una lista de mensajes en español para mostrar en preview.
 *
 * @param ctx - Contexto del viaje a timbrar.
 * @returns Lista vacía si todo es válido; mensajes descriptivos si hay problemas.
 */
export function validateSicofiFactura40(ctx: TimbradoContext): string[] {
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
