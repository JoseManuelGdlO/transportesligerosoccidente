export const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n || 0);

export const fmtMXNDecimal = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

export const fmtNumber = (n: number, decimals = 0) =>
  new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n || 0);

export const fmtPct = (n: number, decimals = 1) =>
  `${(n || 0).toFixed(decimals)}%`;

/** Parsea `YYYY-MM-DD` como fecha de calendario local (evita el desfase UTC de `new Date("YYYY-MM-DD")`). */
export function parseDateOnlyLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim().slice(0, 10));
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!y || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(y, month - 1, day);
  // Rechaza overflow del Date (p. ej. 2025-02-31 → 3 mar).
  if (d.getFullYear() !== y || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

export const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const raw = String(iso).trim();
  // Solo-día: evitar `new Date("YYYY-MM-DD")` (UTC) que en Américas resta un día.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const local = parseDateOnlyLocal(raw);
    if (!local) return "—";
    return local.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

import type { Trip } from "@/types/tlo";

export function formatTripRoute(
  trip: Pick<Trip, "route_nombre" | "ruta_resumen" | "paradas" | "origen" | "destino">,
): string {
  if (trip.route_nombre?.trim()) {
    return trip.route_nombre.trim().replace(/\s*\/\s*/g, " → ");
  }
  if (trip.ruta_resumen?.trim()) return trip.ruta_resumen.trim();
  if (trip.paradas && trip.paradas.length >= 2) {
    return [...trip.paradas]
      .sort((a, b) => a.orden - b.orden)
      .map((p) => p.etiqueta)
      .join(" → ");
  }
  return `${trip.origen} → ${trip.destino}`;
}

export const fmtDateTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: undefined,
  });
};

/** Hora sin segundos (p. ej. `08:00:00` → `08:00`). */
export function fmtTime(value?: string | null): string {
  if (value == null || String(value).trim() === "") return "";
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value).trim();
  return `${match[1]!.padStart(2, "0")}:${match[2]!}`;
}

/** Valor para `<input type="datetime-local">` en hora local del navegador. */
export function isoToDatetimeLocalValue(iso?: string | null): string {
  if (iso == null || String(iso).trim() === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const startOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 dom .. 6 sab
  const diff = day === 0 ? -6 : 1 - day; // lunes
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const endOfWeek = (date: Date) => {
  const s = startOfWeek(date);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
};

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);