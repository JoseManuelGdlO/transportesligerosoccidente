import { createContext, useContext, useMemo, useState, ReactNode } from "react";
import type { Truck, Driver, Client, Trip, FuelLoad, Expense } from "@/types/tlo";
import { mockTrucks, mockDrivers, mockClients, mockTrips } from "@/data/mockData";

interface TloState {
  trucks: Truck[];
  drivers: Driver[];
  clients: Client[];
  trips: Trip[];
  upsertTruck: (t: Truck) => void;
  upsertDriver: (d: Driver) => void;
  upsertClient: (c: Client) => void;
  createTrip: (t: Omit<Trip, "id" | "folio" | "fuel" | "expenses" | "estatus">) => Trip;
  updateTrip: (id: string, patch: Partial<Trip>) => void;
  addFuel: (tripId: string, fuel: Omit<FuelLoad, "id">) => void;
  removeFuel: (tripId: string, fuelId: string) => void;
  addExpense: (tripId: string, e: Omit<Expense, "id">) => void;
  removeExpense: (tripId: string, eid: string) => void;
  closeTrip: (id: string, data: { km_final: number; fecha_llegada: string; num_factura: string }) => void;
}

const TloCtx = createContext<TloState | null>(null);

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export const TloProvider = ({ children }: { children: ReactNode }) => {
  const [trucks, setTrucks] = useState<Truck[]>(mockTrucks);
  const [drivers, setDrivers] = useState<Driver[]>(mockDrivers);
  const [clients, setClients] = useState<Client[]>(mockClients);
  const [trips, setTrips] = useState<Trip[]>(mockTrips);

  const value = useMemo<TloState>(() => ({
    trucks, drivers, clients, trips,
    upsertTruck: (t) => setTrucks(prev => {
      const i = prev.findIndex(x => x.id === t.id);
      if (i === -1) return [...prev, { ...t, id: t.id || uid("t") }];
      const c = [...prev]; c[i] = t; return c;
    }),
    upsertDriver: (d) => setDrivers(prev => {
      const i = prev.findIndex(x => x.id === d.id);
      if (i === -1) return [...prev, { ...d, id: d.id || uid("d") }];
      const c = [...prev]; c[i] = d; return c;
    }),
    upsertClient: (c) => setClients(prev => {
      const i = prev.findIndex(x => x.id === c.id);
      if (i === -1) return [...prev, { ...c, id: c.id || uid("c") }];
      const cp = [...prev]; cp[i] = c; return cp;
    }),
    createTrip: (data) => {
      const id = uid("v");
      const year = new Date().getFullYear();
      const folio = `V-${year}-${String(149 + trips.length).padStart(4, "0")}`;
      const trip: Trip = { ...data, id, folio, fuel: [], expenses: [], estatus: "en_curso" };
      setTrips(prev => [trip, ...prev]);
      return trip;
    },
    updateTrip: (id, patch) => setTrips(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t)),
    addFuel: (tripId, fuel) => setTrips(prev => prev.map(t => t.id === tripId
      ? { ...t, fuel: [...t.fuel, { ...fuel, id: uid("f") }] }
      : t)),
    removeFuel: (tripId, fuelId) => setTrips(prev => prev.map(t => t.id === tripId
      ? { ...t, fuel: t.fuel.filter(f => f.id !== fuelId) }
      : t)),
    addExpense: (tripId, e) => setTrips(prev => prev.map(t => t.id === tripId
      ? { ...t, expenses: [...t.expenses, { ...e, id: uid("e") }] }
      : t)),
    removeExpense: (tripId, eid) => setTrips(prev => prev.map(t => t.id === tripId
      ? { ...t, expenses: t.expenses.filter(e => e.id !== eid) }
      : t)),
    closeTrip: (id, data) => setTrips(prev => prev.map(t => t.id === id
      ? { ...t, ...data, estatus: "cerrado" as const }
      : t)),
  }), [trucks, drivers, clients, trips]);

  return <TloCtx.Provider value={value}>{children}</TloCtx.Provider>;
};

export const useTlo = () => {
  const v = useContext(TloCtx);
  if (!v) throw new Error("useTlo debe usarse dentro de TloProvider");
  return v;
};