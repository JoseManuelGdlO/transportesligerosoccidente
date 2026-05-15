import type { Tenant } from "@/types/tlo";

/** Convierte #RRGGBB a valores H S L para variables CSS tipo Tailwind (`h s% l%`, sin envoltura `hsl()`). */
export function hexToHslTriplet(hex: string): string | null {
  const raw = hex.trim();
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(raw);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  const H = Math.round(h * 360);
  const S = Math.round(s * 1000) / 10;
  const L = Math.round(l * 1000) / 10;
  return `${H} ${S}% ${L}%`;
}

const THEME_KEYS = ["--primary", "--accent", "--sidebar-background"] as const;

/**
 * Solo ajusta la paleta (variables que Tailwind ya usa); no cambia layout ni componentes.
 * Si el tenant no trae un color (o es inválido), se quita el override y aplica el diseño por defecto de `index.css`.
 */
export function applyTenantThemeCss(tenant: Tenant | null): void {  const root = document.documentElement;
  if (!tenant) {
    for (const k of THEME_KEYS) root.style.removeProperty(k);
    return;
  }
  const p = tenant.color_primary ? hexToHslTriplet(tenant.color_primary) : null;
  const a = tenant.color_accent ? hexToHslTriplet(tenant.color_accent) : null;
  const sb = tenant.color_sidebar ? hexToHslTriplet(tenant.color_sidebar) : null;
  if (p) root.style.setProperty("--primary", p);
  else root.style.removeProperty("--primary");
  if (a) root.style.setProperty("--accent", a);
  else root.style.removeProperty("--accent");
  if (sb) root.style.setProperty("--sidebar-background", sb);
  else root.style.removeProperty("--sidebar-background");
}
