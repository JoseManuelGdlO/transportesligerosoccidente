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

export const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

import type { Trip } from "@/types/tlo";

export function formatTripRoute(trip: Pick<Trip, "ruta_resumen" | "paradas" | "origen" | "destino">): string {
  if (trip.ruta_resumen?.trim()) return trip.ruta_resumen;
  if (trip.paradas && trip.paradas.length >= 2) {
    return [...trip.paradas]
      .sort((a, b) => a.orden - b.orden)
      .map((p) => p.etiqueta)
      .join(" -> ");
  }
  return `${trip.origen} > ${trip.destino}`;
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
  });
};

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