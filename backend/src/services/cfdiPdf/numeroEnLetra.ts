const UNIDADES = [
  "",
  "UN",
  "DOS",
  "TRES",
  "CUATRO",
  "CINCO",
  "SEIS",
  "SIETE",
  "OCHO",
  "NUEVE",
  "DIEZ",
  "ONCE",
  "DOCE",
  "TRECE",
  "CATORCE",
  "QUINCE",
  "DIECISEIS",
  "DIECISIETE",
  "DIECIOCHO",
  "DIECINUEVE",
];

const DECENAS = [
  "",
  "",
  "VEINTE",
  "TREINTA",
  "CUARENTA",
  "CINCUENTA",
  "SESENTA",
  "SETENTA",
  "OCHENTA",
  "NOVENTA",
];

const CENTENAS = [
  "",
  "CIENTO",
  "DOSCIENTOS",
  "TRESCIENTOS",
  "CUATROCIENTOS",
  "QUINIENTOS",
  "SEISCIENTOS",
  "SETECIENTOS",
  "OCHOCIENTOS",
  "NOVECIENTOS",
];

function leerCentenas(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const rest = n % 100;
  const cent = CENTENAS[c] || "";
  if (rest === 0) return cent;
  return `${cent} ${leerDecenas(rest)}`.trim();
}

function leerDecenas(n: number): string {
  if (n < 20) return UNIDADES[n];
  if (n < 30) {
    if (n === 20) return "VEINTE";
    return `VEINTI${UNIDADES[n - 20]}`.replace("VEINTIUN", "VEINTIUNO");
  }
  const d = Math.floor(n / 10);
  const u = n % 10;
  const dec = DECENAS[d];
  if (u === 0) return dec;
  return `${dec} Y ${UNIDADES[u]}`;
}

function leerMiles(n: number): string {
  if (n < 1000) return leerCentenas(n);
  const miles = Math.floor(n / 1000);
  const rest = n % 1000;
  const milesTxt = miles === 1 ? "MIL" : `${leerCentenas(miles)} MIL`;
  if (rest === 0) return milesTxt;
  return `${milesTxt} ${leerCentenas(rest)}`.trim();
}

function leerMillones(n: number): string {
  if (n < 1_000_000) return leerMiles(n);
  const millones = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const millTxt = millones === 1 ? "UN MILLON" : `${leerMiles(millones)} MILLONES`;
  if (rest === 0) return millTxt;
  return `${millTxt} ${leerMiles(rest)}`.trim();
}

/** Convierte un monto decimal a letra estilo CFDI mexicano. */
export function numeroEnLetra(amount: number, moneda = "MXN"): string {
  const abs = Math.abs(amount);
  const entero = Math.floor(abs);
  const centavos = Math.round((abs - entero) * 100);
  const letra = entero === 0 ? "CERO" : leerMillones(entero);
  const monedaLabel = moneda === "USD" ? "USD" : "MXN";
  return `${letra} ${String(centavos).padStart(2, "0")}/100 ${monedaLabel}`.replace(/\s+/g, " ").trim();
}
