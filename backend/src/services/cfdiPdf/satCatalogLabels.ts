export type SatCatalogName =
  | "regimenFiscal"
  | "formaPago"
  | "metodoPago"
  | "usoCfdi"
  | "claveUnidad"
  | "claveProdServ";

const REGIMEN_FISCAL: Record<string, string> = {
  "601": "General de Ley Personas Morales",
  "603": "Personas Morales con Fines no Lucrativos",
  "605": "Sueldos y Salarios e Ingresos Asimilados a Salarios",
  "606": "Arrendamiento",
  "607": "Régimen de Enajenación o Adquisición de Bienes",
  "608": "Demás ingresos",
  "610": "Residentes en el Extranjero sin Establecimiento Permanente en México",
  "611": "Ingresos por Dividendos (socios y accionistas)",
  "612": "Personas Físicas con Actividades Empresariales y Profesionales",
  "614": "Ingresos por intereses",
  "615": "Régimen de los ingresos por obtención de premios",
  "616": "Sin obligaciones fiscales",
  "620": "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
  "621": "Incorporación Fiscal",
  "622": "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
  "623": "Opcional para Grupos de Sociedades",
  "624": "Coordinados",
  "625": "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  "626": "Régimen Simplificado de Confianza",
};

const FORMA_PAGO: Record<string, string> = {
  "01": "Efectivo",
  "02": "Cheque nominativo",
  "03": "Transferencia electrónica de fondos",
  "04": "Tarjeta de crédito",
  "05": "Monedero electrónico",
  "06": "Dinero electrónico",
  "08": "Vales de despensa",
  "12": "Dación en pago",
  "13": "Pago por subrogación",
  "14": "Pago por consignación",
  "15": "Condonación",
  "17": "Compensación",
  "23": "Novación",
  "24": "Confusión",
  "25": "Remisión de deuda",
  "26": "Prescripción o caducidad",
  "27": "A satisfacción del acreedor",
  "28": "Tarjeta de débito",
  "29": "Tarjeta de servicios",
  "30": "Aplicación de anticipos",
  "31": "Intermediario pagos",
  "99": "Por definir",
};

const METODO_PAGO: Record<string, string> = {
  PUE: "Pago en una sola exhibición",
  PPD: "Pago en parcialidades o diferido",
};

const USO_CFDI: Record<string, string> = {
  G01: "Adquisición de mercancías",
  G02: "Devoluciones, descuentos o bonificaciones",
  G03: "Gastos en general",
  I01: "Construcciones",
  I02: "Mobilario y equipo de oficina por inversiones",
  I03: "Equipo de transporte",
  I04: "Equipo de computo y accesorios",
  I05: "Dados, troqueles, moldes, matrices y herramental",
  I06: "Comunicaciones telefónicas",
  I07: "Comunicaciones satelitales",
  I08: "Otra maquinaria y equipo",
  D01: "Honorarios médicos, dentales y gastos hospitalarios",
  D02: "Gastos médicos por incapacidad o discapacidad",
  D03: "Gastos funerales",
  D04: "Donativos",
  D05: "Intereses reales efectivamente pagados por créditos hipotecarios",
  D06: "Aportaciones voluntarias al SAR",
  D07: "Primas por seguros de gastos médicos",
  D08: "Gastos de transportación escolar obligatoria",
  D09: "Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones",
  D10: "Pagos por servicios educativos (colegiaturas)",
  S01: "Sin efectos fiscales",
  CP01: "Pagos",
  CN01: "Nómina",
};

const CLAVE_UNIDAD: Record<string, string> = {
  E48: "Unidad de servicio",
  E54: "Viaje",
  KGM: "Kilogramo",
  XTL: "Lote",
  H87: "Pieza",
  ACT: "Actividad",
};

const CLAVE_PROD_SERV: Record<string, string> = {
  "78101800": "Servicios de transporte de carga por carretera (en camión) a nivel local y regional",
  "78101801": "Servicios de transporte de carga por carretera (en camión) en área local",
  "78101802": "Servicios transporte de carga por carretera (en camión) a nivel regional y nacional",
  "78101803": "Servicios de transporte de carga por carretera (en camión) de productos agropecuarios",
  "78101804": "Servicios de transporte de carga por carretera (en camión) de materiales para la construcción",
};

const CATALOGS: Record<SatCatalogName, Record<string, string>> = {
  regimenFiscal: REGIMEN_FISCAL,
  formaPago: FORMA_PAGO,
  metodoPago: METODO_PAGO,
  usoCfdi: USO_CFDI,
  claveUnidad: CLAVE_UNIDAD,
  claveProdServ: CLAVE_PROD_SERV,
};

/** Devuelve `"99 - Por definir"` o solo la clave si no hay descripción. */
export function formatCatalogCode(
  code: string | undefined | null,
  catalog: SatCatalogName,
  opts?: { codeOnly?: boolean },
): string {
  const trimmed = (code ?? "").trim();
  if (!trimmed) return "—";
  if (opts?.codeOnly) return trimmed;
  const label = CATALOGS[catalog][trimmed];
  return label ? `${trimmed} - ${label}` : trimmed;
}

/** Resuelve solo la descripción del catálogo (sin clave). */
export function catalogDescription(code: string | undefined | null, catalog: SatCatalogName): string | undefined {
  const trimmed = (code ?? "").trim();
  if (!trimmed) return undefined;
  return CATALOGS[catalog][trimmed];
}

/** Enriquece mapas estáticos con descripciones de BD (clave prod serv / bienes transp). */
export function mergeCatalogDescriptions(
  base: Record<string, string>,
  entries: { clave: string; descripcion: string }[],
): Record<string, string> {
  const merged = { ...base };
  for (const { clave, descripcion } of entries) {
    if (clave && descripcion) merged[clave.trim()] = descripcion;
  }
  return merged;
}
