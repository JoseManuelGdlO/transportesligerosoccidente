import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { apiFetch, readJson } from "@/lib/api";
import { normalizeCartaPorte, normalizeTrip } from "@/lib/tloApi";
import type { Trip, TripMercancia, TripUbicacion } from "@/types/tlo";
import { useAuth } from "@/context/AuthContext";
import { FileCheck, Plus, Trash2, Stamp, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type Props = {
  trip: Trip;
  clientRfc?: string;
  clientName?: string;
  onTripUpdated: (trip: Trip) => void;
};

const emptyUbic = (): Partial<TripUbicacion> => ({
  rfc: "",
  nombre: "",
  calle: "",
  colonia: "",
  municipio: "",
  estado: "",
  cp: "",
  fecha_hora: new Date().toISOString().slice(0, 16),
});

export function TripCartaPorte({ trip, clientRfc, clientName, onTripUpdated }: Props) {
  const { hasPermission } = useAuth();
  const canTimbrar = hasPermission("cartaporte.timbrar");
  const canEdit = trip.estatus === "en_curso" && hasPermission("viajes.crear");
  const cp = trip.carta_porte;
  const origen = trip.ubicaciones?.find((u) => u.tipo === "Origen");
  const destino = trip.ubicaciones?.find((u) => u.tipo === "Destino");

  const [origenForm, setOrigenForm] = useState({
    ...emptyUbic(),
    rfc: origen?.rfc || clientRfc || "",
    nombre: origen?.nombre || clientName || "",
    calle: origen?.calle || trip.origen,
    colonia: origen?.colonia || "",
    municipio: origen?.municipio || "",
    estado: origen?.estado || "",
    cp: origen?.cp || "",
    fecha_hora: origen?.fecha_hora?.slice(0, 16) || trip.fecha_salida.slice(0, 16),
  });
  const [destinoForm, setDestinoForm] = useState({
    ...emptyUbic(),
    rfc: destino?.rfc || clientRfc || "",
    nombre: destino?.nombre || clientName || "",
    calle: destino?.calle || trip.destino,
    colonia: destino?.colonia || "",
    municipio: destino?.municipio || "",
    estado: destino?.estado || "",
    cp: destino?.cp || "",
    distancia_km: destino?.distancia_km ?? "",
    fecha_hora: destino?.fecha_hora?.slice(0, 16) || "",
  });
  const [merc, setMerc] = useState({
    descripcion: "",
    cantidad: 1,
    peso_kg: 0,
    clave_prod_serv: "78101800",
    material_peligroso: false,
  });
  const [previewIssues, setPreviewIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const reloadTrip = async () => {
    const r = await apiFetch(`/trips/${trip.id}`);
    const j = await readJson<Record<string, unknown>>(r);
    onTripUpdated(normalizeTrip(j));
  };

  const saveUbicacion = async (tipo: "origen" | "destino") => {
    const body = tipo === "origen" ? origenForm : destinoForm;
    const path = tipo === "origen" ? "ubicacion-origen" : "ubicacion-destino";
    const payload = {
      ...body,
      distancia_km: body.distancia_km === "" ? undefined : Number(body.distancia_km),
      fecha_hora: body.fecha_hora ? new Date(body.fecha_hora).toISOString() : undefined,
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

  const addMercancia = async () => {
    if (!merc.descripcion || merc.peso_kg <= 0) {
      toast.error("Captura descripción y peso");
      return;
    }
    const r = await apiFetch(`/trips/${trip.id}/mercancias`, {
      method: "POST",
      body: JSON.stringify(merc),
    });
    if (!r.ok) {
      toast.error("No se pudo agregar mercancía");
      return;
    }
    setMerc({ descripcion: "", cantidad: 1, peso_kg: 0, clave_prod_serv: "78101800", material_peligroso: false });
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
      const j = await readJson<Record<string, unknown>>(r);
      normalizeCartaPorte(j);
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
          {cp?.uuid && <p><span className="text-muted-foreground">UUID:</span> <span className="font-mono">{cp.uuid}</span></p>}
          {cp?.error_mensaje && (
            <p className="text-destructive flex items-start gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{cp.error_mensaje}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => void runPreview()} disabled={loading}>Validar datos</Button>
            {canTimbrar && cp?.estatus !== "timbrada" && (
              <Button size="sm" onClick={() => void timbrar()} disabled={loading} className="bg-primary text-primary-foreground">
                <Stamp className="h-4 w-4 mr-1" /> Timbrar
              </Button>
            )}
          </div>
          {previewIssues.length > 0 && (
            <ul className="mt-2 text-xs text-warning-foreground bg-warning/10 rounded p-3 list-disc pl-5">
              {previewIssues.map((i) => <li key={i}>{i}</li>)}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="tlo-shadow-md">
          <CardHeader><CardTitle className="text-sm">Ubicación origen</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            <div><Label>RFC</Label><Input value={origenForm.rfc} onChange={e => setOrigenForm({ ...origenForm, rfc: e.target.value })} disabled={!canEdit} /></div>
            <div><Label>Nombre</Label><Input value={origenForm.nombre} onChange={e => setOrigenForm({ ...origenForm, nombre: e.target.value })} disabled={!canEdit} /></div>
            <div><Label>Calle</Label><Input value={origenForm.calle} onChange={e => setOrigenForm({ ...origenForm, calle: e.target.value })} disabled={!canEdit} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>CP</Label><Input value={origenForm.cp} onChange={e => setOrigenForm({ ...origenForm, cp: e.target.value })} disabled={!canEdit} /></div>
              <div><Label>Estado</Label><Input value={origenForm.estado} onChange={e => setOrigenForm({ ...origenForm, estado: e.target.value })} disabled={!canEdit} /></div>
            </div>
            <div><Label>Fecha/hora salida</Label><Input type="datetime-local" value={origenForm.fecha_hora} onChange={e => setOrigenForm({ ...origenForm, fecha_hora: e.target.value })} disabled={!canEdit} /></div>
            {canEdit && <Button size="sm" onClick={() => void saveUbicacion("origen")}>Guardar origen</Button>}
          </CardContent>
        </Card>

        <Card className="tlo-shadow-md">
          <CardHeader><CardTitle className="text-sm">Ubicación entrega</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            <div><Label>RFC</Label><Input value={destinoForm.rfc} onChange={e => setDestinoForm({ ...destinoForm, rfc: e.target.value })} disabled={!canEdit} /></div>
            <div><Label>Nombre</Label><Input value={destinoForm.nombre} onChange={e => setDestinoForm({ ...destinoForm, nombre: e.target.value })} disabled={!canEdit} /></div>
            <div><Label>Calle</Label><Input value={destinoForm.calle} onChange={e => setDestinoForm({ ...destinoForm, calle: e.target.value })} disabled={!canEdit} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>CP</Label><Input value={destinoForm.cp} onChange={e => setDestinoForm({ ...destinoForm, cp: e.target.value })} disabled={!canEdit} /></div>
              <div><Label>Estado</Label><Input value={destinoForm.estado} onChange={e => setDestinoForm({ ...destinoForm, estado: e.target.value })} disabled={!canEdit} /></div>
            </div>
            <div><Label>Distancia (km)</Label><Input type="number" value={destinoForm.distancia_km} onChange={e => setDestinoForm({ ...destinoForm, distancia_km: e.target.value })} disabled={!canEdit} /></div>
            {canEdit && <Button size="sm" onClick={() => void saveUbicacion("destino")}>Guardar entrega</Button>}
          </CardContent>
        </Card>
      </div>

      <Card className="tlo-shadow-md">
        <CardHeader><CardTitle className="text-sm">Mercancías</CardTitle></CardHeader>
        <CardContent>
          {canEdit && (
            <div className="grid md:grid-cols-4 gap-2 mb-4">
              <div className="md:col-span-2"><Label>Descripción</Label><Input value={merc.descripcion} onChange={e => setMerc({ ...merc, descripcion: e.target.value })} /></div>
              <div><Label>Peso (kg)</Label><Input type="number" value={merc.peso_kg} onChange={e => setMerc({ ...merc, peso_kg: +e.target.value })} /></div>
              <div className="flex items-end"><Button onClick={() => void addMercancia()}><Plus className="h-4 w-4 mr-1" />Agregar</Button></div>
              <label className="flex items-center gap-2 text-sm md:col-span-4">
                <Checkbox checked={merc.material_peligroso} onCheckedChange={c => setMerc({ ...merc, material_peligroso: !!c })} />
                Material peligroso
              </label>
            </div>
          )}
          <Table>
            <TableHeader><TableRow><TableHead>Descripción</TableHead><TableHead className="text-right">Cant.</TableHead><TableHead className="text-right">Peso kg</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(trip.mercancias || []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Sin mercancías</TableCell></TableRow>
              )}
              {(trip.mercancias || []).map((m: TripMercancia) => (
                <TableRow key={m.id}>
                  <TableCell>{m.descripcion}</TableCell>
                  <TableCell className="text-right">{m.cantidad}</TableCell>
                  <TableCell className="text-right">{m.peso_kg}</TableCell>
                  <TableCell className="text-right">
                    {canEdit && <Button variant="ghost" size="sm" onClick={() => void removeMercancia(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
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
