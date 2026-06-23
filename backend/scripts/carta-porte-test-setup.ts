#!/usr/bin/env tsx
/**
 * Crea viajes de prueba para timbrado Sicofi (ingreso y traslado con mercancía).
 *
 * Uso: npx tsx scripts/carta-porte-test-setup.ts [--timbrar]
 */
import "dotenv/config";
import "../src/models/index";
import { randomUUID } from "node:crypto";
import { sequelize, Tenant, Truck, Driver, Client, TripStatus, TripUbicacion, TripMercancia } from "../src/models";
import * as tripService from "../src/services/tripService";
import * as tripFiscalService from "../src/services/tripFiscalService";
import * as cartaPorteService from "../src/services/cartaPorteService";
import {
  PUBLICO_GENERAL_NOMBRE,
  PUBLICO_GENERAL_REGIMEN,
  PUBLICO_GENERAL_RFC,
} from "../src/services/pac/sicofi/publicoGeneral";
import {
  DEFAULT_BIENES_TRANSP_CP,
  isValidConfigVehicular,
  isValidPermSct,
  normalizePermSct,
} from "../src/utils/cartaPorteSat";

const TENANT_ID = "ba2e46fb-b4d9-47d0-8e0e-a1c84c5e7fed";
const TIMBRAR = process.argv.includes("--timbrar");
/** Cliente en ubicaciones Carta Porte (remitente/destinatario) para traslado. */
const TEST_UBIC_CLIENT_RFC = PUBLICO_GENERAL_RFC;
const TEST_UBIC_CLIENT_RAZON = PUBLICO_GENERAL_NOMBRE;
/** Receptor CFDI de ingreso: RFC real inscrito en SAT (configurable). */
const TEST_INGRESO_CLIENT_RFC = process.env.SICOFI_TEST_INGRESO_CLIENT_RFC?.trim() || "";
const TEST_INGRESO_CLIENT_RAZON = process.env.SICOFI_TEST_INGRESO_CLIENT_RAZON?.trim() || "";
const TEST_INGRESO_CLIENT_CP = process.env.SICOFI_TEST_INGRESO_CLIENT_CP?.trim() || "";

const UBIC_ORIGEN_BASE = {
  calle: "Av. López Mateos Norte 2077",
  colonia: "Chapalita",
  municipio: "Zapopan",
  estado: "JAL",
  cp: "45040",
  pais: "MEX",
  fecha_hora: new Date().toISOString(),
};

const UBIC_DESTINO_BASE = {
  calle: "Av. Revolución 1500",
  colonia: "Centro",
  municipio: "Guadalajara",
  estado: "JAL",
  cp: "44100",
  pais: "MEX",
  distancia_km: 15,
  fecha_hora: new Date().toISOString(),
};

const MERCANCIA = {
  descripcion: "Mercancía general de prueba",
  cantidad: 1,
  unidad: "H87",
  peso_kg: 500,
  clave_prod_serv: DEFAULT_BIENES_TRANSP_CP,
  material_peligroso: false,
};

type Caso = {
  label: string;
  tipo: "ingreso" | "traslado";
};

const CASOS: Caso[] = [
  { label: "traslado", tipo: "traslado" },
  { label: "ingreso", tipo: "ingreso" },
];

function buildFiscalUbicaciones(client: Client) {
  const rfc = client.rfc?.trim() || TEST_UBIC_CLIENT_RFC;
  const nombre = client.razon_social?.trim() || TEST_UBIC_CLIENT_RAZON;
  return [
    { orden: 1, rfc, nombre, ...UBIC_ORIGEN_BASE },
    { orden: 2, rfc, nombre, ...UBIC_DESTINO_BASE },
  ];
}

async function ensureSystemTripStatuses(tenantId: string) {
  for (const def of [
    { slug: "en_curso", nombre: "En curso", color: "#6366f1" },
    { slug: "cerrado", nombre: "Cerrado", color: "#22c55e" },
  ] as const) {
    const existing = await TripStatus.findOne({
      where: { tenant_id: tenantId, slug: def.slug, is_system: true },
    });
    if (!existing) {
      await TripStatus.create({
        id: randomUUID(),
        tenant_id: tenantId,
        nombre: def.nombre,
        color: def.color,
        slug: def.slug,
        is_system: true,
        activo: true,
      } as never);
      console.log(`Estado de sistema creado: ${def.slug}`);
    }
  }
}

async function ensureTestDriver(tenantId: string, truckId: string): Promise<Driver> {
  const existing = await Driver.findOne({
    where: { tenant_id: tenantId, rfc: PUBLICO_GENERAL_RFC },
  });
  if (existing) {
    await existing.update({
      nombre: "Operador Prueba CP",
      licencia: "LIC-TEST-001",
      licencia_federal: "LF-TEST-001",
      tipo_figura: "01",
      rfc: PUBLICO_GENERAL_RFC,
      truck_id: truckId,
    } as never);
    return existing;
  }
  return Driver.create({
    id: randomUUID(),
    tenant_id: tenantId,
    nombre: "Operador Prueba CP",
    telefono: "3312345678",
    licencia: "LIC-TEST-001",
    licencia_federal: "LF-TEST-001",
    tipo_figura: "01",
    rfc: PUBLICO_GENERAL_RFC,
    fecha_ingreso: "2025-01-01",
    comision_tipo: "porcentaje",
    comision_valor: 10,
    comision_valor_local: 10,
    comision_valor_foraneo: 12,
    estatus: "activo",
    truck_id: truckId,
  } as never);
}

async function ensureTruckFiscal(truck: Truck) {
  const patch: Record<string, string> = {};
  if (!isValidConfigVehicular(truck.config_vehicular)) patch.config_vehicular = "C2";
  if (!isValidPermSct(truck.perm_sct)) patch.perm_sct = "TPAF01";
  else if (truck.perm_sct && normalizePermSct(truck.perm_sct) !== truck.perm_sct.trim().toUpperCase()) {
    patch.perm_sct = normalizePermSct(truck.perm_sct);
  }
  if (!truck.num_permiso_sct) patch.num_permiso_sct = "PERM-TEST-001";
  if (!truck.peso_bruto_vehicular) patch.peso_bruto_vehicular = "3500";
  if (!truck.aseguradora_resp_civil || truck.aseguradora_resp_civil === "NA") {
    patch.aseguradora_resp_civil = "GNP Seguros";
  }
  if (!truck.poliza_resp_civil || truck.poliza_resp_civil === "NA") {
    patch.poliza_resp_civil = "POL-TEST-001";
  }
  if (Object.keys(patch).length > 0) {
    await truck.update(patch as never);
  }
}

async function patchInvalidTestRfcs(tenantId: string) {
  const [ubicUpdated] = await TripUbicacion.update(
    { rfc: TEST_UBIC_CLIENT_RFC, nombre: TEST_UBIC_CLIENT_RAZON } as never,
    { where: { tenant_id: tenantId, rfc: ["CPR850101ABC", "CPR850101AB8"] } },
  );
  const [mercUpdated] = await TripMercancia.update(
    { clave_prod_serv: DEFAULT_BIENES_TRANSP_CP } as never,
    { where: { tenant_id: tenantId, clave_prod_serv: "78101800" } },
  );
  if (ubicUpdated > 0) console.log(`RFC de prueba corregido en ${ubicUpdated} ubicación(es)`);
  if (mercUpdated > 0) console.log(`Clave CP corregida en ${mercUpdated} mercancía(s)`);
}

async function ensureTestClient(tenant: Tenant, forIngreso: boolean): Promise<Client> {
  await patchInvalidTestRfcs(tenant.id);

  const targetRfc = forIngreso && TEST_INGRESO_CLIENT_RFC ? TEST_INGRESO_CLIENT_RFC : TEST_UBIC_CLIENT_RFC;
  const targetRazon = forIngreso && TEST_INGRESO_CLIENT_RAZON ? TEST_INGRESO_CLIENT_RAZON : TEST_UBIC_CLIENT_RAZON;

  let client = await Client.findOne({ where: { tenant_id: tenant.id, rfc: targetRfc } });
  if (!client) {
    client = await Client.findOne({ where: { tenant_id: tenant.id, estatus: "activo" } });
  }
  if (!client) {
    client = await Client.findOne({ where: { tenant_id: tenant.id } });
    if (client) await client.update({ estatus: "activo" } as never);
  }
  if (!client) {
    client = await Client.create({
      id: randomUUID(),
      tenant_id: tenant.id,
      razon_social: targetRazon,
      rfc: targetRfc,
      contacto: "Contacto Prueba",
      telefono: "3312345678",
      calle: "Av. Revolución 1500",
      colonia: "Centro",
      municipio: "Guadalajara",
      estado: "JAL",
      cp: forIngreso && TEST_INGRESO_CLIENT_CP ? TEST_INGRESO_CLIENT_CP : "44100",
      pais: "MEX",
      regimen_fiscal: forIngreso ? "601" : PUBLICO_GENERAL_REGIMEN,
      estatus: "activo",
    } as never);
    console.log(`Cliente de prueba creado: ${client.id}`);
  } else {
    await client.update({
      rfc: targetRfc,
      razon_social: targetRazon,
      cp: forIngreso && TEST_INGRESO_CLIENT_CP ? TEST_INGRESO_CLIENT_CP : client.cp || "44100",
      regimen_fiscal: forIngreso ? client.regimen_fiscal || "601" : PUBLICO_GENERAL_REGIMEN,
      estatus: "activo",
    } as never);
  }
  if (!forIngreso) {
    await ensureUbicClientFiscal(client, tenant);
  }
  return client;
}

async function ensureTruck(tenantId: string): Promise<Truck> {
  let truck = await Truck.findOne({ where: { tenant_id: tenantId, estatus: "activo" } });
  if (!truck) {
    truck = await Truck.findOne({ where: { tenant_id: tenantId } });
    if (truck) await truck.update({ estatus: "activo" } as never);
  }
  if (!truck) throw new Error("No hay camiones en el tenant; crea al menos uno en catálogos");
  await ensureTruckFiscal(truck);
  return truck;
}

async function ensureUbicClientFiscal(client: Client, tenant: Tenant) {
  const patch: Record<string, string> = {};
  if (client.rfc === TEST_UBIC_CLIENT_RFC) {
    if (client.razon_social !== TEST_UBIC_CLIENT_RAZON) patch.razon_social = TEST_UBIC_CLIENT_RAZON;
    if (tenant.cp_fiscal && client.cp !== tenant.cp_fiscal) patch.cp = tenant.cp_fiscal;
    patch.regimen_fiscal = PUBLICO_GENERAL_REGIMEN;
  } else {
    if (!client.regimen_fiscal) patch.regimen_fiscal = "601";
    if (!client.cp) patch.cp = "44100";
  }
  if (!client.estado) patch.estado = "JAL";
  if (Object.keys(patch).length > 0) {
    await client.update(patch as never);
  }
}

async function setupTrip(
  tenantId: string,
  truckId: string,
  driverId: string,
  client: Client,
  label: string,
  tarifa: number,
) {
  const trip = await tripService.createTrip(tenantId, {
    truck_id: truckId,
    driver_id: driverId,
    client_id: client.id,
    origen: "Zapopan, JAL",
    destino: "Guadalajara, JAL",
    fecha_salida: new Date().toISOString(),
    km_inicial: 100000,
    tarifa,
    tipo_viaje: "local",
    num_factura: label.startsWith("ingreso") ? undefined : `PEND-${label}`,
  });

  await tripFiscalService.replaceUbicaciones(tenantId, trip.id, buildFiscalUbicaciones(client));

  return trip;
}

async function closeTripForReuse(tenantId: string, tripId: string, kmInicial: number, numFactura: string) {
  await tripService.closeTrip(tenantId, tripId, {
    km_final: kmInicial + 50,
    fecha_llegada: new Date().toISOString(),
    num_factura: numFactura,
  });
}

async function main() {
  await sequelize.authenticate();

  const tenant = await Tenant.findByPk(TENANT_ID);
  if (!tenant) throw new Error(`Tenant ${TENANT_ID} no encontrado`);

  console.log(`\n=== Tenant: ${tenant.razon_social} (${tenant.rfc}) ===`);
  console.log(`PAC: ${tenant.pac_proveedor} | Usuario: ${tenant.pac_usuario ?? "(vacío)"}`);

  await ensureSystemTripStatuses(TENANT_ID);

  const truck = await ensureTruck(TENANT_ID);
  const ubicClient = await ensureTestClient(tenant, false);
  const driver = await ensureTestDriver(TENANT_ID, truck.id);
  console.log(`Operador: ${driver.nombre} (${driver.id})`);
  console.log(`Camión: ${truck.placas ?? truck.numero_economico} (${truck.id})`);
  console.log(`Cliente ubicaciones: ${ubicClient.razon_social} (${ubicClient.id})`);
  if (TIMBRAR) {
    if (!TEST_INGRESO_CLIENT_RFC) {
      console.log(
        "Aviso: define SICOFI_TEST_INGRESO_CLIENT_RFC (+ opcional _RAZON y _CP) para timbrar ingreso",
      );
    }
    console.log(
      "Aviso traslado: si timbra CP107, el RFC del tenant debe coincidir con el CSD en Sicofi (receptor=emisor en tipo T).",
    );
  }
  console.log("");

  const results: Array<{
    label: string;
    tripId: string;
    folio: string;
    tipo: string;
    previewValid: boolean;
    previewIssues: string[];
    timbrado?: { uuid?: string; error?: string };
  }> = [];

  for (const caso of CASOS) {
    console.log(`--- ${caso.label} ---`);
    const tripClient = caso.tipo === "ingreso"
      ? await ensureTestClient(tenant, true)
      : ubicClient;
    const trip = await setupTrip(
      TENANT_ID,
      truck.id,
      driver.id,
      tripClient,
      caso.label,
      caso.tipo === "ingreso" ? 2500 : 0,
    );

    await tripFiscalService.addMercancia(TENANT_ID, trip.id, MERCANCIA);

    const preview = await cartaPorteService.previewCartaPorte(TENANT_ID, trip.id, caso.tipo);
    console.log(`  Viaje ${trip.folio} (${trip.id})`);
    console.log(`  Preview valid=${preview.valid}`);
    if (preview.issues.length) {
      console.log(`  Issues: ${preview.issues.join("; ")}`);
    } else {
      console.log(`  Payload tipo: ${(preview.payload_preview as { DatosCFDI40?: { TipodeComprobante?: string } })?.DatosCFDI40?.TipodeComprobante ?? "?"}`);
    }

    const entry: (typeof results)[number] = {
      label: caso.label,
      tripId: trip.id,
      folio: trip.folio,
      tipo: caso.tipo,
      previewValid: preview.valid,
      previewIssues: preview.issues,
    };

    if (TIMBRAR && preview.valid) {
      try {
        const cp = await cartaPorteService.timbrarCartaPorte(TENANT_ID, trip.id, caso.tipo);
        entry.timbrado = { uuid: cp.uuid ?? undefined };
        console.log(`  Timbrado OK: UUID=${cp.uuid} serie=${cp.serie} folio=${cp.folio_cfdi}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        entry.timbrado = { error: msg };
        console.log(`  Timbrado ERROR: ${msg}`);
      }
    } else if (TIMBRAR && !preview.valid) {
      console.log(`  Timbrado omitido (preview inválido)`);
    }

    results.push(entry);

    const facturaCierre = entry.timbrado?.uuid
      ? `CP-${entry.timbrado.uuid.slice(0, 8)}`
      : `TEST-${caso.label}`;
    try {
      await closeTripForReuse(TENANT_ID, trip.id, 100000, facturaCierre);
    } catch (e) {
      console.log(`  Aviso: no se pudo cerrar viaje: ${e instanceof Error ? e.message : e}`);
    }

    console.log("");
  }

  console.log("\n=== RESUMEN ===");
  for (const r of results) {
    const previewStatus = r.previewValid ? "OK preview" : "FAIL preview";
    const stamp = r.timbrado?.uuid ? ` | timbrado ${r.timbrado.uuid}` : r.timbrado?.error ? ` | error: ${r.timbrado.error}` : "";
    console.log(`${r.label}: ${r.folio} (${r.tripId}) [${r.tipo}] — ${previewStatus}${stamp}`);
  }

  await sequelize.close();
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
