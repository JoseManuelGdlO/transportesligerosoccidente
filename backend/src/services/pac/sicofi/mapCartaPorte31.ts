import type { Trip, CartaPorte, TripUbicacion, TripMercancia, Truck, Driver, Client } from "../../../models";
import { num } from "../../../utils/numbers";
import { DEFAULT_BIENES_TRANSP_CP, normalizePermSct } from "../../../utils/cartaPorteSat";
import { resolveIdUbicacionSat, normalizeFiscalUbicaciones } from "../../tripFiscalService";

/** Formatea fecha/hora para Carta Porte (`YYYY-MM-DDTHH:mm:ss`). */
function formatFecha(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString().slice(0, 19);
  const dt = d instanceof Date ? d : new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

/** Normaliza IdCCP al prefijo `CCC` que espera Sicofi. */
function sicofiIdCcp(id: string | null | undefined): string {
  if (!id) return "";
  return id.startsWith("CCC") ? id : `CCC${id}`;
}

/** Mapea domicilio de una ubicación del viaje al formato Sicofi CP 3.1. */
function mapDomicilio(u: TripUbicacion) {
  return {
    calle_ubicacion: u.calle || "",
    numeroexterior_ubicacion: u.numero_exterior || "1",
    numerointerior_ubicacion: u.numero_interior || null,
    colonia_ubicacion: u.colonia_clave || u.colonia || null,
    localidad_ubicacion: u.localidad_clave || u.localidad || null,
    referencia_ubicacion: null,
    municipio_ubicacion: u.municipio_clave || u.municipio || null,
    estado_ubicacion: u.estado || "",
    pais_ubicacion: u.pais || "MEX",
    codigopostal_ubicacion: u.cp || "",
  };
}

/**
 * Construye el bloque `CartaPorte31` del JSON Sicofi (complemento Carta Porte 3.1).
 *
 * Incluye ubicaciones, mercancías con `CantidadTransporta`, autotransporte y figura de transporte.
 * No envía `idubicacion` en ubicaciones (Sicofi lo acepta omitido o null).
 *
 * @returns Objeto listo para asignar a `Factura40PayloadBody.CartaPorte31`.
 */
export function mapCartaPorte31(
  trip: Trip,
  cartaPorte: CartaPorte,
  ubicaciones: TripUbicacion[],
  mercancias: TripMercancia[],
  truck: Truck,
  driver: Driver,
  client: Client,
): Record<string, unknown> {
  const sorted = normalizeFiscalUbicaciones(ubicaciones);
  const destinos = sorted.filter((u) => u.orden > 1);
  const totalDist = destinos.reduce((s, d) => s + num(d.distancia_km), 0);
  const transpInternac =
    (cartaPorte.transporte_internacional || trip.tipo_viaje === "foraneo") ? "Sí" : "No";
  const pesoTotal = mercancias.reduce((s, m) => s + num(m.peso_kg), 0);

  const ubicacionesSicofi = sorted.map((u) => {
    const isOrigen = u.orden === 1;
    return {
      tipoubicacion: isOrigen ? "Origen" : "Destino",
      rfcremitentedestinatario: u.rfc || client.rfc,
      nombreremitentedestinatario: u.nombre || client.razon_social,
      numregidtrib: null,
      residenciafiscal: null,
      numestacion: null,
      nombreestacion: null,
      navegaciontrafico: null,
      fechahorasalidallegada: formatFecha(u.fecha_hora),
      tipoestacion: null,
      distanciarecorrida: isOrigen ? null : String(u.distancia_km ?? totalDist),
      DomicilioUbicacion: mapDomicilio(u),
    };
  });

  const origen = sorted[0];
  const destinoFinal = sorted[sorted.length - 1];
  const idOrigen = origen
    ? resolveIdUbicacionSat(origen.id_ubicacion_sat, origen.tipo, trip.id, origen.orden)
    : "";
  const idDestino = destinoFinal
    ? resolveIdUbicacionSat(destinoFinal.id_ubicacion_sat, destinoFinal.tipo, trip.id, destinoFinal.orden)
    : "";

  const mercancia30 = mercancias.map((m) => {
    const cantidad = String(m.cantidad);
    const item: Record<string, unknown> = {
      SectorCOFEPRIS: null,
      bienestransp: m.clave_prod_serv || DEFAULT_BIENES_TRANSP_CP,
      descripcion_mercancia: m.descripcion,
      cantidad_mercancia: cantidad,
      claveunidad_mercancia: m.unidad,
      unidad_mercancia: m.unidad,
      materialpeligroso: m.material_peligroso ? "Sí" : "No",
      pesoenkg: String(m.peso_kg),
      cvematerialpeligroso: null,
      embalaje: m.embalaje || null,
      DocumentacionAduanera: [],
    };
    return item;
  });

  return {
    RegimenesAduaneros: null,
    IdCCP: sicofiIdCcp(cartaPorte.id_ccp),
    RegimenAduanero: null,
    transpinternac: transpInternac,
    totaldistrec: totalDist > 0 ? String(totalDist) : "0",
    Ubicaciones20: { ubicaciones: ubicacionesSicofi },
    MercanciasCartaPorte30: {
      Autotransporte30: {
        IdentificacionVehicularCartaPorte30: {
          PesoBrutoVehicular: String(truck.peso_bruto_vehicular || "0"),
          configvehicular: truck.config_vehicular || "",
          placavm: truck.placas,
          aniomodelovm: String(truck.anio),
        },
        permsct: normalizePermSct(truck.perm_sct || ""),
        numpermisosct: truck.num_permiso_sct || "",
        Seguros: {
          asegurarespcivil: truck.aseguradora_resp_civil || "",
          polizarespcivil: truck.poliza_resp_civil || "",
          aseguramedambiente: null,
          polizamedambiente: null,
          aseguracarga: null,
          polizacarga: null,
          primaseguro: null,
        },
        Remolques: null,
      },
      Mercancia30: mercancia30,
      pesobrutototal: String(pesoTotal),
      unidadpeso: "KGM",
      numtotalmercancias: String(mercancias.length),
    },
    FiguraTransporte20: {
      TiposFigura: [
        {
          tipofigura: driver.tipo_figura || "01",
          rfcfigura: driver.rfc || "XAXX010101000",
          numlicencia: driver.licencia_federal || driver.licencia || "",
          nombrefigura: driver.nombre,
        },
      ],
    },
  };
}
