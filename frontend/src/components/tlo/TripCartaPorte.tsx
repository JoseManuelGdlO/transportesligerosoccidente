import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, readJson } from "@/lib/api";
import {
  fetchClientUbicaciones,
  normalizeCartaPorte,
  normalizeTrip,
  putTripUbicaciones,
} from "@/lib/tloApi";
import type { ClientUbicacion, Driver, Trip, TripMercancia, Truck } from "@/types/tlo";
import { useAuth } from "@/context/AuthContext";
import { FileCheck, Plus, Trash2, Stamp, AlertCircle, Truck as TruckIcon, User } from "lucide-react";
import { toast } from "sonner";
import { tripIsOpen } from "@/lib/tripStatus";

type Props = {
  trip: Trip;
  clientId?: string;
  clientRfc?: string;
  clientName?: string;
  driver?: Driver;
  truck?: Truck;
  onTripUpdated: (trip: Trip) => void;
};

const emptyUbic = () => ({
  rfc: "",
  nombre: "",
  calle: "",
  colonia: "",
  municipio: "",
  localidad: "",
  estado: "",
  cp: "",
  numero_exterior: "",
  numero_interior: "",
  pais: "MEX",
  fecha_hora: new Date().toISOString().slice(0, 16),
  distancia_km: "" as string | number,
  client_ubicacion_id: "" as string | undefined,
});

export function TripCartaPorte({
  trip,
  clientId,
  clientRfc,
  clientName,
  driver,
  truck,
  onTripUpdated,
}: Props) {
  const { hasPermission } = useAuth();
  const canTimbrar = hasPermission("cartaporte.timbrar");
  const canEdit = tripIsOpen(trip) && hasPermission("viajes.crear");
  const cp = trip.carta_porte;
  const sortedUbics = useMemo(
    () => [...(trip.ubicaciones ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    [trip.ubicaciones],
  );
  const stopCount = Math.max(
    trip.paradas?.length ?? 0,
    sortedUbics.length,
    2,
  );
  const origen = sortedUbics.find((u) => u.orden === 1) ?? sortedUbics.find((u) => u.tipo === "Origen");
  const destino =
    sortedUbics.find((u) => u.orden === stopCount) ??
    sortedUbics.filter((u) => u.tipo === "Destino").pop();

  const [origenForm, setOrigenForm] = useState({
    ...emptyUbic(),
    rfc: origen?.rfc || clientRfc || "",
    nombre: origen?.nombre || clientName || "",
    calle: origen?.calle || trip.origen,
    colonia: origen?.colonia || "",
    municipio: origen?.municipio || "",
    localidad: origen?.localidad || "",
    estado: origen?.estado || "",
    cp: origen?.cp || "",
    numero_exterior: origen?.numero_exterior || "",
    numero_interior: origen?.numero_interior || "",
    pais: origen?.pais || "MEX",
    client_ubicacion_id: origen?.client_ubicacion_id,
    fecha_hora: origen?.fecha_hora?.slice(0, 16) || trip.fecha_salida.slice(0, 16),
  });
  const [destinoForm, setDestinoForm] = useState({
    ...emptyUbic(),
    rfc: destino?.rfc || clientRfc || "",
    nombre: destino?.nombre || clientName || "",
    calle: destino?.calle || trip.destino,
    colonia: destino?.colonia || "",
    municipio: destino?.municipio || "",
    localidad: destino?.localidad || "",
    estado: destino?.estado || "",
    cp: destino?.cp || "",
    numero_exterior: destino?.numero_exterior || "",
    numero_interior: destino?.numero_interior || "",
    pais: destino?.pais || "MEX",
    client_ubicacion_id: destino?.client_ubicacion_id,
    distancia_km: destino?.distancia_km ?? "",
    fecha_hora: destino?.fecha_hora?.slice(0, 16) || "",
  });
  const [catalogUbicaciones, setCatalogUbicaciones] = useState<ClientUbicacion[]>([]);
  const [merc, setMerc] = useState({
    descripcion: "",
    cantidad: 1,
    unidad: "H87",
    peso_kg: 0,
    clave_prod_serv: "78101800",
    material_peligroso: false,
  });
  const [middleForms, setMiddleForms] = useState<
    Array<ReturnType<typeof emptyUbic> & { orden: number; label: string }>
  >([]);
  const [previewIssues, setPreviewIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (stopCount <= 2) {
      setMiddleForms([]);
      return;
    }
    const paradas = trip.paradas?.length
      ? [...trip.paradas].sort((a, b) => a.orden - b.orden)
      : [
          { orden: 1, etiqueta: trip.origen },
          { orden: 2, etiqueta: trip.destino },
        ];
    const middles: Array<ReturnType<typeof emptyUbic> & { orden: number; label: string }> = [];
    for (let orden = 2; orden < stopCount; orden++) {
      const u = sortedUbics.find((x) => x.orden === orden);
      const etiqueta = paradas.find((p) => p.orden === orden)?.etiqueta ?? "";
      middles.push({
        ...emptyUbic(),
        orden,
        label: `Parada ${orden} (entrega)`,
        rfc: u?.rfc || clientRfc || "",
        nombre: u?.nombre || clientName || "",
        calle: u?.calle || etiqueta,
        colonia: u?.colonia || "",
        municipio: u?.municipio || "",
        localidad: u?.localidad || "",
        estado: u?.estado || "",
        cp: u?.cp || "",
        numero_exterior: u?.numero_exterior || "",
        numero_interior: u?.numero_interior || "",
        pais: u?.pais || "MEX",
        client_ubicacion_id: u?.client_ubicacion_id,
        distancia_km: u?.distancia_km ?? "",
        fecha_hora: u?.fecha_hora?.slice(0, 16) || "",
      });
    }
    setMiddleForms(middles);
  }, [trip.id, trip.paradas, sortedUbics, stopCount, clientRfc, clientName, trip.origen, trip.destino]);

  useEffect(() => {
    if (!clientId) {
      setCatalogUbicaciones([]);
      return;
    }
    void fetchClientUbicaciones(clientId)
      .then(setCatalogUbicaciones)
      .catch(() => setCatalogUbicaciones([]));
  }, [clientId]);

  const catalogForOrigen = catalogUbicaciones.filter(
    (u) => u.estatus !== "inactivo" && (u.tipo === "Origen" || u.tipo === "Ambos"),
  );
  const catalogForDestino = catalogUbicaciones.filter(
    (u) => u.estatus !== "inactivo" && (u.tipo === "Destino" || u.tipo === "Ambos"),
  );

  const applyCatalogUbicacion = (
    tipo: "origen" | "destino",
    ubicacionId: string,
  ) => {
    const u = catalogUbicaciones.find((x) => x.id === ubicacionId);
    if (!u) return;
    const patch = {
      nombre: u.nombre,
      calle: u.calle || "",
      colonia: u.colonia || "",
      municipio: u.municipio || "",
      localidad: u.localidad || "",
      estado: u.estado || "",
      cp: u.cp || "",
      numero_exterior: u.numero_exterior || "",
      numero_interior: u.numero_interior || "",
      pais: u.pais || "MEX",
      client_ubicacion_id: u.id,
    };
    if (tipo === "origen") setOrigenForm((prev) => ({ ...prev, ...patch }));
    else setDestinoForm((prev) => ({ ...prev, ...patch }));
  };

  const reloadTrip = async () => {
    const r = await apiFetch(`/trips/${trip.id}`);
    const j = await readJson<Record<string, unknown>>(r);
    onTripUpdated(normalizeTrip(j));
  };

  const toPayload = (body: ReturnType<typeof emptyUbic>, orden: number) => ({
    orden,
    rfc: body.rfc || undefined,
    nombre: body.nombre || undefined,
    calle: body.calle || undefined,
    colonia: body.colonia || undefined,
    municipio: body.municipio || undefined,
    localidad: body.localidad || undefined,
    estado: body.estado || undefined,
    cp: body.cp || undefined,
    numero_exterior: body.numero_exterior || undefined,
    numero_interior: body.numero_interior || undefined,
    pais: body.pais || undefined,
    distancia_km:
      orden === 1 || body.distancia_km === ""
        ? undefined
        : Number(body.distancia_km),
    fecha_hora: body.fecha_hora ? new Date(body.fecha_hora).toISOString() : undefined,
    client_ubicacion_id: body.client_ubicacion_id || undefined,
  });

  const saveUbicacion = async (tipo: "origen" | "destino") => {
    const body = tipo === "origen" ? origenForm : destinoForm;
    const path = tipo === "origen" ? "ubicacion-origen" : "ubicacion-destino";
    const payload = {
      ...body,
      distancia_km: body.distancia_km === "" ? undefined : Number(body.distancia_km),
      fecha_hora: body.fecha_hora ? new Date(body.fecha_hora).toISOString() : undefined,
      client_ubicacion_id: body.client_ubicacion_id || undefined,
    };
    const r = await apiFetch(`/trips/${trip.id}/carta-porte/${path}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      toast.error("No se pudo guardar la ubicación");
      return;
    }
    toast.success(tipo === "origen" ? "Origen guardado" : "Entrega guardada");
    await reloadTrip();
  };

  const saveAllUbicaciones = async () => {
    try {
      const items = [
        toPayload(origenForm, 1),
        ...middleForms.map((m) => toPayload(m, m.orden)),
        toPayload(destinoForm, stopCount),
      ];
      await putTripUbicaciones(trip.id, items);
      toast.success("Ubicaciones fiscales guardadas");
      await reloadTrip();
    } catch {
      toast.error("No se pudieron guardar las ubicaciones");
    }
  };

  const addMercancia = async () => {
    if (!merc.descripcion || merc.peso_kg <= 0) {
      toast.error("Captura descripción y peso");
      return;
    }
    const r = await apiFetch(`/trips/${trip.id}/mercancias`, {
      method: "POST",
      body: JSON.stringify({
        ...merc,
        cantidad_transportada: merc.cantidad,
      }),
    });
    if (!r.ok) {
      toast.error("No se pudo agregar mercancía");
      return;
    }
    setMerc({
      descripcion: "",
      cantidad: 1,
      unidad: "H87",
      peso_kg: 0,
      clave_prod_serv: "78101800",
      material_peligroso: false,
    });
    toast.success("Mercancía agregada");
    await reloadTrip();
  };

  const removeMercancia = async (id: string) => {
    const r = await apiFetch(`/trips/${trip.id}/mercancias/${id}`, { method: "DELETE" });
    if (!r.ok) return;
    await reloadTrip();
  };

  const runPreview = async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/trips/${trip.id}/carta-porte/preview`, { method: "POST" });
      const j = await readJson<{ valid: boolean; issues: string[] }>(r);
      setPreviewIssues(j.issues || []);
      if (j.valid) toast.success("Datos listos para timbrar");
      else toast.warning("Revisa los datos fiscales");
    } finally {
      setLoading(false);
    }
  };

  const timbrar = async () => {
    if (!canTimbrar) return;
    setLoading(true);
    try {
      const r = await apiFetch(`/trips/${trip.id}/carta-porte/timbrar`, { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error(typeof j.error === "string" ? j.error : "Error al timbrar");
        return;
      }
      await readJson<Record<string, unknown>>(r);
      toast.success("Carta porte timbrada");
      await reloadTrip();
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = () => {
    const s = cp?.estatus || "borrador";
    const map: Record<string, string> = {
      borrador: "secondary",
      timbrada: "default",
      cancelada: "outline",
      error: "destructive",
    };
    return <Badge variant={map[s] as "secondary"}>{s}</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card className="tlo-shadow-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileCheck className="h-4 w-4" /> Carta Porte SAT
          </CardTitle>
          {statusBadge()}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {cp?.id_ccp && (
            <p>
              <span className="text-muted-foreground">IdCCP:</span>{" "}
              <span className="font-mono text-xs">{cp.id_ccp}</span>
            </p>
          )}
          {cp?.uuid && (
            <p>
              <span className="text-muted-foreground">UUID:</span>{" "}
              <span className="font-mono">{cp.uuid}</span>
            </p>
          )}
          {cp?.transporte_internacional != null && (
            <p>
              <span className="text-muted-foreground">Transporte internacional:</span>{" "}
              {cp.transporte_internacional || trip.tipo_viaje === "foraneo" ? "Sí" : "No"}
            </p>
          )}
          {cp?.error_mensaje && (
            <p className="text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {cp.error_mensaje}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => void runPreview()} disabled={loading}>
              Validar datos
            </Button>
            {canTimbrar && cp?.estatus !== "timbrada" && (
              <Button
                size="sm"
                onClick={() => void timbrar()}
                disabled={loading}
                className="bg-primary text-primary-foreground"
              >
                <Stamp className="h-4 w-4 mr-1" /> Timbrar
              </Button>
            )}
          </div>
          {previewIssues.length > 0 && (
            <ul className="mt-2 text-xs text-warning-foreground bg-warning/10 rounded p-3 list-disc pl-5">
              {previewIssues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="tlo-shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" /> Operador asignado
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="font-medium">{driver?.nombre || "—"}</p>
            <p>
              <span className="text-muted-foreground">RFC:</span> {driver?.rfc || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Lic. federal:</span>{" "}
              {driver?.licencia_federal || driver?.licencia || "—"}
            </p>
            <p className="text-xs text-muted-foreground">Editar en catálogo Operadores</p>
          </CardContent>
        </Card>
        <Card className="tlo-shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TruckIcon className="h-4 w-4" /> Unidad asignada
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="font-medium">
              {truck?.numero_economico || "—"} · {truck?.placas || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Permiso SCT:</span> {truck?.perm_sct || "—"} /{" "}
              {truck?.num_permiso_sct || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Config.:</span> {truck?.config_vehicular || "—"}
            </p>
            <p className="text-xs text-muted-foreground">Editar en catálogo Camiones</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="tlo-shadow-md">
          <CardHeader>
            <CardTitle className="text-sm">Ubicación origen</CardTitle>
            {origen?.id_ubicacion_sat && (
              <p className="text-xs text-muted-foreground font-mono">ID: {origen.id_ubicacion_sat}</p>
            )}
          </CardHeader>
          <CardContent className="grid gap-2">
            {catalogForOrigen.length > 0 && canEdit ? (
              <div>
                <Label>Cargar desde catálogo</Label>
                <Select
                  value={origenForm.client_ubicacion_id || "none"}
                  onValueChange={(v) => {
                    if (v === "none") {
                      setOrigenForm((prev) => ({ ...prev, client_ubicacion_id: undefined }));
                      return;
                    }
                    applyCatalogUbicacion("origen", v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar ubicación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Manual</SelectItem>
                    {catalogForOrigen.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <Label>RFC</Label>
              <Input
                value={origenForm.rfc}
                onChange={(e) => setOrigenForm({ ...origenForm, rfc: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Nombre</Label>
              <Input
                value={origenForm.nombre}
                onChange={(e) => setOrigenForm({ ...origenForm, nombre: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Calle</Label>
                <Input
                  value={origenForm.calle}
                  onChange={(e) => setOrigenForm({ ...origenForm, calle: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>No. ext.</Label>
                <Input
                  value={origenForm.numero_exterior}
                  onChange={(e) => setOrigenForm({ ...origenForm, numero_exterior: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>No. int.</Label>
                <Input
                  value={origenForm.numero_interior}
                  onChange={(e) => setOrigenForm({ ...origenForm, numero_interior: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Colonia</Label>
                <Input
                  value={origenForm.colonia}
                  onChange={(e) => setOrigenForm({ ...origenForm, colonia: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>Municipio</Label>
                <Input
                  value={origenForm.municipio}
                  onChange={(e) => setOrigenForm({ ...origenForm, municipio: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>Localidad</Label>
                <Input
                  value={origenForm.localidad}
                  onChange={(e) => setOrigenForm({ ...origenForm, localidad: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Input
                  value={origenForm.estado}
                  onChange={(e) => setOrigenForm({ ...origenForm, estado: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>CP</Label>
                <Input
                  value={origenForm.cp}
                  onChange={(e) => setOrigenForm({ ...origenForm, cp: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>País</Label>
                <Input
                  value={origenForm.pais}
                  onChange={(e) => setOrigenForm({ ...origenForm, pais: e.target.value })}
                  disabled={!canEdit}
                  maxLength={3}
                />
              </div>
            </div>
            <div>
              <Label>Fecha/hora salida</Label>
              <Input
                type="datetime-local"
                value={origenForm.fecha_hora}
                onChange={(e) => setOrigenForm({ ...origenForm, fecha_hora: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => void saveUbicacion("origen")}>
                Guardar origen
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="tlo-shadow-md">
          <CardHeader>
            <CardTitle className="text-sm">Ubicación entrega</CardTitle>
            {destino?.id_ubicacion_sat && (
              <p className="text-xs text-muted-foreground font-mono">ID: {destino.id_ubicacion_sat}</p>
            )}
          </CardHeader>
          <CardContent className="grid gap-2">
            {catalogForDestino.length > 0 && canEdit ? (
              <div>
                <Label>Cargar desde catálogo</Label>
                <Select
                  value={destinoForm.client_ubicacion_id || "none"}
                  onValueChange={(v) => {
                    if (v === "none") {
                      setDestinoForm((prev) => ({ ...prev, client_ubicacion_id: undefined }));
                      return;
                    }
                    applyCatalogUbicacion("destino", v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar ubicación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Manual</SelectItem>
                    {catalogForDestino.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <Label>RFC</Label>
              <Input
                value={destinoForm.rfc}
                onChange={(e) => setDestinoForm({ ...destinoForm, rfc: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Nombre</Label>
              <Input
                value={destinoForm.nombre}
                onChange={(e) => setDestinoForm({ ...destinoForm, nombre: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Calle</Label>
                <Input
                  value={destinoForm.calle}
                  onChange={(e) => setDestinoForm({ ...destinoForm, calle: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>No. ext.</Label>
                <Input
                  value={destinoForm.numero_exterior}
                  onChange={(e) => setDestinoForm({ ...destinoForm, numero_exterior: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>No. int.</Label>
                <Input
                  value={destinoForm.numero_interior}
                  onChange={(e) => setDestinoForm({ ...destinoForm, numero_interior: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Colonia</Label>
                <Input
                  value={destinoForm.colonia}
                  onChange={(e) => setDestinoForm({ ...destinoForm, colonia: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>Municipio</Label>
                <Input
                  value={destinoForm.municipio}
                  onChange={(e) => setDestinoForm({ ...destinoForm, municipio: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>Localidad</Label>
                <Input
                  value={destinoForm.localidad}
                  onChange={(e) => setDestinoForm({ ...destinoForm, localidad: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Input
                  value={destinoForm.estado}
                  onChange={(e) => setDestinoForm({ ...destinoForm, estado: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>CP</Label>
                <Input
                  value={destinoForm.cp}
                  onChange={(e) => setDestinoForm({ ...destinoForm, cp: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>País</Label>
                <Input
                  value={destinoForm.pais}
                  onChange={(e) => setDestinoForm({ ...destinoForm, pais: e.target.value })}
                  disabled={!canEdit}
                  maxLength={3}
                />
              </div>
            </div>
            <div>
              <Label>Distancia (km)</Label>
              <Input
                type="number"
                value={destinoForm.distancia_km}
                onChange={(e) => setDestinoForm({ ...destinoForm, distancia_km: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Fecha/hora llegada</Label>
              <Input
                type="datetime-local"
                value={destinoForm.fecha_hora}
                onChange={(e) => setDestinoForm({ ...destinoForm, fecha_hora: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            {canEdit && stopCount <= 2 && (
              <Button size="sm" onClick={() => void saveUbicacion("destino")}>
                Guardar entrega
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {middleForms.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {middleForms.map((mf, idx) => (
            <Card key={mf.orden} className="tlo-shadow-md">
              <CardHeader>
                <CardTitle className="text-sm">{mf.label}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <div>
                  <Label>Calle</Label>
                  <Input
                    value={mf.calle}
                    onChange={(e) => {
                      const next = [...middleForms];
                      next[idx] = { ...next[idx], calle: e.target.value };
                      setMiddleForms(next);
                    }}
                    disabled={!canEdit}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Estado</Label>
                    <Input
                      value={mf.estado}
                      onChange={(e) => {
                        const next = [...middleForms];
                        next[idx] = { ...next[idx], estado: e.target.value };
                        setMiddleForms(next);
                      }}
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <Label>CP</Label>
                    <Input
                      value={mf.cp}
                      onChange={(e) => {
                        const next = [...middleForms];
                        next[idx] = { ...next[idx], cp: e.target.value };
                        setMiddleForms(next);
                      }}
                      disabled={!canEdit}
                    />
                  </div>
                </div>
                <div>
                  <Label>Distancia del tramo (km)</Label>
                  <Input
                    type="number"
                    value={mf.distancia_km}
                    onChange={(e) => {
                      const next = [...middleForms];
                      next[idx] = { ...next[idx], distancia_km: e.target.value };
                      setMiddleForms(next);
                    }}
                    disabled={!canEdit}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canEdit && stopCount > 2 && (
        <Button size="sm" onClick={() => void saveAllUbicaciones()}>
          Guardar todas las ubicaciones fiscales
        </Button>
      )}

      <Card className="tlo-shadow-md">
        <CardHeader>
          <CardTitle className="text-sm">Mercancías</CardTitle>
        </CardHeader>
        <CardContent>
          {canEdit && (
            <div className="grid md:grid-cols-6 gap-2 mb-4">
              <div className="md:col-span-2">
                <Label>Descripción</Label>
                <Input
                  value={merc.descripcion}
                  onChange={(e) => setMerc({ ...merc, descripcion: e.target.value })}
                />
              </div>
              <div>
                <Label>Clave SAT</Label>
                <Input
                  value={merc.clave_prod_serv}
                  onChange={(e) => setMerc({ ...merc, clave_prod_serv: e.target.value })}
                />
              </div>
              <div>
                <Label>Unidad</Label>
                <Input value={merc.unidad} onChange={(e) => setMerc({ ...merc, unidad: e.target.value })} />
              </div>
              <div>
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  value={merc.cantidad}
                  onChange={(e) => setMerc({ ...merc, cantidad: +e.target.value })}
                />
              </div>
              <div>
                <Label>Peso (kg)</Label>
                <Input
                  type="number"
                  value={merc.peso_kg}
                  onChange={(e) => setMerc({ ...merc, peso_kg: +e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => void addMercancia()}>
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm md:col-span-6">
                <Checkbox
                  checked={merc.material_peligroso}
                  onCheckedChange={(c) => setMerc({ ...merc, material_peligroso: !!c })}
                />
                Material peligroso
              </label>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Cant. transp.</TableHead>
                <TableHead className="text-right">Peso kg</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(trip.mercancias || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                    Sin mercancías
                  </TableCell>
                </TableRow>
              )}
              {(trip.mercancias || []).map((m: TripMercancia) => (
                <TableRow key={m.id}>
                  <TableCell>{m.descripcion}</TableCell>
                  <TableCell className="text-right">{m.cantidad}</TableCell>
                  <TableCell className="text-right">{m.cantidad_transportada ?? m.cantidad}</TableCell>
                  <TableCell className="text-right">{m.peso_kg}</TableCell>
                  <TableCell className="text-right">
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => void removeMercancia(m.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
