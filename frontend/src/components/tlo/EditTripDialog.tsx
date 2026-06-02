import { useCallback, useEffect, useState } from "react";
import { useTlo } from "@/context/TloContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TripParadasEditor,
  paradasToTripStops,
  tripStopsToParadas,
  type ParadaDraft,
} from "@/components/tlo/TripParadasEditor";
import { hasApiConfigured } from "@/lib/api";
import { fetchRoutes, patchTrip } from "@/lib/tloApi";
import type { RouteCatalog, Trip, TripType } from "@/types/tlo";
import { toast } from "sonner";

type TripForm = {
  truck_id: string;
  driver_id: string;
  client_id: string;
  num_factura: string;
  fecha_salida: string;
  km_inicial: number;
  tarifa: number;
  viaticos_entregados: number;
  tipo_viaje: TripType;
};

const emptyParadas = (): ParadaDraft[] => [{ etiqueta: "" }, { etiqueta: "" }];

function tripToForm(trip: Trip): TripForm {
  const fecha = trip.fecha_salida;
  const fechaLocal =
    fecha.length >= 16 ? fecha.slice(0, 16) : new Date(fecha).toISOString().slice(0, 16);
  return {
    truck_id: trip.truck_id,
    driver_id: trip.driver_id,
    client_id: trip.client_id,
    num_factura: trip.num_factura ?? "",
    fecha_salida: fechaLocal,
    km_inicial: trip.km_inicial,
    tarifa: trip.tarifa,
    viaticos_entregados: trip.viaticos_entregados,
    tipo_viaje: trip.tipo_viaje ?? "local",
  };
}

function tripToParadas(trip: Trip): ParadaDraft[] {
  if (trip.paradas && trip.paradas.length >= 2) {
    return tripStopsToParadas(trip.paradas);
  }
  return [{ etiqueta: trip.origen }, { etiqueta: trip.destino }];
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip;
  onSaved: (trip: Trip) => void;
};

export function EditTripDialog({ open, onOpenChange, trip, onSaved }: Props) {
  const { trucks, drivers, clients } = useTlo();
  const apiMode = hasApiConfigured();
  const paradasLocked = trip.carta_porte?.estatus === "timbrada";

  const [form, setForm] = useState<TripForm>(() => tripToForm(trip));
  const [paradas, setParadas] = useState<ParadaDraft[]>(() => tripToParadas(trip));
  const [selectedRouteId, setSelectedRouteId] = useState<string>("__custom__");
  const [catalogRoutes, setCatalogRoutes] = useState<RouteCatalog[]>([]);
  const [saving, setSaving] = useState(false);

  const loadRoutes = useCallback(async (clientId: string) => {
    if (!apiMode || !clientId) {
      setCatalogRoutes([]);
      return;
    }
    try {
      const rows = await fetchRoutes({ client_id: clientId, all: true });
      setCatalogRoutes(rows.filter((r) => r.estatus === "activo"));
    } catch {
      setCatalogRoutes([]);
    }
  }, [apiMode]);

  useEffect(() => {
    if (!open) return;
    setForm(tripToForm(trip));
    setParadas(tripToParadas(trip));
    setSelectedRouteId(trip.route_id ?? "__custom__");
  }, [open, trip]);

  useEffect(() => {
    if (open && form.client_id) void loadRoutes(form.client_id);
    else if (!open) setCatalogRoutes([]);
  }, [open, form.client_id, loadRoutes]);

  const applyRoute = (routeId: string) => {
    setSelectedRouteId(routeId);
    if (routeId === "__custom__") return;
    const r = catalogRoutes.find((x) => x.id === routeId);
    if (!r) return;
    setParadas(
      r.paradas.map((p) => ({
        etiqueta: p.etiqueta,
        client_ubicacion_id: p.client_ubicacion_id,
      })),
    );
    if (r.tipo_viaje) setForm((f) => ({ ...f, tipo_viaje: r.tipo_viaje! }));
  };

  const submit = async () => {
    if (!form.truck_id || !form.driver_id || !form.client_id) {
      toast.error("Selecciona camión, operador y cliente");
      return;
    }
    const validParadas = paradas.filter((p) => p.etiqueta.trim());
    if (!paradasLocked && validParadas.length < 2) {
      toast.error("Indica al menos 2 paradas en la ruta");
      return;
    }

    const stops = paradasLocked ? undefined : paradasToTripStops(validParadas);
    const patch: Record<string, unknown> = {
      truck_id: form.truck_id,
      driver_id: form.driver_id,
      client_id: form.client_id,
      fecha_salida: new Date(form.fecha_salida).toISOString(),
      km_inicial: +form.km_inicial,
      tarifa: +form.tarifa,
      viaticos_entregados: +form.viaticos_entregados,
      tipo_viaje: form.tipo_viaje,
      num_factura: form.num_factura.trim() || undefined,
      route_id: selectedRouteId !== "__custom__" ? selectedRouteId : null,
    };
    if (stops) {
      patch.paradas = stops;
    }

    setSaving(true);
    try {
      if (apiMode) {
        const updated = await patchTrip(trip.id, patch);
        onSaved(updated);
        toast.success("Viaje actualizado");
        onOpenChange(false);
        return;
      }
      const mergedStops = stops ?? (trip.paradas && trip.paradas.length >= 2 ? trip.paradas : paradasToTripStops(validParadas));
      const updated: Trip = {
        ...trip,
        truck_id: form.truck_id,
        driver_id: form.driver_id,
        client_id: form.client_id,
        origen: mergedStops[0].etiqueta,
        destino: mergedStops[mergedStops.length - 1].etiqueta,
        paradas: mergedStops,
        route_id: selectedRouteId !== "__custom__" ? selectedRouteId : undefined,
        fecha_salida: new Date(form.fecha_salida).toISOString(),
        km_inicial: +form.km_inicial,
        tarifa: +form.tarifa,
        viaticos_entregados: +form.viaticos_entregados,
        tipo_viaje: form.tipo_viaje,
        num_factura: form.num_factura.trim() || undefined,
      };
      onSaved(updated);
      toast.success("Viaje actualizado (demo)");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el viaje");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar viaje {trip.folio}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Camión</Label>
            <Select value={form.truck_id} onValueChange={(v) => setForm({ ...form, truck_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {trucks
                  .filter((t) => t.estatus === "activo")
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.numero_economico} · {t.placas}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Operador</Label>
            <Select value={form.driver_id} onValueChange={(v) => setForm({ ...form, driver_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {drivers
                  .filter((d) => d.estatus === "activo")
                  .map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Cliente</Label>
            <Select
              value={form.client_id}
              onValueChange={(v) => {
                setForm({ ...form, client_id: v });
                setSelectedRouteId("__custom__");
                if (v !== trip.client_id) setParadas(emptyParadas());
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.razon_social}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.client_id && apiMode && (
            <div className="col-span-2">
              <Label>Ruta del catálogo</Label>
              <Select value={selectedRouteId} onValueChange={applyRoute} disabled={paradasLocked}>
                <SelectTrigger>
                  <SelectValue placeholder="Personalizada o del catálogo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__custom__">Personalizada (editar paradas)</SelectItem>
                  {catalogRoutes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre} — {r.ruta_resumen}
                      {r.client_id ? "" : " (global)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2">
            {paradasLocked && (
              <p className="text-xs text-muted-foreground mb-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
                La carta porte está timbrada: no se pueden modificar las paradas de la ruta.
              </p>
            )}
            <TripParadasEditor
              paradas={paradas}
              disabled={paradasLocked}
              onChange={(p) => {
                setParadas(p);
                setSelectedRouteId("__custom__");
              }}
            />
          </div>
          <div className="col-span-2">
            <Label>Número de factura</Label>
            <Input
              value={form.num_factura}
              onChange={(e) => setForm({ ...form, num_factura: e.target.value })}
              placeholder="F-8826 (opcional)"
            />
          </div>
          <div>
            <Label>Fecha y hora salida</Label>
            <Input
              type="datetime-local"
              value={form.fecha_salida}
              onChange={(e) => setForm({ ...form, fecha_salida: e.target.value })}
            />
          </div>
          <div>
            <Label>Kilometraje inicial</Label>
            <Input
              type="number"
              value={form.km_inicial}
              onChange={(e) => setForm({ ...form, km_inicial: +e.target.value })}
            />
          </div>
          <div>
            <Label>Tarifa pactada (MXN)</Label>
            <Input
              type="number"
              value={form.tarifa}
              onChange={(e) => setForm({ ...form, tarifa: +e.target.value })}
            />
          </div>
          <div>
            <Label>Tipo de viaje</Label>
            <Select
              value={form.tipo_viaje}
              onValueChange={(v) => setForm({ ...form, tipo_viaje: v as TripType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="foraneo">Foráneo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Viáticos entregados</Label>
            <Input
              type="number"
              value={form.viaticos_entregados}
              onChange={(e) => setForm({ ...form, viaticos_entregados: +e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
