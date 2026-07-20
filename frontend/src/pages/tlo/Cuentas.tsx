import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTlo } from "@/context/TloContext";
import { fmtMXNDecimal } from "@/lib/format";
import {
  addAccountPaymentApi,
  backfillAccountDocumentsApi,
  cancelAccountDocumentApi,
  createAccountDocumentApi,
  fetchAccountAging,
  fetchAccountDocument,
  fetchAccountDocuments,
  fetchSuppliers,
  patchAccountDocumentApi,
} from "@/lib/tloApi";
import type {
  AccountDocument,
  AccountDocumentTipo,
  AgingBucket,
  AgingSummary,
  Supplier,
} from "@/types/tlo";
import { toast } from "sonner";

const BUCKET_LABELS: Record<AgingBucket, string> = {
  corriente: "Corriente",
  "1-30": "Vencido 1–30",
  "31-60": "Vencido 31–60",
  "90+": "Vencido 90+",
};

const ORIGEN_LABELS: Record<string, string> = {
  manual: "Manual",
  viaje: "Viaje",
  combustible: "Combustible",
  mantenimiento: "Mantenimiento",
  gasto: "Gasto",
};

function statusBadgeVariant(display: string): "default" | "secondary" | "destructive" | "outline" {
  if (display === "Vencida") return "destructive";
  if (display === "Pagada") return "secondary";
  if (display === "Cancelada") return "outline";
  return "default";
}

export default function Cuentas() {
  const { hasPermission } = useAuth();
  const { clients } = useTlo();
  const canView = hasPermission("cuentas.ver");
  const canManage = hasPermission("cuentas.gestionar");
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTipo = searchParams.get("tipo") === "cxp" ? "cxp" : "cxc";
  const [tipo, setTipo] = useState<AccountDocumentTipo>(initialTipo);
  const [docs, setDocs] = useState<AccountDocument[]>([]);
  const [aging, setAging] = useState<AgingSummary | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState<string>("all");
  const [estatus, setEstatus] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [selected, setSelected] = useState<AccountDocument | null>(null);
  const [editForm, setEditForm] = useState({
    entidad_nombre: "",
    folio: "",
    concepto: "",
    fecha_emision: "",
    plazo_credito_dias: "" as string,
    fecha_vencimiento: "" as string,
    monto_original: "",
    client_id: "",
    supplier_id: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const resolveVencimiento = (fechaEmision: string, plazoStr: string): string => {
    if (!fechaEmision || plazoStr === "") return "";
    const plazo = Number(plazoStr);
    if (!Number.isFinite(plazo) || plazo < 0) return "";
    const d = new Date(`${fechaEmision}T12:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + Math.floor(plazo));
    return d.toISOString().slice(0, 10);
  };

  const [form, setForm] = useState({
    entidad_id: "",
    entidad_nombre: "",
    folio: "",
    concepto: "",
    fecha_emision: new Date().toISOString().slice(0, 10),
    plazo_credito_dias: "" as string,
    monto_original: "",
  });
  const [payForm, setPayForm] = useState({
    monto: "",
    fecha: new Date().toISOString().slice(0, 10),
    nota: "",
  });

  const fillEditForm = (d: AccountDocument) => {
    setEditForm({
      entidad_nombre: d.entidad_nombre,
      folio: d.folio,
      concepto: d.concepto,
      fecha_emision: d.fecha_emision,
      plazo_credito_dias: d.plazo_credito_dias != null ? String(d.plazo_credito_dias) : "",
      fecha_vencimiento: d.fecha_vencimiento ?? "",
      monto_original: String(d.monto_original),
      client_id: d.client_id ?? "",
      supplier_id: d.supplier_id ?? "",
    });
  };

  const openDetail = (d: AccountDocument) => {
    setSelected(d);
    fillEditForm(d);
    setDetailOpen(true);
    void fetchAccountDocument(d.id)
      .then((full) => {
        setSelected(full);
        fillEditForm(full);
      })
      .catch(() => undefined);
  };

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [list, summary] = await Promise.all([
        fetchAccountDocuments({
          tipo,
          q: q.trim() || undefined,
          bucket: bucket === "all" ? undefined : bucket,
          estatus: estatus === "all" ? undefined : estatus,
        }),
        fetchAccountAging(tipo),
      ]);
      setDocs(list);
      setAging(summary);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar cuentas");
    } finally {
      setLoading(false);
    }
  }, [canView, tipo, q, bucket, estatus]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tipo === "cxp") {
      void fetchSuppliers()
        .then(setSuppliers)
        .catch(() => setSuppliers([]));
    }
  }, [tipo]);

  useEffect(() => {
    const docId = searchParams.get("doc");
    if (!docId || !canView) return;
    void fetchAccountDocument(docId)
      .then((d) => {
        setSelected(d);
        fillEditForm(d);
        setDetailOpen(true);
        setTipo(d.tipo);
      })
      .catch(() => toast.error("Documento no encontrado"));
  }, [searchParams, canView]);

  const totals = useMemo(
    () =>
      aging?.totals ?? {
        corriente: { count: 0, saldo: 0 },
        "1-30": { count: 0, saldo: 0 },
        "31-60": { count: 0, saldo: 0 },
        "90+": { count: 0, saldo: 0 },
      },
    [aging],
  );

  if (!canView) {
    return <p className="text-sm text-muted-foreground">No tienes permiso para ver cuentas.</p>;
  }

  const openCreate = () => {
    setForm({
      entidad_id: "",
      entidad_nombre: "",
      folio: "",
      concepto: "",
      fecha_emision: new Date().toISOString().slice(0, 10),
      plazo_credito_dias: "",
      monto_original: "",
    });
    setCreateOpen(true);
  };

  const saveCreate = async () => {
    const monto = Number(form.monto_original);
    if (!form.folio.trim() || !form.concepto.trim() || !(monto > 0)) {
      toast.error("Folio, concepto y monto son requeridos");
      return;
    }
    try {
      await createAccountDocumentApi({
        tipo,
        client_id: tipo === "cxc" ? form.entidad_id || null : null,
        supplier_id: tipo === "cxp" ? form.entidad_id || null : null,
        entidad_nombre: form.entidad_nombre || undefined,
        folio: form.folio.trim(),
        concepto: form.concepto.trim(),
        fecha_emision: form.fecha_emision,
        plazo_credito_dias: form.plazo_credito_dias === "" ? null : Number(form.plazo_credito_dias),
        monto_original: monto,
      });
      toast.success("Documento registrado");
      setCreateOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear");
    }
  };

  const savePayment = async () => {
    if (!selected) return;
    const monto = Number(payForm.monto);
    if (!(monto > 0)) {
      toast.error("Monto inválido");
      return;
    }
    try {
      const updated = await addAccountPaymentApi(selected.id, {
        monto,
        fecha: payForm.fecha,
        nota: payForm.nota || undefined,
      });
      toast.success("Abono registrado");
      setPaymentOpen(false);
      setSelected(updated);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al abonar");
    }
  };

  return (
    <div className="space-y-4">
      <Tabs
        value={tipo}
        onValueChange={(v) => {
          const next = v === "cxp" ? "cxp" : "cxc";
          setTipo(next);
          setSearchParams((prev) => {
            const p = new URLSearchParams(prev);
            p.set("tipo", next);
            return p;
          });
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="cxc">Por cobrar (CXC)</TabsTrigger>
            <TabsTrigger value="cxp">Por pagar (CXP)</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            {canManage && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const r = await backfillAccountDocumentsApi();
                      toast.success(`Sincronizados CXC ${r.cxc}, CXP ${r.cxp}`);
                      await load();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Error al sincronizar");
                    }
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-1" /> Sincronizar existentes
                </Button>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1" /> Alta manual
                </Button>
              </>
            )}
          </div>
        </div>

        <TabsContent value={tipo} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.keys(BUCKET_LABELS) as AgingBucket[]).map((key) => (
              <Card
                key={key}
                className={`p-4 cursor-pointer transition-colors ${
                  bucket === key ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setBucket(bucket === key ? "all" : key)}
              >
                <p className="text-xs text-muted-foreground">{BUCKET_LABELS[key]}</p>
                <p className="text-lg font-semibold mt-1">{fmtMXNDecimal(totals[key].saldo)}</p>
                <p className="text-xs text-muted-foreground">{totals[key].count} docs</p>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              placeholder="Buscar folio, concepto, entidad…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Select value={estatus} onValueChange={setEstatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Estatus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="abierta">Abierta</SelectItem>
                <SelectItem value="pagada">Pagada</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            {loading && <span className="text-sm text-muted-foreground self-center">Cargando…</span>}
          </div>

          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Folio</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Emisión</TableHead>
                  <TableHead>Plazo</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Abonos</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead>Origen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow
                    key={d.id}
                    className="cursor-pointer"
                    onClick={() => openDetail(d)}
                  >
                    <TableCell className="font-medium">{d.entidad_nombre}</TableCell>
                    <TableCell>{d.folio}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{d.concepto}</TableCell>
                    <TableCell>{d.fecha_emision}</TableCell>
                    <TableCell>
                      {d.plazo_credito_dias != null ? `${d.plazo_credito_dias} días` : "No especificado"}
                    </TableCell>
                    <TableCell>{d.fecha_vencimiento || "—"}</TableCell>
                    <TableCell className="text-right">{fmtMXNDecimal(d.monto_original)}</TableCell>
                    <TableCell className="text-right">{fmtMXNDecimal(d.abonos)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {fmtMXNDecimal(d.saldo_pendiente)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(d.estatus_display)}>{d.estatus_display}</Badge>
                    </TableCell>
                    <TableCell>
                      {d.trip_id && d.origen === "viaje" ? (
                        <Link
                          to={`/viajes/${d.trip_id}`}
                          className="text-primary underline-offset-2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Viaje
                        </Link>
                      ) : (
                        ORIGEN_LABELS[d.origen] ?? d.origen
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!docs.length && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      Sin documentos
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Alta manual {tipo === "cxc" ? "CXC" : "CXP"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{tipo === "cxc" ? "Cliente" : "Proveedor"}</Label>
              <Select
                value={form.entidad_id || "__none__"}
                onValueChange={(v) => {
                  if (v === "__none__") {
                    setForm({ ...form, entidad_id: "", entidad_nombre: "" });
                    return;
                  }
                  if (tipo === "cxc") {
                    const c = clients.find((x) => x.id === v);
                    setForm({
                      ...form,
                      entidad_id: v,
                      entidad_nombre: c?.razon_social ?? "",
                      plazo_credito_dias:
                        c?.dias_credito != null ? String(c.dias_credito) : form.plazo_credito_dias,
                    });
                  } else {
                    const s = suppliers.find((x) => x.id === v);
                    setForm({
                      ...form,
                      entidad_id: v,
                      entidad_nombre: s?.razon_social ?? "",
                      plazo_credito_dias:
                        s?.dias_credito != null ? String(s.dias_credito) : form.plazo_credito_dias,
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {tipo === "cxc"
                    ? clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.razon_social}
                        </SelectItem>
                      ))
                    : suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.razon_social}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
            {tipo === "cxp" && !form.entidad_id && (
              <div>
                <Label>Nombre de entidad</Label>
                <Input
                  value={form.entidad_nombre}
                  onChange={(e) => setForm({ ...form, entidad_nombre: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Folio</Label>
                <Input value={form.folio} onChange={(e) => setForm({ ...form, folio: e.target.value })} />
              </div>
              <div>
                <Label>Fecha emisión</Label>
                <Input
                  type="date"
                  value={form.fecha_emision}
                  onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })}
                />
              </div>
              <div>
                <Label>Plazo (días)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="No especificado"
                  value={form.plazo_credito_dias}
                  onChange={(e) => setForm({ ...form, plazo_credito_dias: e.target.value })}
                />
              </div>
              <div>
                <Label>Monto original</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.monto_original}
                  onChange={(e) => setForm({ ...form, monto_original: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Concepto</Label>
              <Textarea
                value={form.concepto}
                onChange={(e) => setForm({ ...form, concepto: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveCreate()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Detalle {selected?.folio}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="min-w-0 space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant={statusBadgeVariant(selected.estatus_display)}>
                  {selected.estatus_display}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Origen: {ORIGEN_LABELS[selected.origen] ?? selected.origen}
                  {selected.origen !== "manual" ? " · al guardar se actualiza el origen" : ""}
                </span>
              </div>

              {canManage && selected.estatus !== "cancelada" ? (
                <div className="min-w-0 space-y-3">
                  <div className="min-w-0">
                    <Label>Entidad</Label>
                    <Input
                      className="min-w-0"
                      value={editForm.entidad_nombre}
                      onChange={(e) => setEditForm({ ...editForm, entidad_nombre: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <Label>Folio</Label>
                      <Input
                        className="min-w-0"
                        value={editForm.folio}
                        onChange={(e) => setEditForm({ ...editForm, folio: e.target.value })}
                      />
                    </div>
                    <div className="min-w-0">
                      <Label>Fecha emisión</Label>
                      <Input
                        type="date"
                        className="min-w-0"
                        value={editForm.fecha_emision}
                        onChange={(e) => {
                          const fecha_emision = e.target.value;
                          setEditForm({
                            ...editForm,
                            fecha_emision,
                            fecha_vencimiento: resolveVencimiento(
                              fecha_emision,
                              editForm.plazo_credito_dias,
                            ),
                          });
                        }}
                      />
                    </div>
                    <div className="min-w-0">
                      <Label>Plazo (días)</Label>
                      <Input
                        type="number"
                        min={0}
                        className="min-w-0"
                        placeholder="No especificado"
                        value={editForm.plazo_credito_dias}
                        onChange={(e) => {
                          const plazo_credito_dias = e.target.value;
                          setEditForm({
                            ...editForm,
                            plazo_credito_dias,
                            fecha_vencimiento: resolveVencimiento(
                              editForm.fecha_emision,
                              plazo_credito_dias,
                            ),
                          });
                        }}
                      />
                    </div>
                    <div className="min-w-0">
                      <Label>Vencimiento</Label>
                      <Input
                        type="date"
                        className="min-w-0"
                        value={editForm.fecha_vencimiento}
                        onChange={(e) =>
                          setEditForm({ ...editForm, fecha_vencimiento: e.target.value })
                        }
                      />
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <Label>Monto original</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="min-w-0"
                        value={editForm.monto_original}
                        onChange={(e) => setEditForm({ ...editForm, monto_original: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <Label>Concepto</Label>
                    <Textarea
                      className="min-w-0"
                      value={editForm.concepto}
                      onChange={(e) => setEditForm({ ...editForm, concepto: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <p>Saldo: {fmtMXNDecimal(selected.saldo_pendiente)}</p>
                    <p>Abonos: {fmtMXNDecimal(selected.abonos)}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-muted-foreground">Entidad</p>
                    <p className="font-medium">{selected.entidad_nombre}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Estatus</p>
                    <Badge variant={statusBadgeVariant(selected.estatus_display)}>
                      {selected.estatus_display}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Monto</p>
                    <p>{fmtMXNDecimal(selected.monto_original)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Saldo</p>
                    <p className="font-medium">{fmtMXNDecimal(selected.saldo_pendiente)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Emisión</p>
                    <p>{selected.fecha_emision}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Vencimiento</p>
                    <p>{selected.fecha_vencimiento || "—"}</p>
                  </div>
                  <p className="col-span-2 text-muted-foreground">{selected.concepto}</p>
                </div>
              )}

              {selected.trip_id && (
                <Link to={`/viajes/${selected.trip_id}`} className="text-primary underline text-sm">
                  Ver viaje relacionado
                </Link>
              )}
              {!!selected.payments?.length && (
                <div>
                  <p className="font-medium mb-1">Abonos</p>
                  <ul className="space-y-1">
                    {selected.payments.map((p) => (
                      <li key={p.id} className="flex justify-between">
                        <span>
                          {p.fecha}
                          {p.nota ? ` · ${p.nota}` : ""}
                        </span>
                        <span>{fmtMXNDecimal(p.monto)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {canManage && selected?.estatus === "abierta" && selected.abonos === 0 && (
                <Button variant="destructive" onClick={() => setCancelConfirmOpen(true)}>
                  Cancelar documento
                </Button>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setDetailOpen(false)}>
                Cerrar
              </Button>
              {canManage && selected?.estatus === "abierta" && selected.saldo_pendiente > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPayForm({
                      monto: String(selected.saldo_pendiente),
                      fecha: new Date().toISOString().slice(0, 10),
                      nota: "",
                    });
                    setPaymentOpen(true);
                  }}
                >
                  Registrar abono
                </Button>
              )}
              {canManage && selected?.estatus !== "cancelada" && (
                <Button
                  disabled={savingEdit}
                  onClick={async () => {
                    if (!selected) return;
                    const monto = Number(editForm.monto_original);
                    if (!editForm.folio.trim() || !editForm.concepto.trim() || !(monto > 0)) {
                      toast.error("Folio, concepto y monto son requeridos");
                      return;
                    }
                    setSavingEdit(true);
                    try {
                      const updated = await patchAccountDocumentApi(selected.id, {
                        folio: editForm.folio.trim(),
                        concepto: editForm.concepto.trim(),
                        fecha_emision: editForm.fecha_emision,
                        plazo_credito_dias:
                          editForm.plazo_credito_dias === ""
                            ? null
                            : Number(editForm.plazo_credito_dias),
                        fecha_vencimiento: editForm.fecha_vencimiento || null,
                        monto_original: monto,
                        entidad_nombre: editForm.entidad_nombre.trim() || undefined,
                        client_id: selected.tipo === "cxc" ? editForm.client_id || null : undefined,
                        supplier_id:
                          selected.tipo === "cxp" ? editForm.supplier_id || null : undefined,
                      });
                      setSelected(updated);
                      fillEditForm(updated);
                      toast.success(
                        updated.origen !== "manual"
                          ? "Documento y origen actualizados"
                          : "Documento actualizado",
                      );
                      await load();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Error al guardar");
                    } finally {
                      setSavingEdit(false);
                    }
                  }}
                >
                  Guardar cambios
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={cancelConfirmOpen}
        onOpenChange={(o) => {
          if (!cancelling) setCancelConfirmOpen(o);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar documento {selected?.folio}?</AlertDialogTitle>
            <AlertDialogDescription>
              El documento quedará marcado como cancelado y no podrá recibir abonos. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={cancelling}
              onClick={async () => {
                if (!selected) return;
                setCancelling(true);
                try {
                  await cancelAccountDocumentApi(selected.id);
                  toast.success("Documento cancelado");
                  setCancelConfirmOpen(false);
                  setDetailOpen(false);
                  await load();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "No se pudo cancelar");
                } finally {
                  setCancelling(false);
                }
              }}
            >
              {cancelling ? "Cancelando…" : "Sí, cancelar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar abono</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Monto</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={payForm.monto}
                onChange={(e) => setPayForm({ ...payForm, monto: e.target.value })}
              />
            </div>
            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={payForm.fecha}
                onChange={(e) => setPayForm({ ...payForm, fecha: e.target.value })}
              />
            </div>
            <div>
              <Label>Nota</Label>
              <Input
                value={payForm.nota}
                onChange={(e) => setPayForm({ ...payForm, nota: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void savePayment()}>Guardar abono</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
