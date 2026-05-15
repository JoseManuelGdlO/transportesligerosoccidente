import type { CommissionType, Driver, TenantDocumentType, Truck } from "@/types/tlo";
export function normalizeSearch(s: string): string {
  return s.trim().toLowerCase();
}

export function truckMatchesSearch(t: Truck, q: string): boolean {
  const n = normalizeSearch(q);
  if (!n) return true;
  const hay = [t.numero_economico, t.placas, t.marca, t.modelo, String(t.anio)].map((x) =>
    normalizeSearch(String(x)),
  );
  return hay.some((field) => field.includes(n));
}

export function driverMatchesSearch(d: Driver, q: string): boolean {
  const n = normalizeSearch(q);
  if (!n) return true;
  const hay = [d.nombre, d.telefono, d.licencia].map((x) => normalizeSearch(String(x)));
  return hay.some((field) => field.includes(n));
}

export function documentTypeMatchesSearch(row: TenantDocumentType, q: string): boolean {
  const n = normalizeSearch(q);
  if (!n) return true;
  const aplicaLabel = row.aplica_a === "unidad" ? "Unidad" : "Operador";
  const hay = [
    row.nombre,
    row.slug,
    row.aplica_a,
    aplicaLabel,
    String(row.dias_aviso),
    row.activo ? "activo" : "inactivo",
    row.requiere_vigencia ? "vigencia" : "archivo",
  ].map((x) => normalizeSearch(String(x)));
  return hay.some((field) => field.includes(n));
}
export type TruckEstatusFilter = "todos" | "activo" | "taller";

export function truckMatchesEstatusFilter(t: Truck, f: TruckEstatusFilter): boolean {
  if (f === "todos") return true;
  return t.estatus === f;
}

export type DriverComisionFilter = "todos" | CommissionType;

export function driverMatchesComisionFilter(d: Driver, f: DriverComisionFilter): boolean {
  if (f === "todos") return true;
  return d.comision_tipo === f;
}

export type PageSlice<T> = {
  slice: T[];
  total: number;
  totalPages: number;
  safePage: number;
  rangeStart: number;
  rangeEnd: number;
};

/**
 * Pagina en base 1. Si `page` queda fuera de rango (p. ej. tras filtrar), `safePage` es la última válida.
 */
export function slicePage<T>(items: T[], page: number, pageSize: number): PageSlice<T> {
  const total = items.length;
  const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  const rangeStart = total === 0 ? 0 : start + 1;
  const rangeEnd = total === 0 ? 0 : start + slice.length;
  return { slice, total, totalPages, safePage, rangeStart, rangeEnd };
}
