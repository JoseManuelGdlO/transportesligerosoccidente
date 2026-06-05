export type StopIssueFlags = {
  highlight: boolean;
  cp: boolean;
  estado: boolean;
  distancia_km: boolean;
};

export type CartaPorteIssueClass = {
  hasEmpresaIssues: boolean;
  hasTripStatusIssue: boolean;
  hasMercanciasIssue: boolean;
  ubicacionesMin: boolean;
  truck: {
    highlight: boolean;
    config_vehicular: boolean;
    perm_sct: boolean;
    num_permiso_sct: boolean;
    peso_bruto_vehicular: boolean;
    aseguradora_resp_civil: boolean;
    poliza_resp_civil: boolean;
  };
  driver: {
    highlight: boolean;
    unassigned: boolean;
    rfc: boolean;
    licencia: boolean;
  };
  origen: StopIssueFlags;
  /** orden → flags (destino final usa stopCount) */
  stops: Record<number, StopIssueFlags>;
};

export type ErrorSectionId =
  | "empresa"
  | "driver"
  | "truck"
  | "origen"
  | "stop"
  | "destino"
  | "mercancias";

const emptyStop = (): StopIssueFlags => ({
  highlight: false,
  cp: false,
  estado: false,
  distancia_km: false,
});

export function emptyCartaPorteIssueClass(): CartaPorteIssueClass {
  return {
    hasEmpresaIssues: false,
    hasTripStatusIssue: false,
    hasMercanciasIssue: false,
    ubicacionesMin: false,
    truck: {
      highlight: false,
      config_vehicular: false,
      perm_sct: false,
      num_permiso_sct: false,
      peso_bruto_vehicular: false,
      aseguradora_resp_civil: false,
      poliza_resp_civil: false,
    },
    driver: {
      highlight: false,
      unassigned: false,
      rfc: false,
      licencia: false,
    },
    origen: emptyStop(),
    stops: {},
  };
}

function ensureStop(flags: CartaPorteIssueClass, orden: number): StopIssueFlags {
  if (!flags.stops[orden]) {
    flags.stops[orden] = emptyStop();
  }
  return flags.stops[orden];
}

function ordenFromUbicacionLabel(label: string, stopCount: number): number | null {
  if (label === "origen") return 1;
  if (label === "destino final") return stopCount;
  const m = label.match(/^parada (\d+)$/);
  if (m) return Number(m[1]);
  return null;
}

export function classifyCartaPorteIssues(
  issues: string[],
  stopCount: number,
): CartaPorteIssueClass {
  const flags = emptyCartaPorteIssueClass();

  for (const issue of issues) {
    if (
      issue.includes("empresa") ||
      issue.includes("Régimen fiscal") ||
      issue.includes("Razón social") ||
      issue.includes("CSD")
    ) {
      flags.hasEmpresaIssues = true;
    }
    if (issue === "Estado de viaje no válido para carta porte") {
      flags.hasTripStatusIssue = true;
    }
    if (issue === "Agrega al menos una mercancía") {
      flags.hasMercanciasIssue = true;
    }
    if (issue === "Se requieren al menos 2 ubicaciones (origen y destino)") {
      flags.ubicacionesMin = true;
      flags.origen.highlight = true;
      ensureStop(flags, stopCount).highlight = true;
    }

    const ubicMatch = issue.match(/^Ubicación (.+): falta (.+)$/);
    if (ubicMatch) {
      const label = ubicMatch[1];
      const field = ubicMatch[2];
      const orden = ordenFromUbicacionLabel(label, stopCount);
      if (orden === 1) {
        flags.origen.highlight = true;
        if (field === "código postal") flags.origen.cp = true;
        if (field === "estado") flags.origen.estado = true;
      } else if (orden != null) {
        const stop = ensureStop(flags, orden);
        stop.highlight = true;
        if (field === "código postal") stop.cp = true;
        if (field === "estado") stop.estado = true;
        if (field === "distancia del tramo en km") stop.distancia_km = true;
      }
    }

    if (issue === "Operador no asignado") {
      flags.driver.highlight = true;
      flags.driver.unassigned = true;
    }
    if (issue === "Operador: falta RFC") {
      flags.driver.highlight = true;
      flags.driver.rfc = true;
    }
    if (issue === "Operador: falta licencia federal") {
      flags.driver.highlight = true;
      flags.driver.licencia = true;
    }

    if (issue === "Camión: falta configuración vehicular SAT") {
      flags.truck.highlight = true;
      flags.truck.config_vehicular = true;
    }
    if (issue === "Camión: falta permiso SCT") {
      flags.truck.highlight = true;
      flags.truck.perm_sct = true;
    }
    if (issue === "Camión: falta número de permiso SCT") {
      flags.truck.highlight = true;
      flags.truck.num_permiso_sct = true;
    }
    if (issue === "Camión: falta peso bruto vehicular") {
      flags.truck.highlight = true;
      flags.truck.peso_bruto_vehicular = true;
    }
    if (issue === "Camión: falta aseguradora de responsabilidad civil") {
      flags.truck.highlight = true;
      flags.truck.aseguradora_resp_civil = true;
    }
    if (issue === "Camión: falta póliza de responsabilidad civil") {
      flags.truck.highlight = true;
      flags.truck.poliza_resp_civil = true;
    }
  }

  return flags;
}

export function fieldHighlightClass(highlight: boolean, validationAttempted: boolean): string {
  return highlight && validationAttempted ? "border-destructive ring-1 ring-destructive" : "";
}

export function cardHighlightClass(highlight: boolean, validationAttempted: boolean): string {
  return highlight && validationAttempted ? "ring-2 ring-destructive" : "";
}

export function firstErrorSection(
  flags: CartaPorteIssueClass,
  stopCount: number,
): ErrorSectionId | null {
  if (flags.hasEmpresaIssues) return "empresa";
  if (flags.driver.highlight) return "driver";
  if (flags.truck.highlight) return "truck";
  if (flags.origen.highlight) return "origen";
  const middleOrden = Object.keys(flags.stops)
    .map(Number)
    .filter((o) => o > 1 && o < stopCount)
    .sort((a, b) => a - b)[0];
  if (middleOrden != null && flags.stops[middleOrden]?.highlight) return "stop";
  if (flags.stops[stopCount]?.highlight) return "destino";
  if (flags.hasMercanciasIssue || flags.ubicacionesMin) return "mercancias";
  return null;
}
