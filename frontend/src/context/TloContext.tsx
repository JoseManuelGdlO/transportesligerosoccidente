import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Truck, Driver, Client, Trip, FuelLoad, Expense, SystemUser, RoleDefinition, Permission, UserRole } from "@/types/tlo";
import { mockTrucks, mockDrivers, mockClients, mockTrips, mockSystemUsers, mockRoles } from "@/data/mockData";
import { hasApiConfigured, apiFetch, readJson } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  fetchTloCatalog,
  fetchUsersAndRoles,
  normalizeTrip,
  normalizeFuel,
  normalizeExpense,
} from "@/lib/tloApi";
import {
  SYSTEM_STATUS_CERRADO,
  SYSTEM_STATUS_EN_CURSO,
  assertNoOpenTripConflictLocal,
} from "@/lib/tripStatus";

interface TloState {
  trucks: Truck[];
  drivers: Driver[];
  clients: Client[];
  trips: Trip[];
  systemUsers: SystemUser[];
  roles: RoleDefinition[];
  catalogLoading: boolean;
  catalogError: string | null;
  reloadCatalog: () => Promise<void>;
  upsertTruck: (t: Truck) => Promise<void>;
  upsertDriver: (d: Driver) => void;
  upsertClient: (c: Client) => Promise<void>;
  upsertSystemUser: (u: SystemUser, password?: string) => Promise<void>;
  toggleSystemUserStatus: (id: string) => void;
  updateRolePermissions: (role: UserRole, permisos: Permission[]) => void;
  createTrip: (t: Omit<Trip, "id" | "folio" | "fuel" | "expenses" | "statuses">) => Promise<Trip>;
  updateTrip: (id: string, patch: Partial<Trip>) => void;
  replaceTrip: (trip: Trip) => void;
  addFuel: (tripId: string, fuel: Omit<FuelLoad, "id">) => void;
  removeFuel: (tripId: string, fuelId: string) => void;
  addExpense: (tripId: string, e: Omit<Expense, "id">) => void;
  removeExpense: (tripId: string, eid: string) => void;
  closeTrip: (id: string, data: { km_final: number; fecha_llegada: string; num_factura: string }) => void;
  /** Marca la unidad como baja (no borra el registro en base de datos). */
  deleteTruck: (id: string) => Promise<void>;
  /** Marca el operador como inactivo / baja lógica (no borra el registro). */
  deleteDriver: (id: string) => Promise<void>;
}

const TloCtx = createContext<TloState | null>(null);

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mockNextFolio(truckId: string, trucks: Truck[], trips: Trip[]): string {
  const truck = trucks.find((x) => x.id === truckId);
  const eco = truck?.numero_economico.trim() || "VIAJE";
  const re = new RegExp(`^${escapeRegex(eco)}-(\\d+)$`);
  let maxSeq = 0;
  for (const trip of trips) {
    if (trip.truck_id !== truckId) continue;
    const m = trip.folio.match(re);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return `${eco}-${maxSeq + 1}`;
}

export const TloProvider = ({ children }: { children: ReactNode }) => {
  const { user, permissions, hasApiSession } = useAuth();
  const apiLive = hasApiConfigured() && hasApiSession && !!user;
  const canManageUsers = permissions.includes("usuarios.gestionar");

  const [trucks, setTrucks] = useState<Truck[]>(() => (hasApiConfigured() ? [] : mockTrucks));
  const [drivers, setDrivers] = useState<Driver[]>(() => (hasApiConfigured() ? [] : mockDrivers));
  const [clients, setClients] = useState<Client[]>(() => (hasApiConfigured() ? [] : mockClients));
  const [trips, setTrips] = useState<Trip[]>(() => (hasApiConfigured() ? [] : mockTrips));
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>(() => (hasApiConfigured() ? [] : mockSystemUsers));
  const [roles, setRoles] = useState<RoleDefinition[]>(() => (hasApiConfigured() ? [] : mockRoles));
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const reloadCatalog = useCallback(async () => {
    if (!hasApiConfigured() || !user || !hasApiSession) return;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const c = await fetchTloCatalog();
      setTrucks(c.trucks);
      setDrivers(c.drivers);
      setClients(c.clients);
      setTrips(c.trips);
      if (canManageUsers) {
        const ur = await fetchUsersAndRoles();
        setSystemUsers(ur.systemUsers);
        setRoles(ur.roles);
      } else {
        setSystemUsers([]);
        setRoles([]);
      }
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setCatalogLoading(false);
    }
  }, [user, canManageUsers, hasApiSession]);

  useEffect(() => {
    if (!hasApiConfigured()) return;
    if (!user) {
      setTrucks([]);
      setDrivers([]);
      setClients([]);
      setTrips([]);
      setSystemUsers([]);
      setRoles([]);
      setCatalogError(null);
      return;
    }
    if (!hasApiSession) {
      setTrucks(mockTrucks);
      setDrivers(mockDrivers);
      setClients(mockClients);
      setTrips(mockTrips);
      setSystemUsers(mockSystemUsers);
      setRoles(mockRoles);
      setCatalogError(null);
      setCatalogLoading(false);
      return;
    }
    void reloadCatalog();
  }, [user?.id, hasApiSession, reloadCatalog]);

  const upsertTruck = useCallback(
    async (t: Truck) => {
      if (apiLive) {
        try {
          const body = {
            numero_economico: t.numero_economico,
            placas: t.placas,
            folio_tag: t.folio_tag || undefined,
            marca: t.marca,
            modelo: t.modelo,
            anio: t.anio,
            rendimiento_esperado: t.rendimiento_esperado,
            costo_km_ref: t.costo_km_ref,
            estatus: t.estatus,
            config_vehicular: t.config_vehicular || undefined,
            perm_sct: t.perm_sct || undefined,
            num_permiso_sct: t.num_permiso_sct || undefined,
            peso_bruto_vehicular: t.peso_bruto_vehicular || undefined,
            aseguradora_resp_civil: t.aseguradora_resp_civil || undefined,
            poliza_resp_civil: t.poliza_resp_civil || undefined,
            vin: t.vin || undefined,
            capacidad_carga_kg: t.capacidad_carga_kg || undefined,
          };
          if (t.id) {
            const r = await apiFetch(`/trucks/${t.id}`, { method: "PATCH", body: JSON.stringify(body) });
            await readJson(r);
          } else {
            const r = await apiFetch("/trucks", { method: "POST", body: JSON.stringify(body) });
            await readJson(r);
          }
          await reloadCatalog();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Error al guardar camión";
          setCatalogError(msg);
          throw e;
        }
        return;
      }
      setTrucks((prev) => {
        const i = prev.findIndex((x) => x.id === t.id);
        if (i === -1) return [...prev, { ...t, id: t.id || uid("t") }];
        const c = [...prev];
        c[i] = t;
        return c;
      });
    },
    [apiLive, reloadCatalog],
  );

  const deleteTruck = useCallback(
    async (id: string) => {
      if (apiLive) {
        try {
          const r = await apiFetch(`/trucks/${id}`, { method: "DELETE" });
          await readJson(r);
          await reloadCatalog();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Error al dar de baja el camión";
          setCatalogError(msg);
          throw e;
        }
        return;
      }
      setTrucks((prev) => prev.filter((x) => x.id !== id));
    },
    [apiLive, reloadCatalog],
  );

  const deleteDriver = useCallback(
    async (id: string) => {
      if (apiLive) {
        try {
          const r = await apiFetch(`/drivers/${id}`, { method: "DELETE" });
          await readJson(r);
          await reloadCatalog();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Error al dar de baja el operador";
          setCatalogError(msg);
          throw e;
        }
        return;
      }
      setDrivers((prev) => prev.filter((x) => x.id !== id));
    },
    [apiLive, reloadCatalog],
  );

  const upsertDriver = useCallback(
    (d: Driver) => {
      if (apiLive) {
        void (async () => {
          try {
            const body = {
              nombre: d.nombre,
              telefono: d.telefono,
              licencia: d.licencia,
              fecha_ingreso: d.fecha_ingreso.slice(0, 10),
              comision_tipo: d.comision_tipo,
              comision_valor_local: d.comision_valor_local,
              comision_valor_foraneo: d.comision_valor_foraneo,
              estatus: d.estatus,
              rfc: d.rfc || undefined,
              licencia_federal: d.licencia_federal || undefined,
              tipo_figura: d.tipo_figura || "01",
              curp: d.curp || undefined,
              email: d.email || undefined,
              numero_empleado: d.numero_empleado || undefined,
              calle: d.calle || undefined,
              numero_exterior: d.numero_exterior || undefined,
              numero_interior: d.numero_interior || undefined,
              colonia: d.colonia || undefined,
              localidad: d.localidad || undefined,
              municipio: d.municipio || undefined,
              estado: d.estado || undefined,
              cp: d.cp || undefined,
              pais: d.pais || undefined,
              truck_id: d.truck_id || null,
              puesto: d.puesto || undefined,
            };
            if (d.id) {
              const r = await apiFetch(`/drivers/${d.id}`, { method: "PATCH", body: JSON.stringify(body) });
              await readJson(r);
            } else {
              const r = await apiFetch("/drivers", { method: "POST", body: JSON.stringify(body) });
              await readJson(r);
            }
            await reloadCatalog();
          } catch (e) {
            setCatalogError(e instanceof Error ? e.message : "Error al guardar operador");
          }
        })();
        return;
      }
      setDrivers((prev) => {
        const i = prev.findIndex((x) => x.id === d.id);
        if (i === -1) return [...prev, { ...d, id: d.id || uid("d") }];
        const c = [...prev];
        c[i] = d;
        return c;
      });
    },
    [apiLive, reloadCatalog],
  );

  const upsertClient = useCallback(
    async (c: Client) => {
      if (apiLive) {
        try {
          const body = {
            razon_social: c.razon_social,
            rfc: c.rfc,
            contacto: c.contacto,
            telefono: c.telefono,
            calle: c.calle || undefined,
            colonia: c.colonia || undefined,
            municipio: c.municipio || undefined,
            estado: c.estado || undefined,
            cp: c.cp || undefined,
            pais: c.pais || undefined,
            numero_exterior: c.numero_exterior || undefined,
            numero_interior: c.numero_interior || undefined,
            localidad: c.localidad || undefined,
            email: c.email || undefined,
            regimen_fiscal: c.regimen_fiscal || undefined,
            estatus: c.estatus || "activo",
            observaciones: c.observaciones || undefined,
          };
          if (c.id) {
            const r = await apiFetch(`/clients/${c.id}`, { method: "PATCH", body: JSON.stringify(body) });
            await readJson(r);
          } else {
            const r = await apiFetch("/clients", { method: "POST", body: JSON.stringify(body) });
            await readJson(r);
          }
          await reloadCatalog();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Error al guardar cliente";
          setCatalogError(msg);
          throw e;
        }
        return;
      }
      setClients((prev) => {
        const i = prev.findIndex((x) => x.id === c.id);
        if (i === -1) return [...prev, { ...c, id: c.id || uid("c") }];
        const cp = [...prev];
        cp[i] = c;
        return cp;
      });
    },
    [apiLive, reloadCatalog],
  );

  const upsertSystemUser = useCallback(
    async (u: SystemUser, password?: string) => {
      if (apiLive) {
        try {
          if (u.id) {
            const body: Record<string, unknown> = {
              nombre: u.nombre,
              email: u.email,
              role: u.role,
              estatus: u.estatus,
            };
            if (password && password.length > 0) body.password = password;
            const r = await apiFetch(`/users/${u.id}`, {
              method: "PATCH",
              body: JSON.stringify(body),
            });
            await readJson(r);
          } else {
            if (!password || password.length < 6) {
              throw new Error("La contraseña debe tener al menos 6 caracteres");
            }
            const r = await apiFetch("/users", {
              method: "POST",
              body: JSON.stringify({
                nombre: u.nombre,
                email: u.email,
                role: u.role,
                estatus: u.estatus,
                password,
              }),
            });
            await readJson(r);
          }
          await reloadCatalog();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Error al guardar usuario";
          setCatalogError(msg);
          throw e;
        }
        return;
      }
      setSystemUsers((prev) => {
        const i = prev.findIndex((x) => x.id === u.id);
        if (i === -1) return [...prev, { ...u, id: u.id || uid("u"), creado_en: u.creado_en || new Date().toISOString() }];
        const c = [...prev];
        c[i] = u;
        return c;
      });
    },
    [apiLive, reloadCatalog],
  );

  const toggleSystemUserStatus = useCallback(
    (id: string) => {
      if (apiLive) {
        void (async () => {
          try {
            const u = systemUsers.find((x) => x.id === id);
            if (!u) return;
            const next = u.estatus === "activo" ? "inactivo" : "activo";
            const r = await apiFetch(`/users/${id}/status`, {
              method: "PATCH",
              body: JSON.stringify({ estatus: next }),
            });
            await readJson(r);
            await reloadCatalog();
          } catch (e) {
            setCatalogError(e instanceof Error ? e.message : "Error al cambiar estatus");
          }
        })();
        return;
      }
      setSystemUsers((prev) =>
        prev.map((x) => (x.id === id ? { ...x, estatus: x.estatus === "activo" ? "inactivo" : "activo" } : x)),
      );
    },
    [apiLive, reloadCatalog, systemUsers],
  );

  const updateRolePermissions = useCallback(
    (role: UserRole, permisos: Permission[]) => {
      if (role === "admin") return;
      if (apiLive) {
        void (async () => {
          try {
            const r = await apiFetch(`/roles/${role}/permissions`, {
              method: "PUT",
              body: JSON.stringify({ permisos }),
            });
            await readJson(r);
            await reloadCatalog();
          } catch (e) {
            setCatalogError(e instanceof Error ? e.message : "Error al actualizar permisos");
          }
        })();
        return;
      }
      setRoles((prev) => prev.map((x) => (x.role === role ? { ...x, permisos } : x)));
    },
    [apiLive, reloadCatalog],
  );

  const createTrip = useCallback(
    async (data: Omit<Trip, "id" | "folio" | "fuel" | "expenses" | "statuses">): Promise<Trip> => {
      if (apiLive) {
        try {
          const body: Record<string, unknown> = {
            truck_id: data.truck_id,
            driver_id: data.driver_id,
            client_id: data.client_id,
            fecha_salida: data.fecha_salida,
            km_inicial: data.km_inicial,
            tarifa: data.tarifa,
            viaticos_entregados: data.viaticos_entregados ?? 0,
            tipo_viaje: data.tipo_viaje ?? "local",
            ...(data.num_factura?.trim() ? { num_factura: data.num_factura.trim() } : {}),
            ...(data.route_id ? { route_id: data.route_id } : {}),
          };
          if (data.paradas && data.paradas.length >= 2) {
            body.paradas = data.paradas.map((p) =>
              p.client_ubicacion_id
                ? { etiqueta: p.etiqueta, client_ubicacion_id: p.client_ubicacion_id }
                : p.etiqueta,
            );
          } else {
            body.origen = data.origen;
            body.destino = data.destino;
          }
          const r = await apiFetch("/trips", {
            method: "POST",
            body: JSON.stringify(body),
          });
          const j = await readJson<Record<string, unknown>>(r);
          const trip = normalizeTrip(j);
          setTrips((prev) => [trip, ...prev.filter((x) => x.id !== trip.id)]);
          return trip;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Error al crear viaje";
          setCatalogError(msg);
          throw e;
        }
      }
      assertNoOpenTripConflictLocal(
        trips,
        { truck_id: data.truck_id, driver_id: data.driver_id },
        { trucks, drivers },
      );
      const id = uid("v");
      const folio = mockNextFolio(data.truck_id, trucks, trips);
      const trip: Trip = {
        ...data,
        id,
        folio,
        fuel: [],
        expenses: [],
        tipo_viaje: data.tipo_viaje ?? "local",
        statuses: [SYSTEM_STATUS_EN_CURSO],
      };
      setTrips((prev) => [trip, ...prev]);
      return trip;
    },
    [apiLive, trucks, drivers, trips],
  );

  const updateTrip = useCallback(
    (id: string, patch: Partial<Trip>) => {
      if (apiLive) {
        void (async () => {
          try {
            const body: Record<string, unknown> = { ...patch };
            if (patch.fecha_salida) body.fecha_salida = patch.fecha_salida;
            if (patch.paradas && patch.paradas.length >= 2) {
              body.paradas = patch.paradas.map((p) =>
                p.client_ubicacion_id
                  ? { etiqueta: p.etiqueta, client_ubicacion_id: p.client_ubicacion_id }
                  : p.etiqueta,
              );
              delete body.origen;
              delete body.destino;
            }
            const r = await apiFetch(`/trips/${id}`, { method: "PATCH", body: JSON.stringify(body) });
            const j = await readJson<Record<string, unknown>>(r);
            const next = normalizeTrip(j);
            setTrips((prev) => prev.map((t) => (t.id === id ? next : t)));
          } catch (e) {
            setCatalogError(e instanceof Error ? e.message : "Error al actualizar viaje");
          }
        })();
        return;
      }
      setTrips((prev) => {
        const current = prev.find((t) => t.id === id);
        if (!current) return prev;
        if (patch.truck_id !== undefined || patch.driver_id !== undefined) {
          assertNoOpenTripConflictLocal(
            prev,
            {
              truck_id: patch.truck_id ?? current.truck_id,
              driver_id: patch.driver_id ?? current.driver_id,
              excludeTripId: id,
            },
            { trucks, drivers },
          );
        }
        return prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      });
    },
    [apiLive, trucks, drivers],
  );

  const replaceTrip = useCallback((trip: Trip) => {
    setTrips((prev) => prev.map((t) => (t.id === trip.id ? trip : t)));
  }, []);

  const addFuel = useCallback(
    (tripId: string, fuel: Omit<FuelLoad, "id">) => {
      if (apiLive) {
        void (async () => {
          try {
            const r = await apiFetch(`/trips/${tripId}/fuel`, {
              method: "POST",
              body: JSON.stringify({
                litros: fuel.litros,
                precio_litro: fuel.precio_litro,
                ubicacion: fuel.ubicacion,
                fecha: fuel.fecha,
                es_foraneo: fuel.es_foraneo ?? false,
                estacion_nombre: fuel.estacion_nombre,
                es_estacion_empresa: fuel.es_estacion_empresa,
                comprobante_url: fuel.comprobante_url,
              }),
            });
            const j = await readJson<Record<string, unknown>>(r);
            const row = normalizeFuel(j);
            setTrips((prev) =>
              prev.map((t) => (t.id === tripId ? { ...t, fuel: [...t.fuel, row] } : t)),
            );
          } catch (e) {
            setCatalogError(e instanceof Error ? e.message : "Error al registrar diesel");
          }
        })();
        return;
      }
      setTrips((prev) =>
        prev.map((t) =>
          t.id === tripId ? { ...t, fuel: [...t.fuel, { ...fuel, id: uid("f") }] } : t,
        ),
      );
    },
    [apiLive],
  );

  const removeFuel = useCallback(
    (tripId: string, fuelId: string) => {
      if (apiLive) {
        void (async () => {
          try {
            const r = await apiFetch(`/trips/${tripId}/fuel/${fuelId}`, { method: "DELETE" });
            if (!r.ok) await readJson(r);
            setTrips((prev) =>
              prev.map((t) => (t.id === tripId ? { ...t, fuel: t.fuel.filter((f) => f.id !== fuelId) } : t)),
            );
          } catch (e) {
            setCatalogError(e instanceof Error ? e.message : "Error al eliminar carga");
          }
        })();
        return;
      }
      setTrips((prev) =>
        prev.map((t) => (t.id === tripId ? { ...t, fuel: t.fuel.filter((f) => f.id !== fuelId) } : t)),
      );
    },
    [apiLive],
  );

  const addExpense = useCallback(
    (tripId: string, e: Omit<Expense, "id">) => {
      if (apiLive) {
        void (async () => {
          try {
            const r = await apiFetch(`/trips/${tripId}/expenses`, {
              method: "POST",
              body: JSON.stringify({
                categoria: e.categoria,
                tipo: e.tipo ?? "gasto",
                descripcion: e.descripcion,
                monto: e.monto,
                comprobado: e.comprobado,
                visible_en_liquidacion: e.tipo === "ingreso" ? e.visible_en_liquidacion : false,
                fecha: e.fecha,
              }),
            });
            const j = await readJson<Record<string, unknown>>(r);
            const row = normalizeExpense(j);
            setTrips((prev) =>
              prev.map((t) => (t.id === tripId ? { ...t, expenses: [...t.expenses, row] } : t)),
            );
          } catch (err) {
            setCatalogError(err instanceof Error ? err.message : "Error al registrar gasto");
          }
        })();
        return;
      }
      setTrips((prev) =>
        prev.map((t) =>
          t.id === tripId ? { ...t, expenses: [...t.expenses, { ...e, id: uid("e") }] } : t,
        ),
      );
    },
    [apiLive],
  );

  const removeExpense = useCallback(
    (tripId: string, eid: string) => {
      if (apiLive) {
        void (async () => {
          try {
            const r = await apiFetch(`/trips/${tripId}/expenses/${eid}`, { method: "DELETE" });
            if (!r.ok) await readJson(r);
            setTrips((prev) =>
              prev.map((t) =>
                t.id === tripId ? { ...t, expenses: t.expenses.filter((e) => e.id !== eid) } : t,
              ),
            );
          } catch (e) {
            setCatalogError(e instanceof Error ? e.message : "Error al eliminar gasto");
          }
        })();
        return;
      }
      setTrips((prev) =>
        prev.map((t) =>
          t.id === tripId ? { ...t, expenses: t.expenses.filter((e) => e.id !== eid) } : t,
        ),
      );
    },
    [apiLive],
  );

  const closeTrip = useCallback(
    (id: string, data: { km_final: number; fecha_llegada: string; num_factura: string }) => {
      if (apiLive) {
        void (async () => {
          try {
            const r = await apiFetch(`/trips/${id}/close`, {
              method: "POST",
              body: JSON.stringify(data),
            });
            const j = await readJson<Record<string, unknown>>(r);
            const next = normalizeTrip(j);
            setTrips((prev) => prev.map((t) => (t.id === id ? next : t)));
          } catch (e) {
            setCatalogError(e instanceof Error ? e.message : "Error al cerrar viaje");
          }
        })();
        return;
      }
      setTrips((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                ...data,
                statuses: t.statuses
                  .filter((s) => s.slug !== "en_curso")
                  .concat(SYSTEM_STATUS_CERRADO),
              }
            : t,
        ),
      );
    },
    [apiLive],
  );

  const value = useMemo<TloState>(
    () => ({
      trucks,
      drivers,
      clients,
      trips,
      systemUsers,
      roles,
      catalogLoading,
      catalogError,
      reloadCatalog,
      upsertTruck,
      upsertDriver,
      upsertClient,
      upsertSystemUser,
      toggleSystemUserStatus,
      updateRolePermissions,
      createTrip,
      updateTrip,
      replaceTrip,
      addFuel,
      removeFuel,
      addExpense,
      removeExpense,
      closeTrip,
      deleteTruck,
      deleteDriver,
    }),
    [
      trucks,
      drivers,
      clients,
      trips,
      systemUsers,
      roles,
      catalogLoading,
      catalogError,
      reloadCatalog,
      upsertTruck,
      upsertDriver,
      upsertClient,
      upsertSystemUser,
      toggleSystemUserStatus,
      updateRolePermissions,
      createTrip,
      updateTrip,
      replaceTrip,
      addFuel,
      removeFuel,
      addExpense,
      removeExpense,
      closeTrip,
      deleteTruck,
      deleteDriver,
    ],
  );

  return <TloCtx.Provider value={value}>{children}</TloCtx.Provider>;
};

export const useTlo = () => {
  const v = useContext(TloCtx);
  if (!v) throw new Error("useTlo debe usarse dentro de TloProvider");
  return v;
};
