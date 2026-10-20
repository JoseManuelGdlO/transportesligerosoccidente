import type { UbicacionTipo } from "../../models/TripUbicacion";
import { normalizeFiscalUbicaciones, resolveIdUbicacionSat } from "../tripFiscalService";
import type { CfdiMercancia, CfdiUbicacion, ParsedCfdi } from "./parseCfdiXml";

/** Ubicación y mercancía del viaje, lo mínimo para completar el PDF. */
export interface CartaPortePdfSource {
  tripId: string;
  ubicaciones: Array<{
    orden: number;
    tipo: UbicacionTipo;
    id_ubicacion_sat?: string | null;
  }>;
  mercancias: Array<{
    cantidad?: string | number | null;
    cantidad_transportada?: string | number | null;
  }>;
  /** Nota guardada. null = no mostrar el NoIdentificacion del XML en este PDF. */
  comentarios?: string | null;
}

function tipoUbicacion(tipo: string | undefined): UbicacionTipo {
  return tipo?.toLowerCase().startsWith("dest") ? "Destino" : "Origen";
}

function textAmount(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).trim();
}

/** 1.0000 → 1; 1.5000 → 1.5. Conserva decimales solo cuando aportan. */
export function formatCantidadVisible(n: string): string {
  const raw = n.trim();
  const v = Number(raw);
  if (!Number.isFinite(v)) return raw;
  return v.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * El XML timbrado de Sicofi puede omitir IDUbicacion y CantidadTransporta.
 * Esos identificadores ya viven en el viaje; el PDF los toma de ahí cuando el XML no los trae.
 * Unidad se deja vacía si solo repite la clave de catálogo (H87 / H87).
 */
export function prepareCfdiForPdf(cfdi: ParsedCfdi, source?: CartaPortePdfSource | null): ParsedCfdi {
  const withNota = applyComentarioPdf(cfdi, source);
  const cp = withNota.cartaPorte;
  if (!cp) return withNota;

  const ubicaciones = cp.ubicaciones.map((u) => ({ ...u }));
  if (source) fillIdUbicacion(ubicaciones, source);

  const idOrigen = ubicaciones.find((u) => tipoUbicacion(u.tipoUbicacion) === "Origen" && u.idUbicacion)?.idUbicacion;
  const destinos = ubicaciones.filter((u) => tipoUbicacion(u.tipoUbicacion) === "Destino" && u.idUbicacion);
  const idDestino = destinos[destinos.length - 1]?.idUbicacion;

  const mercancias = cp.mercancias.map((m, i) =>
    prepareMercancia(m, source?.mercancias[i], idOrigen, idDestino),
  );

  return { ...withNota, cartaPorte: { ...cp, ubicaciones, mercancias } };
}

/**
 * El comentario también viaja a Sicofi como NoIdentificacion al timbrar.
 * Aquí el valor guardado sustituye al del XML para que un cambio posterior
 * se vea en el PDF de este sistema.
 */
function applyComentarioPdf(cfdi: ParsedCfdi, source?: CartaPortePdfSource | null): ParsedCfdi {
  if (!source || source.comentarios === undefined) return cfdi;
  const nota = source.comentarios?.trim() || undefined;
  return {
    ...cfdi,
    conceptos: cfdi.conceptos.map((c, i) => ({
      ...c,
      noIdentificacion: i === 0 ? nota : undefined,
    })),
  };
}

function fillIdUbicacion(ubicaciones: CfdiUbicacion[], source: CartaPortePdfSource): void {
  const fiscal = normalizeFiscalUbicaciones(source.ubicaciones);
  const pool: Record<UbicacionTipo, typeof fiscal> = {
    Origen: fiscal.filter((u) => u.tipo === "Origen"),
    Destino: fiscal.filter((u) => u.tipo === "Destino"),
  };
  const used: Record<UbicacionTipo, number> = { Origen: 0, Destino: 0 };

  for (const u of ubicaciones) {
    if (u.idUbicacion?.trim()) continue;
    const tipo = tipoUbicacion(u.tipoUbicacion);
    const list = pool[tipo];
    const sys = list[used[tipo]] ?? list[list.length - 1];
    if (!sys) continue;
    if (used[tipo] < list.length) used[tipo] += 1;
    u.idUbicacion = resolveIdUbicacionSat(sys.id_ubicacion_sat, tipo, source.tripId, sys.orden);
  }
}

function prepareMercancia(
  m: CfdiMercancia,
  sys: CartaPortePdfSource["mercancias"][number] | undefined,
  idOrigen: string | undefined,
  idDestino: string | undefined,
): CfdiMercancia {
  const next: CfdiMercancia = { ...m };
  const clave = m.claveUnidad?.trim();
  const unidad = m.unidad?.trim();
  if (clave && unidad && clave.toUpperCase() === unidad.toUpperCase()) {
    next.unidad = undefined;
  }

  const already = m.cantidadTransporta?.filter((c) => c.idOrigen || c.idDestino || c.cantidad) ?? [];
  if (already.length > 0 || !idOrigen || !idDestino) return next;

  const cantidad = textAmount(m.cantidad) || textAmount(sys?.cantidad_transportada ?? sys?.cantidad);
  if (!cantidad) return next;

  next.cantidadTransporta = [{ cantidad, idOrigen, idDestino }];
  return next;
}
