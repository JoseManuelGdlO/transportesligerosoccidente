import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  downloadCartaPorteXml,
  fetchClientUbicaciones,
  normalizeTrip,
  putTripUbicaciones,
} from "@/lib/tloApi";
import {
  cardHighlightClass,
  classifyCartaPorteIssues,
  fieldHighlightClass,
  firstErrorSection,
} from "@/lib/cartaPorteIssues";
import type { ClientUbicacion, Driver, Trip, TripMercancia, Truck } from "@/types/tlo";
import { useAuth } from "@/context/AuthContext";
import { useTlo } from "@/context/TloContext";
import { driverById, truckById } from "@/lib/calc";
import { cn } from "@/lib/utils";
import {
  FileCheck,
  Plus,
  Trash2,
  Stamp,
  AlertCircle,
  Download,
  Truck as TruckIcon,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { tripIsClosed, tripIsOpen } from "@/lib/tripStatus";

/** c_ClaveProdServCP (Carta Porte). No usar 78101800 (eso es CFDI servicio de transporte). */
const DEFAULT_CLAVE_BIENES_TRANSP = "50192100";

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
  colonia_clave: "",
  municipio: "",
  municipio_clave: "",
  localidad: "",
  localidad_clave: "",
  estado: "",
  cp: "",
  numero_exterior: "",
  numero_interior: "",
  pais: "MEX",
  fecha_hora: new Date().toISOString().slice(0, 16),
  distancia_km: "" as string | number,
  client_ubicacion_id: "" as string | undefined,
});

const AUTOSAVE_MS = 400;

export function TripCartaPorte({
  trip,
  clientId,
  clientRfc,
  clientName,
  driver: driverProp,
  truck: truckProp,
  onTripUpdated,
}: Props) {
  const { hasPermission } = useAuth();
  const { drivers, trucks, upsertDriver, upsertTruck } = useTlo();
  const canTimbrar = hasPermission("cartaporte.timbrar");
  const canViewCartaPorte = hasPermission("cartaporte.ver");
  const cp = trip.carta_porte;
  const cpTimbrada = cp?.estatus === "timbrada";
  const tripFiscalReady = tripIsOpen(trip) || tripIsClosed(trip);
  const canFiscalEdit =
    !cpTimbrada &&
    tripFiscalReady &&
    (hasPermission("viajes.crear") || hasPermission("cartaporte.timbrar"));
  const canCatalogEdit = hasPermission("catalogos.editar");

  const [tipoTimbrado, setTipoTimbrado] = useState<"ingreso" | "traslado">("traslado");
  const [usoCfdi, setUsoCfdi] = useState("G03");
  const [moneda, setMoneda] = useState("MXN");
  const [tipoCambio, setTipoCambio] = useState("");
  const [metodoPago, setMetodoPago] = useState("PPD");
  const [formaPago, setFormaPago] = useState("99");
  const [condicionesPago, setCondicionesPago] = useState("");

  const timbradoBody = () => ({
    tipo: tipoTimbrado,
    uso_cfdi: tipoTimbrado === "ingreso" ? usoCfdi : undefined,
    moneda: tipoTimbrado === "ingreso" ? moneda : undefined,
    tipo_cambio:
      tipoTimbrado === "ingreso" && moneda !== "MXN" && tipoCambio
        ? Number(tipoCambio)
        : undefined,
    metodo_pago: tipoTimbrado === "ingreso" ? metodoPago : undefined,
    forma_pago: tipoTimbrado === "ingreso" ? formaPago : undefined,
    condiciones_pago: tipoTimbrado === "ingreso" && condicionesPago ? condicionesPago : undefined,
  });

  const driverLive = driverProp?.id
    ? (driverById(drivers, driverProp.id) ?? driverProp)
    : driverProp;
  const truckLive = truckProp?.id ? (truckById(trucks, truckProp.id) ?? truckProp) : truckProp;

  const sortedUbics = useMemo(
    () => [...(trip.ubicaciones ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    [trip.ubicaciones],
  );
  const stopCount = Math.max(trip.paradas?.length ?? 0, sortedUbics.length, 2);
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
    colonia_clave: origen?.colonia_clave || "",
    municipio: origen?.municipio || "",
    municipio_clave: origen?.municipio_clave || "",
    localidad: origen?.localidad || "",
    localidad_clave: origen?.localidad_clave || "",
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
    colonia_clave: destino?.colonia_clave || "",
    municipio: destino?.municipio || "",
    municipio_clave: destino?.municipio_clave || "",
    localidad: destino?.localidad || "",
    localidad_clave: destino?.localidad_clave || "",
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
    clave_prod_serv: DEFAULT_CLAVE_BIENES_TRANSP,
    material_peligroso: false,
  });
  const [middleForms, setMiddleForms] = useState<
    Array<ReturnType<typeof emptyUbic> & { orden: number; label: string }>
  >([]);
  const [previewIssues, setPreviewIssues] = useState<string[]>([]);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [driverFiscal, setDriverFiscal] = useState({
    rfc: "",
    licencia_federal: "",
    licencia: "",
  });
  const [truckFiscal, setTruckFiscal] = useState({
    perm_sct: "",
    num_permiso_sct: "",
    config_vehicular: "",
    peso_bruto_vehicular: "" as string | number,
    aseguradora_resp_civil: "",
    poliza_resp_civil: "",
  });

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<string>("");
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const issueFlags = useMemo(
    () => classifyCartaPorteIssues(previewIssues, stopCount),
    [previewIssues, stopCount],
  );

  useEffect(() => {
    setDriverFiscal({
      rfc: driverLive?.rfc ?? "",
      licencia_federal: driverLive?.licencia_federal ?? "",
      licencia: driverLive?.licencia ?? "",
    });
  }, [driverLive?.id, driverLive?.rfc, driverLive?.licencia_federal, driverLive?.licencia]);

  useEffect(() => {
    setTruckFiscal({
      perm_sct: truckLive?.perm_sct ?? "",
      num_permiso_sct: truckLive?.num_permiso_sct ?? "",
      config_vehicular: truckLive?.config_vehicular ?? "",
      peso_bruto_vehicular: truckLive?.peso_bruto_vehicular ?? "",
      aseguradora_resp_civil: truckLive?.aseguradora_resp_civil ?? "",
      poliza_resp_civil: truckLive?.poliza_resp_civil ?? "",
    });
  }, [
    truckLive?.id,
    truckLive?.perm_sct,
    truckLive?.num_permiso_sct,
    truckLive?.config_vehicular,
    truckLive?.peso_bruto_vehicular,
    truckLive?.aseguradora_resp_civil,
    truckLive?.poliza_resp_civil,
  ]);

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

  useEffect(() => {
    lastSavedSnapshotRef.current = buildUbicSnapshot(origenForm, destinoForm, middleForms);
  }, [trip.id, trip.ubicaciones]);

  useEffect(() => {
    if (!validationAttempted) return;
    const section = firstErrorSection(issueFlags, stopCount);
    if (!section) return;
    const refKey =
      section === "stop"
        ? `stop-${Object.keys(issueFlags.stops)
            .map(Number)
            .filter((o) => o > 1 && o < stopCount)
            .sort((a, b) => a - b)[0]}`
        : section;
    sectionRefs.current[refKey]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [validationAttempted, issueFlags, stopCount]);

  const catalogForOrigen = catalogUbicaciones.filter(
    (u) => u.estatus !== "inactivo" && (u.tipo === "Origen" || u.tipo === "Ambos"),
  );
  const catalogForDestino = catalogUbicaciones.filter(
    (u) => u.estatus !== "inactivo" && (u.tipo === "Destino" || u.tipo === "Ambos"),
  );

  const reloadTrip = async () => {
    const r = await apiFetch(`/trips/${trip.id}`);
    const j = await readJson<Record<string, unknown>>(r);
    onTripUpdated(normalizeTrip(j));
  };

  const buildUbicSnapshot = (
    origen: typeof origenForm,
    destino: typeof destinoForm,
    middles: typeof middleForms,
  ) => JSON.stringify({ origen, destino, middles });

  const toPayload = (body: ReturnType<typeof emptyUbic>, orden: number) => ({
    orden,
    rfc: body.rfc || undefined,
    nombre: body.nombre || undefined,
    calle: body.calle || undefined,
    colonia: body.colonia || undefined,
    colonia_clave: body.colonia_clave || undefined,
    municipio: body.municipio || undefined,
    municipio_clave: body.municipio_clave || undefined,
    localidad: body.localidad || undefined,
    localidad_clave: body.localidad_clave || undefined,
    estado: body.estado || undefined,
    cp: body.cp || undefined,
    numero_exterior: body.numero_exterior || undefined,
    numero_interior: body.numero_interior || undefined,
    pais: body.pais || undefined,
    distancia_km:
      orden === 1 || body.distancia_km === "" ? undefined : Number(body.distancia_km),
    fecha_hora: body.fecha_hora ? new Date(body.fecha_hora).toISOString() : undefined,
    client_ubicacion_id: body.client_ubicacion_id || undefined,
  });

  const persistUbicaciones = useCallback(async () => {
    if (!canFiscalEdit) return;
    const snapshot = buildUbicSnapshot(origenForm, destinoForm, middleForms);
    if (snapshot === lastSavedSnapshotRef.current) return;

    try {
      if (stopCount <= 2) {
        const { orden: _o, ...origenPayload } = toPayload(origenForm, 1);
        const { orden: _d, ...destinoPayload } = toPayload(destinoForm, stopCount);
        const [r1, r2] = await Promise.all([
          apiFetch(`/trips/${trip.id}/carta-porte/ubicacion-origen`, {
            method: "PUT",
            body: JSON.stringify(origenPayload),
          }),
          apiFetch(`/trips/${trip.id}/carta-porte/ubicacion-destino`, {
            method: "PUT",
            body: JSON.stringify(destinoPayload),
          }),
        ]);
        if (!r1.ok || !r2.ok) {
          toast.error("No se pudieron guardar las ubicaciones");
          return;
        }
      } else {
        const items = [
          toPayload(origenForm, 1),
          ...middleForms.map((m) => toPayload(m, m.orden)),
          toPayload(destinoForm, stopCount),
        ];
        await putTripUbicaciones(trip.id, items);
      }
      lastSavedSnapshotRef.current = snapshot;
      await reloadTrip();
    } catch {
      toast.error("No se pudieron guardar las ubicaciones");
    }
  }, [canFiscalEdit, destinoForm, middleForms, origenForm, stopCount, trip.id]);

  const flushPendingSaves = useCallback(async () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    await persistUbicaciones();
  }, [persistUbicaciones]);

  const schedulePersistUbicaciones = useCallback(() => {
    if (!canFiscalEdit) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void persistUbicaciones();
    }, AUTOSAVE_MS);
  }, [canFiscalEdit, persistUbicaciones]);

  const onUbicFieldBlur = () => {
    void flushPendingSaves();
  };

  const applyCatalogUbicacion = (tipo: "origen" | "destino", ubicacionId: string) => {
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
    if (tipo === "origen") {
      setOrigenForm((prev) => ({ ...prev, ...patch }));
    } else {
      setDestinoForm((prev) => ({ ...prev, ...patch }));
    }
    schedulePersistUbicaciones();
  };

  const saveDriverFiscal = () => {
    if (!canCatalogEdit || !driverLive?.id) return;
    const changed =
      (driverFiscal.rfc || "") !== (driverLive.rfc || "") ||
      (driverFiscal.licencia_federal || "") !== (driverLive.licencia_federal || "") ||
      (driverFiscal.licencia || "") !== (driverLive.licencia || "");
    if (!changed) return;
    upsertDriver({
      ...driverLive,
      rfc: driverFiscal.rfc || undefined,
      licencia_federal: driverFiscal.licencia_federal || undefined,
      licencia: driverFiscal.licencia || driverLive.licencia,
    });
  };

  const saveTruckFiscal = () => {
    if (!canCatalogEdit || !truckLive?.id) return;
    const peso =
      truckFiscal.peso_bruto_vehicular === ""
        ? undefined
        : Number(truckFiscal.peso_bruto_vehicular);
    const changed =
      (truckFiscal.perm_sct || "") !== (truckLive.perm_sct || "") ||
      (truckFiscal.num_permiso_sct || "") !== (truckLive.num_permiso_sct || "") ||
      (truckFiscal.config_vehicular || "") !== (truckLive.config_vehicular || "") ||
      peso !== truckLive.peso_bruto_vehicular ||
      (truckFiscal.aseguradora_resp_civil || "") !== (truckLive.aseguradora_resp_civil || "") ||
      (truckFiscal.poliza_resp_civil || "") !== (truckLive.poliza_resp_civil || "");
    if (!changed) return;
    upsertTruck({
      ...truckLive,
      perm_sct: truckFiscal.perm_sct || undefined,
      num_permiso_sct: truckFiscal.num_permiso_sct || undefined,
      config_vehicular: truckFiscal.config_vehicular || undefined,
      peso_bruto_vehicular: peso,
      aseguradora_resp_civil: truckFiscal.aseguradora_resp_civil || undefined,
      poliza_resp_civil: truckFiscal.poliza_resp_civil || undefined,
    });
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
      clave_prod_serv: DEFAULT_CLAVE_BIENES_TRANSP,
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

  const suggestedXmlFilename = useCallback(
    (serie?: string, folioCfdi?: string) => {
      if (serie && folioCfdi) return `${serie}-${folioCfdi}.xml`;
      if (trip.folio?.trim()) return `${trip.folio.replace(/[^A-Za-z0-9._-]/g, "_")}-carta-porte.xml`;
      return undefined;
    },
    [trip.folio],
  );

  const handleDownloadXml = async (serie?: string, folioCfdi?: string) => {
    try {
      await downloadCartaPorteXml(trip.id, suggestedXmlFilename(serie, folioCfdi));
      toast.success("XML descargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo descargar el XML");
    }
  };

  const handleTimbrar = async () => {
    if (!canTimbrar) return;
    setLoading(true);
    try {
      await flushPendingSaves();
      const previewRes = await apiFetch(`/trips/${trip.id}/carta-porte/preview`, {
        method: "POST",
        body: JSON.stringify(timbradoBody()),
      });
      const preview = await readJson<{ valid: boolean; issues: string[] }>(previewRes);
      const issues = preview.issues || [];
      setPreviewIssues(issues);

      if (!preview.valid) {
        setValidationAttempted(true);
        toast.warning("Completa los datos fiscales señalados");
        return;
      }

      setValidationAttempted(false);
      const r = await apiFetch(`/trips/${trip.id}/carta-porte/timbrar`, {
        method: "POST",
        body: JSON.stringify(timbradoBody()),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error(typeof j.error === "string" ? j.error : "Error al timbrar");
        return;
      }
      const timbrado = await readJson<{ serie?: string; folio_cfdi?: string }>(r);
      toast.success("Carta porte timbrada");
      try {
        await downloadCartaPorteXml(
          trip.id,
          suggestedXmlFilename(timbrado.serie, timbrado.folio_cfdi),
        );
      } catch (e) {
        toast.warning(
          e instanceof Error ? e.message : "Timbrado correcto, pero no se pudo descargar el XML",
        );
      }
      setPreviewIssues([]);
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

  const fh = (flag: boolean) => fieldHighlightClass(flag, validationAttempted);
  const ch = (flag: boolean) => cardHighlightClass(flag, validationAttempted);

  const patchOrigen = (patch: Partial<typeof origenForm>) => {
    setOrigenForm((prev) => ({ ...prev, ...patch }));
    schedulePersistUbicaciones();
  };

  const patchDestino = (patch: Partial<typeof destinoForm>) => {
    setDestinoForm((prev) => ({ ...prev, ...patch }));
    schedulePersistUbicaciones();
  };

  const patchMiddle = (idx: number, patch: Partial<(typeof middleForms)[0]>) => {
    setMiddleForms((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    schedulePersistUbicaciones();
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
          {issueFlags.hasEmpresaIssues && validationAttempted && (
            <div
              ref={(el) => {
                sectionRefs.current.empresa = el;
              }}
              className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm"
            >
              <p className="font-medium text-destructive">Datos de empresa incompletos</p>
              <p className="text-muted-foreground mt-1">
                Configura RFC, régimen, CP fiscal y certificados CSD en{" "}
                <Link to="/empresa" className="text-primary underline">
                  Empresa → Datos fiscales
                </Link>
                .
              </p>
            </div>
          )}
          {issueFlags.hasTripStatusIssue && validationAttempted && (
            <p className="text-destructive text-xs">
              El viaje debe estar en estado <strong>en curso</strong> o <strong>cerrado</strong> para
              timbrar.
            </p>
          )}
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
          {canTimbrar && !cpTimbrada && (
            <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t">
              <div>
                <Label>Tipo de comprobante</Label>
                <Select value={tipoTimbrado} onValueChange={(v) => setTipoTimbrado(v as "ingreso" | "traslado")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="traslado">Traslado (T)</SelectItem>
                    <SelectItem value="ingreso">Factura de ingreso (FA)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {tipoTimbrado === "ingreso" && (
                <>
                  <div>
                    <Label>Uso CFDI receptor</Label>
                    <Input value={usoCfdi} onChange={(e) => setUsoCfdi(e.target.value)} placeholder="G03" />
                  </div>
                  <div>
                    <Label>Moneda</Label>
                    <Select value={moneda} onValueChange={setMoneda}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MXN">MXN</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {moneda !== "MXN" && (
                    <div>
                      <Label>Tipo de cambio</Label>
                      <Input value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} placeholder="17.29" />
                    </div>
                  )}
                  <div>
                    <Label>Método pago</Label>
                    <Input value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} placeholder="PPD" />
                  </div>
                  <div>
                    <Label>Forma pago</Label>
                    <Input value={formaPago} onChange={(e) => setFormaPago(e.target.value)} placeholder="99" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Condiciones de pago</Label>
                    <Input
                      value={condicionesPago}
                      onChange={(e) => setCondicionesPago(e.target.value)}
                      placeholder="CREDITO 30 DIAS"
                    />
                  </div>
                </>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            {canTimbrar && !cpTimbrada && (
              <Button
                size="sm"
                onClick={() => void handleTimbrar()}
                disabled={loading}
                className="bg-primary text-primary-foreground"
              >
                <Stamp className="h-4 w-4 mr-1" /> Timbrar
              </Button>
            )}
            {canViewCartaPorte && (cp?.has_xml || cpTimbrada) && (
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void handleDownloadXml(cp?.serie, cp?.folio_cfdi)}
              >
                <Download className="h-4 w-4 mr-1" /> XML
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
        <Card
          ref={(el) => {
            sectionRefs.current.driver = el;
          }}
          className={cn("tlo-shadow-md", ch(issueFlags.driver.highlight))}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" /> Operador asignado
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p className="font-medium">{driverLive?.nombre || "—"}</p>
            {issueFlags.driver.unassigned && validationAttempted && (
              <p className="text-xs text-destructive">Asigna un operador al viaje</p>
            )}
            <div>
              <Label>RFC</Label>
              <Input
                value={driverFiscal.rfc}
                onChange={(e) => setDriverFiscal((p) => ({ ...p, rfc: e.target.value }))}
                onBlur={saveDriverFiscal}
                disabled={!canCatalogEdit || !driverLive?.id}
                className={fh(issueFlags.driver.rfc)}
              />
            </div>
            <div>
              <Label>Lic. federal</Label>
              <Input
                value={driverFiscal.licencia_federal}
                onChange={(e) =>
                  setDriverFiscal((p) => ({ ...p, licencia_federal: e.target.value }))
                }
                onBlur={saveDriverFiscal}
                disabled={!canCatalogEdit || !driverLive?.id}
                className={fh(issueFlags.driver.licencia)}
              />
            </div>
            <div>
              <Label>Licencia (alternativa)</Label>
              <Input
                value={driverFiscal.licencia}
                onChange={(e) => setDriverFiscal((p) => ({ ...p, licencia: e.target.value }))}
                onBlur={saveDriverFiscal}
                disabled={!canCatalogEdit || !driverLive?.id}
                className={fh(issueFlags.driver.licencia)}
              />
            </div>
            {!canCatalogEdit && (
              <p className="text-xs text-muted-foreground">Requiere permiso catalogos.editar</p>
            )}
          </CardContent>
        </Card>

        <Card
          ref={(el) => {
            sectionRefs.current.truck = el;
          }}
          className={cn("tlo-shadow-md", ch(issueFlags.truck.highlight))}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TruckIcon className="h-4 w-4" /> Unidad asignada
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p className="font-medium">
              {truckLive?.numero_economico || "—"} · {truckLive?.placas || "—"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Permiso SCT</Label>
                <Input
                  value={truckFiscal.perm_sct}
                  onChange={(e) => setTruckFiscal((p) => ({ ...p, perm_sct: e.target.value }))}
                  onBlur={saveTruckFiscal}
                  disabled={!canCatalogEdit || !truckLive?.id}
                  className={fh(issueFlags.truck.perm_sct)}
                  placeholder="TPAF01"
                />
              </div>
              <div>
                <Label>No. permiso SCT</Label>
                <Input
                  value={truckFiscal.num_permiso_sct}
                  onChange={(e) =>
                    setTruckFiscal((p) => ({ ...p, num_permiso_sct: e.target.value }))
                  }
                  onBlur={saveTruckFiscal}
                  disabled={!canCatalogEdit || !truckLive?.id}
                  className={fh(issueFlags.truck.num_permiso_sct)}
                />
              </div>
              <div>
                <Label>Config. vehicular</Label>
                <Input
                  value={truckFiscal.config_vehicular}
                  onChange={(e) =>
                    setTruckFiscal((p) => ({ ...p, config_vehicular: e.target.value }))
                  }
                  onBlur={saveTruckFiscal}
                  disabled={!canCatalogEdit || !truckLive?.id}
                  className={fh(issueFlags.truck.config_vehicular)}
                  placeholder="C2"
                />
              </div>
              <div>
                <Label>Peso bruto (kg)</Label>
                <Input
                  type="number"
                  value={truckFiscal.peso_bruto_vehicular}
                  onChange={(e) =>
                    setTruckFiscal((p) => ({
                      ...p,
                      peso_bruto_vehicular: e.target.value,
                    }))
                  }
                  onBlur={saveTruckFiscal}
                  disabled={!canCatalogEdit || !truckLive?.id}
                  className={fh(issueFlags.truck.peso_bruto_vehicular)}
                />
              </div>
              <div>
                <Label>Aseguradora RC</Label>
                <Input
                  value={truckFiscal.aseguradora_resp_civil}
                  onChange={(e) =>
                    setTruckFiscal((p) => ({ ...p, aseguradora_resp_civil: e.target.value }))
                  }
                  onBlur={saveTruckFiscal}
                  disabled={!canCatalogEdit || !truckLive?.id}
                  className={fh(issueFlags.truck.aseguradora_resp_civil)}
                />
              </div>
              <div>
                <Label>Póliza RC</Label>
                <Input
                  value={truckFiscal.poliza_resp_civil}
                  onChange={(e) =>
                    setTruckFiscal((p) => ({ ...p, poliza_resp_civil: e.target.value }))
                  }
                  onBlur={saveTruckFiscal}
                  disabled={!canCatalogEdit || !truckLive?.id}
                  className={fh(issueFlags.truck.poliza_resp_civil)}
                />
              </div>
            </div>
            {!canCatalogEdit && (
              <p className="text-xs text-muted-foreground">Requiere permiso catalogos.editar</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card
          ref={(el) => {
            sectionRefs.current.origen = el;
          }}
          className={cn("tlo-shadow-md", ch(issueFlags.origen.highlight))}
        >
          <CardHeader>
            <CardTitle className="text-sm">Ubicación origen</CardTitle>
            {origen?.id_ubicacion_sat && (
              <p className="text-xs text-muted-foreground font-mono">ID: {origen.id_ubicacion_sat}</p>
            )}
          </CardHeader>
          <CardContent className="grid gap-2">
            {catalogForOrigen.length > 0 && canFiscalEdit ? (
              <div>
                <Label>Cargar desde catálogo</Label>
                <Select
                  value={origenForm.client_ubicacion_id || "none"}
                  onValueChange={(v) => {
                    if (v === "none") {
                      patchOrigen({ client_ubicacion_id: undefined });
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
                onChange={(e) => patchOrigen({ rfc: e.target.value })}
                onBlur={onUbicFieldBlur}
                disabled={!canFiscalEdit}
              />
            </div>
            <div>
              <Label>Nombre</Label>
              <Input
                value={origenForm.nombre}
                onChange={(e) => patchOrigen({ nombre: e.target.value })}
                onBlur={onUbicFieldBlur}
                disabled={!canFiscalEdit}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Calle</Label>
                <Input
                  value={origenForm.calle}
                  onChange={(e) => patchOrigen({ calle: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                />
              </div>
              <div>
                <Label>No. ext.</Label>
                <Input
                  value={origenForm.numero_exterior}
                  onChange={(e) => patchOrigen({ numero_exterior: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                />
              </div>
              <div>
                <Label>No. int.</Label>
                <Input
                  value={origenForm.numero_interior}
                  onChange={(e) => patchOrigen({ numero_interior: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Colonia</Label>
                <Input
                  value={origenForm.colonia}
                  onChange={(e) => patchOrigen({ colonia: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                />
              </div>
              <div>
                <Label>Clave colonia SAT</Label>
                <Input
                  value={origenForm.colonia_clave}
                  onChange={(e) => patchOrigen({ colonia_clave: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                  placeholder="0251"
                />
              </div>
              <div>
                <Label>Municipio</Label>
                <Input
                  value={origenForm.municipio}
                  onChange={(e) => patchOrigen({ municipio: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                />
              </div>
              <div>
                <Label>Clave municipio SAT</Label>
                <Input
                  value={origenForm.municipio_clave}
                  onChange={(e) => patchOrigen({ municipio_clave: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                  placeholder="003"
                />
              </div>
              <div>
                <Label>Localidad</Label>
                <Input
                  value={origenForm.localidad}
                  onChange={(e) => patchOrigen({ localidad: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                />
              </div>
              <div>
                <Label>Clave localidad SAT</Label>
                <Input
                  value={origenForm.localidad_clave}
                  onChange={(e) => patchOrigen({ localidad_clave: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                  placeholder="03"
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Input
                  value={origenForm.estado}
                  onChange={(e) => patchOrigen({ estado: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                  className={fh(issueFlags.origen.estado)}
                />
              </div>
              <div>
                <Label>CP</Label>
                <Input
                  value={origenForm.cp}
                  onChange={(e) => patchOrigen({ cp: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                  className={fh(issueFlags.origen.cp)}
                />
              </div>
              <div>
                <Label>País</Label>
                <Input
                  value={origenForm.pais}
                  onChange={(e) => patchOrigen({ pais: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                  maxLength={3}
                />
              </div>
            </div>
            <div>
              <Label>Fecha/hora salida</Label>
              <Input
                type="datetime-local"
                value={origenForm.fecha_hora}
                onChange={(e) => patchOrigen({ fecha_hora: e.target.value })}
                onBlur={onUbicFieldBlur}
                disabled={!canFiscalEdit}
              />
            </div>
          </CardContent>
        </Card>

        <Card
          ref={(el) => {
            sectionRefs.current.destino = el;
          }}
          className={cn("tlo-shadow-md", ch(issueFlags.stops[stopCount]?.highlight ?? false))}
        >
          <CardHeader>
            <CardTitle className="text-sm">Ubicación entrega</CardTitle>
            {destino?.id_ubicacion_sat && (
              <p className="text-xs text-muted-foreground font-mono">ID: {destino.id_ubicacion_sat}</p>
            )}
          </CardHeader>
          <CardContent className="grid gap-2">
            {catalogForDestino.length > 0 && canFiscalEdit ? (
              <div>
                <Label>Cargar desde catálogo</Label>
                <Select
                  value={destinoForm.client_ubicacion_id || "none"}
                  onValueChange={(v) => {
                    if (v === "none") {
                      patchDestino({ client_ubicacion_id: undefined });
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
                onChange={(e) => patchDestino({ rfc: e.target.value })}
                onBlur={onUbicFieldBlur}
                disabled={!canFiscalEdit}
              />
            </div>
            <div>
              <Label>Nombre</Label>
              <Input
                value={destinoForm.nombre}
                onChange={(e) => patchDestino({ nombre: e.target.value })}
                onBlur={onUbicFieldBlur}
                disabled={!canFiscalEdit}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Calle</Label>
                <Input
                  value={destinoForm.calle}
                  onChange={(e) => patchDestino({ calle: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                />
              </div>
              <div>
                <Label>No. ext.</Label>
                <Input
                  value={destinoForm.numero_exterior}
                  onChange={(e) => patchDestino({ numero_exterior: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                />
              </div>
              <div>
                <Label>No. int.</Label>
                <Input
                  value={destinoForm.numero_interior}
                  onChange={(e) => patchDestino({ numero_interior: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Colonia</Label>
                <Input
                  value={destinoForm.colonia}
                  onChange={(e) => patchDestino({ colonia: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                />
              </div>
              <div>
                <Label>Clave colonia SAT</Label>
                <Input
                  value={destinoForm.colonia_clave}
                  onChange={(e) => patchDestino({ colonia_clave: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                  placeholder="0251"
                />
              </div>
              <div>
                <Label>Municipio</Label>
                <Input
                  value={destinoForm.municipio}
                  onChange={(e) => patchDestino({ municipio: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                />
              </div>
              <div>
                <Label>Clave municipio SAT</Label>
                <Input
                  value={destinoForm.municipio_clave}
                  onChange={(e) => patchDestino({ municipio_clave: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                  placeholder="003"
                />
              </div>
              <div>
                <Label>Localidad</Label>
                <Input
                  value={destinoForm.localidad}
                  onChange={(e) => patchDestino({ localidad: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                />
              </div>
              <div>
                <Label>Clave localidad SAT</Label>
                <Input
                  value={destinoForm.localidad_clave}
                  onChange={(e) => patchDestino({ localidad_clave: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                  placeholder="03"
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Input
                  value={destinoForm.estado}
                  onChange={(e) => patchDestino({ estado: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                  className={fh(issueFlags.stops[stopCount]?.estado ?? false)}
                />
              </div>
              <div>
                <Label>CP</Label>
                <Input
                  value={destinoForm.cp}
                  onChange={(e) => patchDestino({ cp: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                  className={fh(issueFlags.stops[stopCount]?.cp ?? false)}
                />
              </div>
              <div>
                <Label>País</Label>
                <Input
                  value={destinoForm.pais}
                  onChange={(e) => patchDestino({ pais: e.target.value })}
                  onBlur={onUbicFieldBlur}
                  disabled={!canFiscalEdit}
                  maxLength={3}
                />
              </div>
            </div>
            <div>
              <Label>Distancia (km)</Label>
              <Input
                type="number"
                value={destinoForm.distancia_km}
                onChange={(e) => patchDestino({ distancia_km: e.target.value })}
                onBlur={onUbicFieldBlur}
                disabled={!canFiscalEdit}
                className={fh(issueFlags.stops[stopCount]?.distancia_km ?? false)}
              />
            </div>
            <div>
              <Label>Fecha/hora llegada</Label>
              <Input
                type="datetime-local"
                value={destinoForm.fecha_hora}
                onChange={(e) => patchDestino({ fecha_hora: e.target.value })}
                onBlur={onUbicFieldBlur}
                disabled={!canFiscalEdit}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {middleForms.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {middleForms.map((mf, idx) => {
            const stopFlags = issueFlags.stops[mf.orden];
            return (
              <Card
                key={mf.orden}
                ref={(el) => {
                  sectionRefs.current[`stop-${mf.orden}`] = el;
                }}
                className={cn("tlo-shadow-md", ch(stopFlags?.highlight ?? false))}
              >
                <CardHeader>
                  <CardTitle className="text-sm">{mf.label}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <div>
                    <Label>Calle</Label>
                    <Input
                      value={mf.calle}
                      onChange={(e) => patchMiddle(idx, { calle: e.target.value })}
                      onBlur={onUbicFieldBlur}
                      disabled={!canFiscalEdit}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Estado</Label>
                      <Input
                        value={mf.estado}
                        onChange={(e) => patchMiddle(idx, { estado: e.target.value })}
                        onBlur={onUbicFieldBlur}
                        disabled={!canFiscalEdit}
                        className={fh(stopFlags?.estado ?? false)}
                      />
                    </div>
                    <div>
                      <Label>CP</Label>
                      <Input
                        value={mf.cp}
                        onChange={(e) => patchMiddle(idx, { cp: e.target.value })}
                        onBlur={onUbicFieldBlur}
                        disabled={!canFiscalEdit}
                        className={fh(stopFlags?.cp ?? false)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Distancia del tramo (km)</Label>
                    <Input
                      type="number"
                      value={mf.distancia_km}
                      onChange={(e) => patchMiddle(idx, { distancia_km: e.target.value })}
                      onBlur={onUbicFieldBlur}
                      disabled={!canFiscalEdit}
                      className={fh(stopFlags?.distancia_km ?? false)}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card
        ref={(el) => {
          sectionRefs.current.mercancias = el;
        }}
        className={cn(
          "tlo-shadow-md",
          ch(issueFlags.hasMercanciasIssue || issueFlags.ubicacionesMin),
        )}
      >
        <CardHeader>
          <CardTitle className="text-sm">Mercancías</CardTitle>
        </CardHeader>
        <CardContent>
          {canFiscalEdit && (
            <div className="grid md:grid-cols-6 gap-2 mb-4">
              <div className="md:col-span-2">
                <Label>Descripción</Label>
                <Input
                  value={merc.descripcion}
                  onChange={(e) => setMerc({ ...merc, descripcion: e.target.value })}
                />
              </div>
              <div>
                <Label>Clave bienes transp. (CP)</Label>
                <Input
                  value={merc.clave_prod_serv}
                  onChange={(e) => setMerc({ ...merc, clave_prod_serv: e.target.value })}
                />
              </div>
              <div>
                <Label>Unidad</Label>
                <Input
                  value={merc.unidad}
                  onChange={(e) => setMerc({ ...merc, unidad: e.target.value })}
                />
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
                    {canFiscalEdit && (
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
