/** Nombre normalizado de entidad federativa → clave c_Estado. */
const MEXICAN_STATE_NAME_TO_CODE: Record<string, string> = {
  aguascalientes: "AGU",
  "baja california": "BCN",
  "baja california sur": "BCS",
  campeche: "CAM",
  chiapas: "CHP",
  chihuahua: "CHH",
  "ciudad de mexico": "CMX",
  cdmx: "CMX",
  "distrito federal": "CMX",
  coahuila: "COA",
  "coahuila de zaragoza": "COA",
  colima: "COL",
  durango: "DUR",
  guanajuato: "GUA",
  guerrero: "GRO",
  hidalgo: "HID",
  jalisco: "JAL",
  mexico: "MEX",
  "estado de mexico": "MEX",
  michoacan: "MIC",
  "michoacan de ocampo": "MIC",
  morelos: "MOR",
  nayarit: "NAY",
  "nuevo leon": "NLE",
  oaxaca: "OAX",
  puebla: "PUE",
  queretaro: "QUE",
  "quintana roo": "ROO",
  "san luis potosi": "SLP",
  sinaloa: "SIN",
  sonora: "SON",
  tabasco: "TAB",
  tamaulipas: "TAM",
  tlaxcala: "TLA",
  veracruz: "VER",
  "veracruz de ignacio de la llave": "VER",
  yucatan: "YUC",
  zacatecas: "ZAC",
};

const ESTADO_SAT_LABEL: Record<string, string> = {
  AGU: "Aguascalientes",
  BCN: "Baja California",
  BCS: "Baja California Sur",
  CAM: "Campeche",
  CHP: "Chiapas",
  CHH: "Chihuahua",
  CMX: "Ciudad de México",
  COA: "Coahuila",
  COL: "Colima",
  DUR: "Durango",
  GUA: "Guanajuato",
  GRO: "Guerrero",
  HID: "Hidalgo",
  JAL: "Jalisco",
  MEX: "México",
  MIC: "Michoacán",
  MOR: "Morelos",
  NAY: "Nayarit",
  NLE: "Nuevo León",
  OAX: "Oaxaca",
  PUE: "Puebla",
  QUE: "Querétaro",
  ROO: "Quintana Roo",
  SLP: "San Luis Potosí",
  SIN: "Sinaloa",
  SON: "Sonora",
  TAB: "Tabasco",
  TAM: "Tamaulipas",
  TLA: "Tlaxcala",
  VER: "Veracruz",
  YUC: "Yucatán",
  ZAC: "Zacatecas",
};

const ESTADO_SAT_CODES = new Set(Object.values(MEXICAN_STATE_NAME_TO_CODE));

const PAISES_MEXICO = new Set(["", "MEX", "MX", "MEXICO", "MÉXICO"]);

function normalizeDesc(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** País SAT de México. Vacío se trata como nacional. */
export function paisEsMexico(pais: string | null | undefined): boolean {
  return PAISES_MEXICO.has((pais ?? "").trim().toUpperCase());
}

export function isEstadoSatCode(estado: string | null | undefined): boolean {
  const code = (estado ?? "").trim().toUpperCase();
  return ESTADO_SAT_CODES.has(code);
}

function resolveEstadoFromName(name: string): { code: string; label: string } | null {
  const norm = normalizeDesc(name);
  if (!norm) return null;

  const exact = MEXICAN_STATE_NAME_TO_CODE[norm];
  if (exact) return { code: exact, label: ESTADO_SAT_LABEL[exact] };

  let bestKey = "";
  let bestCode = "";
  for (const [key, code] of Object.entries(MEXICAN_STATE_NAME_TO_CODE)) {
    if (key.length < 4) continue;
    if (norm.includes(key) && key.length > bestKey.length) {
      bestKey = key;
      bestCode = code;
    }
  }
  if (!bestCode) return null;
  return { code: bestCode, label: ESTADO_SAT_LABEL[bestCode] };
}

/**
 * Rechaza un estado mexicano que no sea clave c_Estado.
 * Vacío y países distintos de México no generan error.
 */
export function estadoClaveSatIssue(
  estado: string | null | undefined,
  pais: string | null | undefined,
): string | null {
  if (!paisEsMexico(pais)) return null;
  const raw = (estado ?? "").trim();
  if (!raw || isEstadoSatCode(raw)) return null;

  const resolved = resolveEstadoFromName(raw);
  if (resolved) {
    return `"${raw}" no es clave SAT. ${resolved.label} corresponde a ${resolved.code}. Selecciónala en el catálogo.`;
  }
  return "Usa la clave SAT del estado (por ejemplo JAL), no el nombre.";
}
