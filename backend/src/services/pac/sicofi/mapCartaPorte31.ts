import type { Trip, CartaPorte, TripUbicacion, TripMercancia, Truck, Driver, Client } from "../../../models";
import { num } from "../../../utils/numbers";
import { defaultIdUbicacionSat } from "../../tripFiscalService";

function formatFecha(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString().slice(0, 19);
  const dt = d instanceof Date ? d : new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

function sicofiIdCcp(id: string | null | undefined): string {
  if (!id) return "";
  return id.startsWith("CCC") ? id : `CCC${id}`;
}

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

export function mapCartaPorte31(
  trip: Trip,
  cartaPorte: CartaPorte,
  ubicaciones: TripUbicacion[],
  mercancias: TripMercancia[],
  truck: Truck,
  driver: Driver,
  client: Client,
): Record<string, unknown> {
  const sorted = [...ubicaciones].sort((a, b) => a.orden - b.orden);
  const destinos = sorted.filter((u) => u.orden > 1);
  const totalDist = destinos.reduce((s, d) => s + num(d.distancia_km), 0);
  const transpInternac =
    (cartaPorte.transporte_internacional || trip.tipo_viaje === "foraneo") ? "Sí" : "No";
  const pesoTotal = mercancias.reduce((s, m) => s + num(m.peso_kg), 0);

  const ubicacionesSicofi = sorted.map((u) => {
    const isOrigen = u.orden === 1;
    return {
      tipoubicacion: isOrigen ? "Origen" : "Destino",
      idubicacion: u.id_ubicacion_sat || defaultIdUbicacionSat(u.tipo, trip.id, u.orden),
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

  const mercancia30 = mercancias.map((m) => ({
    SectorCOFEPRIS: null,
    bienestransp: m.clave_prod_serv || "78101800",
    descripcion_mercancia: m.descripcion,
    cantidad_mercancia: String(m.cantidad),
    claveunidad_mercancia: m.unidad,
    unidad_mercancia: m.unidad,
    materialpeligroso: m.material_peligroso ? "Sí" : "No",
    pesoenkg: String(m.peso_kg),
    cvematerialpeligroso: null,
    embalaje: m.embalaje || null,
    DocumentacionAduanera: [],
  }));

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
        permsct: truck.perm_sct || "",
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
