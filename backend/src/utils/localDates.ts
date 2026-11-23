/** Fecha/hora CFDI `YYYY-MM-DDTHH:mm:ss` en TZ del proceso (recomendado America/Mexico_City). */
export function localDateTimeSatStr(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Fecha elegida por el usuario con la hora del reloj. La hora no se captura a mano. */
export function fechaPagoConHora(fecha: string, now = new Date()): string {
  return `${fecha.slice(0, 10)}T${localDateTimeSatStr(now).slice(11)}`;
}

/** Fecha local YYYY-MM-DD según TZ del proceso (recomendado America/Mexico_City). */
export function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Primer día del mes actual (local). */
export function localMonthStartStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function addDaysToDateStr(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + days);
  return localDateStr(dt);
}
