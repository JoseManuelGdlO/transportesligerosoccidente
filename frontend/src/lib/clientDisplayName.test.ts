import { describe, expect, it } from "vitest";
import type { Client, Trip } from "@/types/tlo";
import {
  clientDisplayName,
  settlementSummaryWithClientNames,
  tripClientDisplayName,
} from "@/lib/clientDisplayName";
import type { SettlementSummary } from "@/lib/calc";

const client: Client = {
  id: "c1",
  razon_social: "Comercializadora del Bajío SA de CV",
  alias: "Bajío",
  rfc: "CBA850912ABC",
  contacto: "Ana",
  telefono: "477",
};

const trip: Trip = {
  id: "t1",
  folio: "1001",
  truck_id: "tr1",
  driver_id: "d1",
  client_id: "c1",
  client_nombre: "Comercializadora del Bajío SA de CV",
  origen: "Gdl",
  destino: "León",
  fecha_salida: "2026-05-12T08:00:00",
  tarifa: 1000,
  km_inicial: 1,
  tipo_viaje: "local",
  statuses: [],
  fuel: [],
  expenses: [],
  viaticos_entregados: 0,
};

describe("clientDisplayName", () => {
  it("devuelve la razón social si el check está apagado", () => {
    expect(clientDisplayName(client, false)).toBe("Comercializadora del Bajío SA de CV");
  });

  it("usa el alias cuando el check está activo", () => {
    expect(clientDisplayName(client, true)).toBe("Bajío");
  });

  it("cae a la razón social si no hay alias", () => {
    expect(clientDisplayName({ ...client, alias: "   " }, true)).toBe(
      "Comercializadora del Bajío SA de CV",
    );
    expect(clientDisplayName({ ...client, alias: null }, true)).toBe(
      "Comercializadora del Bajío SA de CV",
    );
  });
});

describe("tripClientDisplayName", () => {
  it("resuelve el alias desde el catálogo de clientes", () => {
    expect(tripClientDisplayName(trip, [client], true)).toBe("Bajío");
  });

  it("usa el nombre guardado en el viaje si el cliente ya no está", () => {
    expect(tripClientDisplayName(trip, [], true)).toBe("Comercializadora del Bajío SA de CV");
  });
});

describe("settlementSummaryWithClientNames", () => {
  const summary = { trips: [trip] } as SettlementSummary;

  it("no muta los viajes si el check está apagado", () => {
    expect(settlementSummaryWithClientNames(summary, [client], false)).toBe(summary);
  });

  it("sustituye client_nombre por el alias cuando el check está activo", () => {
    const next = settlementSummaryWithClientNames(summary, [client], true);
    expect(next.trips[0]?.client_nombre).toBe("Bajío");
    expect(summary.trips[0]?.client_nombre).toBe("Comercializadora del Bajío SA de CV");
  });
});
