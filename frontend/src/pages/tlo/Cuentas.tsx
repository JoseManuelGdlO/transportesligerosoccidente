import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTlo } from "@/context/TloContext";
import { endOfWeek, fmtMXNDecimal, isoDay, startOfWeek } from "@/lib/format";
import { montoCobroDefault, correoComplementoBody, MENSAJE_CORREO_DEFAULT, pendingComplementIdFromError } from "@/lib/paymentComplement";
import { slicePage } from "@/lib/tableFilters";
import { AccountStatementPdfDialog } from "@/components/tlo/AccountStatementPdfDialog";
import { ComplementoCorreoFields } from "@/components/tlo/ComplementoCorreoFields";
import { ConceptosEditor } from "@/components/tlo/ConceptosEditor";
import { ClientCombobox } from "@/components/tlo/ClientCombobox";
import {
  emptyConcepto,
  filledConceptos,
  sumConceptos,
  validateConceptos,
  type DocumentConcepto,
} from "@/lib/documentConceptos";
import {
  addAccountPaymentApi,
  backfillAccountDocumentsApi,
  cancelAccountDocumentApi,
  createAccountDocumentApi,
  createComplementFromPaymentsApi,
  createPaymentComplementApi,
  discardPaymentComplementApi,
  downloadPaymentComplementFile,
  fetchAccountAging,
  fetchAccountDocument,
  fetchAccountDocuments,
  fetchSuppliers,
  patchAccountDocumentApi,
  retryPaymentComplementApi,
  type PaymentComplementResult,
} from "@/lib/tloApi";
import type {
  AccountDocument,
  AccountDocumentPayment,
  AccountDocumentTipo,
  AgingBucket,
  AgingSummary,
  Supplier,
} from "@/types/tlo";
import { toast } from "sonner";

/** Catálogo SAT c_FormaPago usable en complemento (99 “Por definir” no aplica). */
const FORMAS_PAGO_COMPLEMENTO = [
  ["01", "Efectivo"],
  ["02", "Cheque nominativo"],
  ["03", "Transferencia electrónica de fondos"],
  ["04", "Tarjeta de crédito"],
  ["05", "Monedero electrónico"],
  ["06", "Dinero electrónico"],
  ["08", "Vales de despensa"],
  ["12", "Dación en pago"],
  ["13", "Pago por subrogación"],
  ["14", "Pago por consignación"],
  ["15", "Condonación"],
  ["17", "Compensación"],
  ["23", "Novación"],
  ["24", "Confusión"],
  ["25", "Remisión de deuda"],
  ["26", "Prescripción o caducidad"],
  ["27", "A satisfacción del acreedor"],
  ["28", "Tarjeta de débito"],
  ["29", "Tarjeta de servicios"],
  ["30", "Aplicación de anticipos"],
  ["31", "Intermediario pagos"],
] as const;

function FormaPagoSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Forma de pago" />
      </SelectTrigger>
      <SelectContent>
        {FORMAS_PAGO_COMPLEMENTO.map(([code, label]) => (
          <SelectItem key={code} value={code}>
            {code} — {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const BUCKET_LABELS: Record<AgingBucket, string> = {
  corriente: "Corriente",
  "1-30": "Vencido 1–30",
  "31-60": "Vencido 31–60",
  "90+": "Vencido 61+",
};

function AccountStatusBadge({ display }: { display: string }) {
  return (
    <Badge
      variant={
        display === "Vencida"
          ? "destructive"
          : display === "Pagada"
            ? "secondary"
            : display === "Cancelada"
              ? "outline"
              : "default"
      }
      className={
        display === "Al día" ? "border-transparent bg-emerald-600 text-white hover:bg-emerald-600" : undefined
      }
    >
      {display}
    </Badge>
  );
}

const ORIGEN_LABELS: Record<string, string> = {
  manual: "Manual",
  viaje: "Viaje",
  combustible: "Combustible",
  mantenimiento: "Mantenimiento",
  gasto: "Gasto",
};

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
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [selected, setSelected] = useState<AccountDocument | null>(null);
  const [editForm, setEditForm] = useState({
    entidad_nombre: "",
    folio: "",
    fecha_emision: "",
    fecha_ingreso_cobranza: "",
    plazo_credito_dias: "" as string,
    fecha_vencimiento: "" as string,
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
    fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_ingreso_cobranza: new Date().toISOString().slice(0, 10),
    plazo_credito_dias: "" as string,
  });
  const [createConceptos, setCreateConceptos] = useState<DocumentConcepto[]>([emptyConcepto()]);
  const [editConceptos, setEditConceptos] = useState<DocumentConcepto[]>([emptyConcepto()]);
  const [payForm, setPayForm] = useState({
    monto: "",
    fecha: new Date().toISOString().slice(0, 10),
    nota: "",
  });
  const [cobroOpen, setCobroOpen] = useState(false);
  const [cobroLoading, setCobroLoading] = useState(false);
  const [cobroSaving, setCobroSaving] = useState(false);
  const [cobroFecha, setCobroFecha] = useState(new Date().toISOString().slice(0, 10));
  const [cobroForma, setCobroForma] = useState("03");
  const [cobroTipoCambio, setCobroTipoCambio] = useState("");
  const [cobroRows, setCobroRows] = useState<
    { doc: AccountDocument; checked: boolean; monto: string }[]
  >([]);
  const [stampOpen, setStampOpen] = useState(false);
  const [stampSaving, setStampSaving] = useState(false);
  const [stampFecha, setStampFecha] = useState(new Date().toISOString().slice(0, 10));
  const [stampForma, setStampForma] = useState("03");
  const [stampTipoCambio, setStampTipoCambio] = useState("");
  const [stampPayments, setStampPayments] = useState<AccountDocumentPayment[]>([]);
  const [stampIds, setStampIds] = useState<string[]>([]);
  const [enviarCorreo, setEnviarCorreo] = useState(false);
  const [correoEmail, setCorreoEmail] = useState("");
  const [correoMensaje, setCorreoMensaje] = useState(MENSAJE_CORREO_DEFAULT);
  const cobroLoadSeq = useRef(0);

  const resetCorreo = (clientId?: string | null) => {
    setEnviarCorreo(false);
    setCorreoEmail(clients.find((c) => c.id === clientId)?.email ?? "");
    setCorreoMensaje(MENSAJE_CORREO_DEFAULT);
  };

  const fillEditForm = (d: AccountDocument) => {
    setEditForm({
      entidad_nombre: d.entidad_nombre,
      folio: d.folio,
      fecha_emision: d.fecha_emision,
      fecha_ingreso_cobranza: d.fecha_ingreso_cobranza ?? "",
      plazo_credito_dias: d.plazo_credito_dias != null ? String(d.plazo_credito_dias) : "",
      fecha_vencimiento: d.fecha_vencimiento ?? "",
      client_id: d.client_id ?? "",
      supplier_id: d.supplier_id ?? "",
    });
    setEditConceptos(d.conceptos);
  };

  const openDetail = (d: AccountDocument) => {
    setSelected(d);
    fillEditForm(d);
    setDetailOpen(true);
    setDetailLoading(true);
    void fetchAccountDocument(d.id)
      .then((full) => {
        setSelected(full);
        fillEditForm(full);
      })
      .catch(() => undefined)
      .finally(() => setDetailLoading(false));
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
          estatus:
            estatus === "all" || estatus === "al_dia" || estatus === "vencida" ? undefined : estatus,
          desde: fechaDesde || undefined,
          hasta: fechaHasta || undefined,
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
  }, [canView, tipo, q, bucket, estatus, fechaDesde, fechaHasta]);

  const applyFiltroHoy = useCallback(() => {
    const d = isoDay(new Date());
    setFechaDesde(d);
    setFechaHasta(d);
  }, []);

  const applyFiltroSemanaActual = useCallback(() => {
    const today = new Date();
    setFechaDesde(isoDay(startOfWeek(today)));
    setFechaHasta(isoDay(endOfWeek(today)));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [q, bucket, estatus, fechaDesde, fechaHasta, tipo, pageSize]);

  const listedDocs = useMemo(() => {
    if (estatus === "al_dia") return docs.filter((d) => d.estatus_display === "Al día");
    if (estatus === "vencida") return docs.filter((d) => d.estatus_display === "Vencida");
    return docs;
  }, [docs, estatus]);

  const pageData = useMemo(
    () => slicePage(listedDocs, page, pageSize),
    [listedDocs, page, pageSize],
  );

  const statementTotals = aging?.statement ?? { pendiente: 0, vencido: 0, pagadas: 0 };

  useEffect(() => {
    if (pageData.safePage !== page) setPage(pageData.safePage);
  }, [pageData.safePage, page]);

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
    setDetailLoading(true);
    void fetchAccountDocument(docId)
      .then((d) => {
        setSelected(d);
        fillEditForm(d);
        setDetailOpen(true);
        setTipo(d.tipo);
      })
      .catch(() => toast.error("Documento no encontrado"))
      .finally(() => setDetailLoading(false));
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
    const hoy = new Date().toISOString().slice(0, 10);
    setForm({
      entidad_id: "",
      entidad_nombre: "",
      folio: "",
      fecha_emision: hoy,
      fecha_ingreso_cobranza: hoy,
      plazo_credito_dias: "",
    });
    setCreateConceptos([emptyConcepto()]);
    setCreateOpen(true);
  };

  const saveCreate = async () => {
    const conceptoError = validateConceptos(createConceptos);
    if (!form.folio.trim() || conceptoError) {
      toast.error(conceptoError || "Folio y conceptos son requeridos");
      return;
    }
    const lineas = filledConceptos(createConceptos);
    const monto = sumConceptos(lineas);
    if (!(monto > 0)) {
      toast.error("El total de conceptos debe ser mayor a 0");
      return;
    }
    try {
      await createAccountDocumentApi({
        tipo,
        client_id: tipo === "cxc" ? form.entidad_id || null : null,
        supplier_id: tipo === "cxp" ? form.entidad_id || null : null,
        entidad_nombre: form.entidad_nombre || undefined,
        folio: form.folio.trim(),
        conceptos: lineas,
        fecha_emision: form.fecha_emision,
        fecha_ingreso_cobranza: form.fecha_ingreso_cobranza || null,
        plazo_credito_dias: form.plazo_credito_dias === "" ? null : Number(form.plazo_credito_dias),
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

  const refreshAfterComplement = async (documentId: string) => {
    const full = await fetchAccountDocument(documentId).catch(() => null);
    if (full) {
      setSelected(full);
      fillEditForm(full);
      setDetailOpen(true);
    }
    await load();
  };

  const showComplementToast = (documentId: string, result: PaymentComplementResult) => {
    if (result.status === 201) {
      toast.success(result.dto.uuid ? `Complemento timbrado ${result.dto.uuid}` : "Complemento timbrado");
      setCobroOpen(false);
      setStampOpen(false);
      setDetailOpen(true);
      void refreshAfterComplement(documentId);
      return;
    }
    const complementId = result.dto.id;
    toast.error(result.dto.error_mensaje || "No se pudo timbrar el complemento", {
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: "Reintentar",
        onClick: () => {
          void (async () => {
            try {
              const again = await retryPaymentComplementApi(complementId);
              showComplementToast(documentId, again);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "No se pudo reintentar");
            }
          })();
        },
      },
      cancel: {
        label: "Descartar",
        onClick: () => {
          void (async () => {
            try {
              await discardPaymentComplementApi(complementId);
              toast.success("Complemento descartado");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "No se pudo descartar");
            }
          })();
        },
      },
    });
  };

  const openCobroDialog = () => {
    if (!selected) return;
    const clientId = selected.client_id;
    const currentId = selected.id;
    setCobroFecha(new Date().toISOString().slice(0, 10));
    setCobroForma("03");
    setCobroTipoCambio("");
    setCobroRows([]);
    resetCorreo(clientId);
    setCobroOpen(true);
    setCobroLoading(true);
    const seq = ++cobroLoadSeq.current;
    const candidates = docs.filter(
      (d) =>
        d.client_id === clientId &&
        d.origen === "viaje" &&
        d.tipo === "cxc" &&
        d.estatus === "abierta",
    );
    const ids = [...new Set(candidates.map((d) => d.id))];
    if (clientId && !ids.includes(currentId)) ids.unshift(currentId);
    void Promise.all(ids.map((id) => fetchAccountDocument(id).catch(() => null))).then((rows) => {
      if (seq !== cobroLoadSeq.current) return;
      const eligible = rows.filter(
        (d): d is AccountDocument => d != null && d.complemento_disponible === true,
      );
      setCobroRows(
        eligible.map((doc) => ({
          doc,
          checked: doc.id === currentId,
          monto: String(montoCobroDefault(doc.saldo_pendiente, doc.saldo_sat ?? doc.saldo_pendiente)),
        })),
      );
      setCobroLoading(false);
    });
  };

  const saveCobro = async () => {
    if (!selected?.client_id) {
      toast.error("La factura no tiene cliente");
      return;
    }
    const moneda = selected.moneda || "MXN";
    const esMxn = moneda.toUpperCase() === "MXN";
    const tipoCambio = esMxn ? 1 : Number(cobroTipoCambio);
    if (!/^\d{2}$/.test(cobroForma)) {
      toast.error("La forma de pago debe ser de 2 dígitos");
      return;
    }
    if (!(tipoCambio > 0)) {
      toast.error("Tipo de cambio inválido");
      return;
    }
    const correo = correoComplementoBody(enviarCorreo, correoEmail, correoMensaje);
    if (correo.ok === false) {
      toast.error(correo.error);
      return;
    }
    const documentos = cobroRows
      .filter((row) => row.checked)
      .map((row) => ({ document_id: row.doc.id, monto: Number(row.monto) }));
    if (!documentos.length || documentos.some((doc) => !(doc.monto > 0))) {
      toast.error("Selecciona facturas con monto mayor a 0");
      return;
    }
    setCobroSaving(true);
    try {
      const result = await createPaymentComplementApi({
        client_id: selected.client_id,
        fecha_pago: cobroFecha,
        forma_pago_p: cobroForma,
        moneda_p: moneda,
        tipo_cambio_p: tipoCambio,
        documentos,
        ...correo.fields,
      });
      showComplementToast(selected.id, result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo registrar el cobro";
      const pendingId = pendingComplementIdFromError(message);
      if (pendingId) {
        showComplementToast(selected.id, {
          status: 422,
          dto: { id: pendingId, estatus: "error", error_mensaje: message },
        });
      } else {
        toast.error(message);
      }
    } finally {
      setCobroSaving(false);
    }
  };

  const openStampDialog = () => {
    if (!selected) return;
    const pending = (selected.payments ?? []).filter((payment) => !payment.cfdi_pago_id);
    setStampPayments(pending);
    setStampIds(pending.map((payment) => payment.id));
    setStampFecha(new Date().toISOString().slice(0, 10));
    setStampForma("03");
    setStampTipoCambio("");
    resetCorreo(selected.client_id);
    setStampOpen(true);
  };

  const saveStamp = async () => {
    if (!selected?.client_id) {
      toast.error("La factura no tiene cliente");
      return;
    }
    const moneda = selected.moneda || "MXN";
    const esMxn = moneda.toUpperCase() === "MXN";
    const tipoCambio = esMxn ? 1 : Number(stampTipoCambio);
    if (!/^\d{2}$/.test(stampForma)) {
      toast.error("La forma de pago debe ser de 2 dígitos");
      return;
    }
    if (!(tipoCambio > 0)) {
      toast.error("Tipo de cambio inválido");
      return;
    }
    if (!stampIds.length) {
      toast.error("Selecciona al menos un abono");
      return;
    }
    const correo = correoComplementoBody(enviarCorreo, correoEmail, correoMensaje);
    if (correo.ok === false) {
      toast.error(correo.error);
      return;
    }
    setStampSaving(true);
    try {
      const result = await createComplementFromPaymentsApi({
        client_id: selected.client_id,
        fecha_pago: stampFecha,
        forma_pago_p: stampForma,
        moneda_p: moneda,
        tipo_cambio_p: tipoCambio,
        payment_ids: stampIds,
        ...correo.fields,
      });
      showComplementToast(selected.id, result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudieron timbrar los abonos";
      const pendingId = pendingComplementIdFromError(message);
      if (pendingId) {
        showComplementToast(selected.id, {
          status: 422,
          dto: { id: pendingId, estatus: "error", error_mensaje: message },
        });
      } else {
        toast.error(message);
      }
    } finally {
      setStampSaving(false);
    }
  };

  const cobroMoneda = selected?.moneda || "MXN";
  const cobroEsMxn = cobroMoneda.toUpperCase() === "MXN";
  const abonosSinComplemento = (selected?.payments ?? []).filter((payment) => !payment.cfdi_pago_id);
  const puedeTimbrarAbonos =
    Boolean(selected?.complemento_disponible) && abonosSinComplemento.length > 0;
  const saldoSatReferencia = selected?.saldo_sat ?? selected?.saldo_pendiente ?? 0;

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
            <Button variant="outline" size="sm" onClick={() => setPdfOpen(true)}>
              PDF
            </Button>
            {canManage && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncing(true);
                    try {
                      const r = await backfillAccountDocumentsApi();
                      toast.success(`Sincronizados CXC ${r.cxc}, CXP ${r.cxp}`);
                      await load();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Error al sincronizar");
                    } finally {
                      setSyncing(false);
                    }
                  }}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Sincronizando…" : "Sincronizar existentes"}
                </Button>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1" /> Alta manual
                </Button>
              </>
            )}
          </div>
        </div>

        <TabsContent value={tipo} className="space-y-4 mt-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Toda la cartera</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Pendiente</p>
                <p className="text-lg font-semibold mt-1">{fmtMXNDecimal(statementTotals.pendiente)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Vencido</p>
                <p className="text-lg font-semibold mt-1 text-destructive">
                  {fmtMXNDecimal(statementTotals.vencido)}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Pagadas</p>
                <p className="text-lg font-semibold mt-1">{fmtMXNDecimal(statementTotals.pagadas)}</p>
              </Card>
            </div>
          </div>

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

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-xs"
                placeholder="Buscar folio, concepto, entidad, UUID…"
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
                  <SelectItem value="al_dia">Al día</SelectItem>
                  <SelectItem value="vencida">Vencida</SelectItem>
                  <SelectItem value="pagada">Pagada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
              {loading && <span className="text-sm text-muted-foreground self-center">Cargando…</span>}
            </div>

            <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-3">
              <p className="mb-2 text-xs text-muted-foreground">Fecha de emisión</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Desde</Label>
                  <Input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="w-full sm:w-[160px] bg-background"
                    aria-label="Fecha de emisión desde"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Hasta</Label>
                  <Input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="w-full sm:w-[160px] bg-background"
                    aria-label="Fecha de emisión hasta"
                  />
                </div>
                <div className="flex flex-wrap gap-2 sm:pb-0.5">
                  <Button type="button" variant="outline" size="sm" className="h-9" onClick={applyFiltroHoy}>
                    Hoy
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={applyFiltroSemanaActual}
                  >
                    Semana actual
                  </Button>
                  {(fechaDesde || fechaHasta) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 text-muted-foreground"
                      onClick={() => {
                        setFechaDesde("");
                        setFechaHasta("");
                      }}
                    >
                      Limpiar fechas
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Folio</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Emisión</TableHead>
                  <TableHead>Cobranza</TableHead>
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
                {pageData.slice.map((d) => (
                  <TableRow
                    key={d.id}
                    className="cursor-pointer"
                    onClick={() => openDetail(d)}
                  >
                    <TableCell className="font-medium">{d.entidad_nombre}</TableCell>
                    <TableCell>{d.folio}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{d.concepto}</TableCell>
                    <TableCell>{d.fecha_emision}</TableCell>
                    <TableCell>{d.fecha_ingreso_cobranza || "—"}</TableCell>
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
                      <AccountStatusBadge display={d.estatus_display} />
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
                {!pageData.total && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      Sin documentos
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          {pageData.total > 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
              <p>
                Mostrando{" "}
                <span className="text-foreground font-medium">
                  {pageData.rangeStart}–{pageData.rangeEnd}
                </span>{" "}
                de <span className="text-foreground font-medium">{pageData.total}</span>
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Por página</Label>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(Number(v));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[80px] h-8" aria-label="Filas por página">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <span className="text-xs whitespace-nowrap" aria-live="polite">
                  Página {pageData.safePage} de {pageData.totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 px-2"
                    disabled={pageData.safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Anterior</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 px-2"
                    disabled={pageData.safePage >= pageData.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="Página siguiente"
                  >
                    <span className="hidden sm:inline">Siguiente</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
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
              {tipo === "cxc" ? (
                <ClientCombobox
                  clients={clients}
                  value={form.entidad_id || "__none__"}
                  extraOptions={[{ value: "__none__", label: "—" }]}
                  placeholder="Seleccionar…"
                  onChange={(v) => {
                    if (v === "__none__") {
                      setForm({ ...form, entidad_id: "", entidad_nombre: "" });
                      return;
                    }
                    const c = clients.find((x) => x.id === v);
                    setForm({
                      ...form,
                      entidad_id: v,
                      entidad_nombre: c?.razon_social ?? "",
                      plazo_credito_dias:
                        c?.dias_credito != null ? String(c.dias_credito) : form.plazo_credito_dias,
                    });
                  }}
                />
              ) : (
                <Select
                  value={form.entidad_id || "__none__"}
                  onValueChange={(v) => {
                    if (v === "__none__") {
                      setForm({ ...form, entidad_id: "", entidad_nombre: "" });
                      return;
                    }
                    const s = suppliers.find((x) => x.id === v);
                    setForm({
                      ...form,
                      entidad_id: v,
                      entidad_nombre: s?.razon_social ?? "",
                      plazo_credito_dias:
                        s?.dias_credito != null ? String(s.dias_credito) : form.plazo_credito_dias,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {suppliers
                      .filter(
                        (s) =>
                          (s.origen ?? "manual") === "manual" &&
                          (s.estatus ?? "activo") === "activo",
                      )
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.razon_social}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
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
                <Label>Ingreso a cobranza</Label>
                <Input
                  type="date"
                  value={form.fecha_ingreso_cobranza}
                  onChange={(e) => setForm({ ...form, fecha_ingreso_cobranza: e.target.value })}
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
            </div>
            <ConceptosEditor value={createConceptos} onChange={setCreateConceptos} />
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle {selected?.folio}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="min-w-0 space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <AccountStatusBadge display={selected.estatus_display} />
                <span className="text-xs text-muted-foreground">
                  Origen: {ORIGEN_LABELS[selected.origen] ?? selected.origen}
                  {selected.origen === "viaje"
                    ? ". El cambio de cliente se guarda en el viaje; si la factura de ingreso está timbrada, el monto y el folio no cambian la tarifa, y si el viaje no tiene esa factura, el monto y el folio sí se guardan en el viaje."
                    : selected.origen !== "manual"
                      ? `. Los cambios de monto, folio o fecha también se guardan en el registro de ${ORIGEN_LABELS[selected.origen] ?? selected.origen}.`
                      : ""}
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
                              editForm.fecha_ingreso_cobranza || fecha_emision,
                              editForm.plazo_credito_dias,
                            ),
                          });
                        }}
                      />
                    </div>
                    <div className="min-w-0">
                      <Label>Ingreso a cobranza</Label>
                      <Input
                        type="date"
                        className="min-w-0"
                        value={editForm.fecha_ingreso_cobranza}
                        onChange={(e) => {
                          const fecha_ingreso_cobranza = e.target.value;
                          setEditForm({
                            ...editForm,
                            fecha_ingreso_cobranza,
                            fecha_vencimiento: resolveVencimiento(
                              fecha_ingreso_cobranza || editForm.fecha_emision,
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
                              editForm.fecha_ingreso_cobranza || editForm.fecha_emision,
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
                  </div>
                  <ConceptosEditor value={editConceptos} onChange={setEditConceptos} />
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
                    <AccountStatusBadge display={selected.estatus_display} />
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
                    <p className="text-muted-foreground">Ingreso a cobranza</p>
                    <p>{selected.fecha_ingreso_cobranza || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Vencimiento</p>
                    <p>{selected.fecha_vencimiento || "—"}</p>
                  </div>
                  <div className="col-span-2 space-y-1">
                    {selected.conceptos.map((c, i) => (
                      <p key={`${c.descripcion}-${i}`} className="flex justify-between gap-3">
                        <span>{c.descripcion}</span>
                        <span>{fmtMXNDecimal(c.precio)}</span>
                      </p>
                    ))}
                  </div>
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
                  <ul className="space-y-2">
                    {selected.payments.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {p.fecha}
                          {p.nota ? ` · ${p.nota}` : ""}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          {p.cfdi_pago_id ? (
                            <>
                              <span>Timbrado</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  void downloadPaymentComplementFile(p.cfdi_pago_id!, "xml").catch((e) =>
                                    toast.error(
                                      e instanceof Error ? e.message : "No se pudo descargar el XML",
                                    ),
                                  );
                                }}
                              >
                                XML
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  void downloadPaymentComplementFile(p.cfdi_pago_id!, "pdf").catch((e) =>
                                    toast.error(
                                      e instanceof Error ? e.message : "No se pudo descargar el PDF",
                                    ),
                                  );
                                }}
                              >
                                PDF
                              </Button>
                            </>
                          ) : (
                            <span>Sin timbrar</span>
                          )}
                          <span>{fmtMXNDecimal(p.monto)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {puedeTimbrarAbonos && selected.saldo_pendiente < saldoSatReferencia && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Hay abonos capturados que el SAT todavía no tiene.
                    </p>
                  )}
                  {canManage && puedeTimbrarAbonos && (
                    <Button variant="secondary" className="mt-2" onClick={openStampDialog}>
                      Timbrar abonos sin complemento
                    </Button>
                  )}
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
              {canManage && detailLoading && selected?.estatus === "abierta" && selected.saldo_pendiente > 0 && (
                <Button variant="secondary" disabled>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando…
                </Button>
              )}
              {canManage &&
                !detailLoading &&
                selected?.complemento_disponible &&
                selected.estatus === "abierta" &&
                selected.saldo_pendiente > 0 && (
                  <Button variant="secondary" onClick={openCobroDialog}>
                    Registrar cobro
                  </Button>
                )}
              {canManage &&
                !detailLoading &&
                selected?.estatus === "abierta" &&
                selected.saldo_pendiente > 0 &&
                !selected.complemento_disponible && (
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
                    const conceptoError = validateConceptos(editConceptos);
                    if (!editForm.folio.trim() || conceptoError) {
                      toast.error(conceptoError || "Folio y conceptos son requeridos");
                      return;
                    }
                    const lineas = filledConceptos(editConceptos);
                    const monto = sumConceptos(lineas);
                    if (!(monto > 0)) {
                      toast.error("El total de conceptos debe ser mayor a 0");
                      return;
                    }
                    setSavingEdit(true);
                    try {
                      const updated = await patchAccountDocumentApi(selected.id, {
                        folio: editForm.folio.trim(),
                        conceptos: lineas,
                        fecha_emision: editForm.fecha_emision,
                        fecha_ingreso_cobranza: editForm.fecha_ingreso_cobranza || null,
                        plazo_credito_dias:
                          editForm.plazo_credito_dias === ""
                            ? null
                            : Number(editForm.plazo_credito_dias),
                        fecha_vencimiento: editForm.fecha_vencimiento || null,
                        entidad_nombre: editForm.entidad_nombre.trim() || undefined,
                        client_id: selected.tipo === "cxc" ? editForm.client_id || null : undefined,
                        supplier_id:
                          selected.tipo === "cxp" ? editForm.supplier_id || null : undefined,
                      });
                      const full = await fetchAccountDocument(selected.id).catch(() => updated);
                      setSelected(full);
                      fillEditForm(full);
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

      <Dialog open={cobroOpen} onOpenChange={setCobroOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar cobro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={cobroFecha} onChange={(e) => setCobroFecha(e.target.value)} />
            </div>
            <div>
              <Label>Forma de pago</Label>
              <FormaPagoSelect value={cobroForma} onChange={setCobroForma} />
            </div>
            <div>
              <Label>Moneda</Label>
              <Input value={cobroMoneda} disabled />
            </div>
            {!cobroEsMxn && (
              <div>
                <Label>Tipo de cambio</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.0001"
                  value={cobroTipoCambio}
                  onChange={(e) => setCobroTipoCambio(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Facturas</Label>
              {cobroLoading ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : cobroRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay facturas con complemento disponible.</p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                  {cobroRows.map((row) => (
                    <label key={row.doc.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={row.checked}
                        onCheckedChange={(v) =>
                          setCobroRows((prev) =>
                            prev.map((item) =>
                              item.doc.id === row.doc.id ? { ...item, checked: v === true } : item,
                            ),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1">
                        {row.doc.folio}
                        <span className="text-muted-foreground">
                          {" "}
                          · saldo {fmtMXNDecimal(row.doc.saldo_pendiente)}
                        </span>
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-28"
                        value={row.monto}
                        onChange={(e) =>
                          setCobroRows((prev) =>
                            prev.map((item) =>
                              item.doc.id === row.doc.id ? { ...item, monto: e.target.value } : item,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
            <ComplementoCorreoFields
              enabled={enviarCorreo}
              onEnabledChange={setEnviarCorreo}
              email={correoEmail}
              onEmailChange={setCorreoEmail}
              mensaje={correoMensaje}
              onMensajeChange={setCorreoMensaje}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCobroOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={cobroSaving || cobroLoading} onClick={() => void saveCobro()}>
              {cobroSaving ? "Timbrando…" : "Timbrar cobro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stampOpen} onOpenChange={setStampOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Timbrar abonos sin complemento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={stampFecha} onChange={(e) => setStampFecha(e.target.value)} />
            </div>
            <div>
              <Label>Forma de pago</Label>
              <FormaPagoSelect value={stampForma} onChange={setStampForma} />
            </div>
            {!cobroEsMxn && (
              <div>
                <Label>Tipo de cambio</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.0001"
                  value={stampTipoCambio}
                  onChange={(e) => setStampTipoCambio(e.target.value)}
                />
              </div>
            )}
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
              {stampPayments.map((payment) => (
                <label key={payment.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={stampIds.includes(payment.id)}
                    onCheckedChange={(v) =>
                      setStampIds((prev) =>
                        v === true
                          ? [...prev, payment.id]
                          : prev.filter((id) => id !== payment.id),
                      )
                    }
                  />
                  <span>
                    {payment.fecha}
                    {payment.nota ? ` · ${payment.nota}` : ""} · {fmtMXNDecimal(payment.monto)}
                  </span>
                </label>
              ))}
            </div>
            <ComplementoCorreoFields
              enabled={enviarCorreo}
              onEnabledChange={setEnviarCorreo}
              email={correoEmail}
              onEmailChange={setCorreoEmail}
              mensaje={correoMensaje}
              onMensajeChange={setCorreoMensaje}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStampOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={stampSaving} onClick={() => void saveStamp()}>
              {stampSaving ? "Timbrando…" : "Timbrar abonos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AccountStatementPdfDialog
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        tipo={tipo}
        listedDocs={listedDocs}
      />
    </div>
  );
}
