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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { montoCobroDefault, complementoExtraBody, correoComplementoBody, MENSAJE_CORREO_DEFAULT, pendingComplementIdFromError, cancelComplementBody } from "@/lib/paymentComplement";
import { planPagoLista } from "@/lib/pagoLista";
import { slicePage } from "@/lib/tableFilters";
import { AccountStatementPdfDialog } from "@/components/tlo/AccountStatementPdfDialog";
import { ComplementoCorreoFields, ComplementoPagoCampos } from "@/components/tlo/ComplementoCorreoFields";
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
  cancelPaymentComplementApi,
  createAccountDocumentApi,
  createComplementFromPaymentsApi,
  createPaymentComplementApi,
  createPaymentComplementsEachApi,
  discardPaymentComplementApi,
  downloadPaymentComplementFile,
  fetchAccountAging,
  fetchAccountDocument,
  assignFechaCobranzaApi,
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
import { tipoDoctoSaldos } from "@/lib/modalidadCobro";
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

const MOTIVOS_CANCELACION_COMPLEMENTO = [
  { value: "02", label: "02 — Comprobante emitido con errores sin relación" },
  { value: "01", label: "01 — Comprobante emitido con errores con relación" },
  { value: "03", label: "03 — No se llevó a cabo la operación" },
  { value: "04", label: "04 — Operación nominativa relacionada en una factura global" },
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

const CATEGORIA_LABEL: Record<string, string> = {
  casetas: "Casetas",
  refacciones: "Refacciones",
  hospedaje: "Hospedaje",
  comidas: "Comidas",
  otros: "Otros",
};

export default function Cuentas() {
  const { hasPermission } = useAuth();
  const { clients, trucks } = useTlo();
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
  const [cobranzaIds, setCobranzaIds] = useState<string[]>([]);
  const [cobranzaFecha, setCobranzaFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [cobranzaSaving, setCobranzaSaving] = useState(false);
  const [pagoListaLoading, setPagoListaLoading] = useState(false);
  const [pagoOmitidas, setPagoOmitidas] = useState(0);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkPaySaving, setBulkPaySaving] = useState(false);
  const [bulkPayFecha, setBulkPayFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [bulkPayNota, setBulkPayNota] = useState("");
  const [bulkPayRows, setBulkPayRows] = useState<
    { doc: AccountDocument; checked: boolean; monto: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelPago, setCancelPago] = useState<AccountDocumentPayment | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState("02");
  const [folioSustitucion, setFolioSustitucion] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
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
    categoria: "" as string,
    unidad: "" as string,
  });
  const [createConceptos, setCreateConceptos] = useState<DocumentConcepto[]>([emptyConcepto()]);
  const [editConceptos, setEditConceptos] = useState<DocumentConcepto[]>([emptyConcepto()]);
  const [payForm, setPayForm] = useState({
    monto: "",
    fecha: new Date().toISOString().slice(0, 10),
    nota: "",
  });
  const [pagoSinTimbrar, setPagoSinTimbrar] = useState(false);
  const [cobroOpen, setCobroOpen] = useState(false);
  const [cobroLoading, setCobroLoading] = useState(false);
  const [cobroSaving, setCobroSaving] = useState(false);
  const [cobroFecha, setCobroFecha] = useState(new Date().toISOString().slice(0, 10));
  const [cobroForma, setCobroForma] = useState("03");
  const [cobroTipoCambio, setCobroTipoCambio] = useState("");
  const [cobroRows, setCobroRows] = useState<
    { doc: AccountDocument; checked: boolean; monto: string }[]
  >([]);
  const [cobroCadaFactura, setCobroCadaFactura] = useState(false);
  const [loteTimbrados, setLoteTimbrados] = useState(0);
  const [loteFallos, setLoteFallos] = useState<
    { documentId: string; folio: string; complementoId?: string; error: string; retrying: boolean }[] | null
  >(null);
  const [stampOpen, setStampOpen] = useState(false);
  const [stampSaving, setStampSaving] = useState(false);
  const [stampFecha, setStampFecha] = useState(new Date().toISOString().slice(0, 10));
  const [stampForma, setStampForma] = useState("03");
  const [stampTipoCambio, setStampTipoCambio] = useState("");
  const [stampPayments, setStampPayments] = useState<AccountDocumentPayment[]>([]);
  const [stampIds, setStampIds] = useState<string[]>([]);
  const [numOperacion, setNumOperacion] = useState("");
  const [comentariosPago, setComentariosPago] = useState("");
  const [enviarCorreo, setEnviarCorreo] = useState(false);
  const [correoEmail, setCorreoEmail] = useState("");
  const [correoMensaje, setCorreoMensaje] = useState(MENSAJE_CORREO_DEFAULT);
  const cobroLoadSeq = useRef(0);
  const cobroDesdeLista = useRef(false);

  const resetCorreo = (clientId?: string | null) => {
    setEnviarCorreo(false);
    setCorreoEmail(clients.find((c) => c.id === clientId)?.email ?? "");
    setCorreoMensaje(MENSAJE_CORREO_DEFAULT);
    setNumOperacion("");
    setComentariosPago("");
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

  const closeCancelPago = () => {
    if (cancelling) return;
    setCancelPago(null);
    setMotivoCancelacion("02");
    setFolioSustitucion("");
    setCancelError(null);
  };

  const confirmCancelPago = async () => {
    if (!cancelPago?.cfdi_pago_id || !selected) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelPaymentComplementApi(
        cancelPago.cfdi_pago_id,
        cancelComplementBody(motivoCancelacion, folioSustitucion),
      );
      const full = await fetchAccountDocument(selected.id);
      setSelected(full);
      toast.success("Complemento cancelado");
      setCancelling(false);
      closeCancelPago();
    } catch (e) {
      setCancelError(e instanceof Error && e.message.trim() ? e.message : "No se pudo cancelar el complemento");
      setCancelling(false);
    }
  };

  const openDetail = (d: AccountDocument) => {
    setPagoSinTimbrar(false);
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

  useEffect(() => {
    setCobranzaIds([]);
  }, [tipo]);

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
    setPagoSinTimbrar(false);
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
      categoria: "",
      unidad: "",
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
        categoria: form.categoria || null,
        unidad: form.unidad.trim() || null,
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
        sin_timbrar: pagoSinTimbrar || undefined,
      });
      toast.success(pagoSinTimbrar ? "Pago aplicado sin timbrar" : "Abono registrado");
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
      const desdeLista = cobroDesdeLista.current;
      cobroDesdeLista.current = false;
      if (desdeLista) setCobranzaIds([]);
      if (detailOpen && selected) {
        void refreshAfterComplement(selected.id);
      } else if (!desdeLista) {
        setDetailOpen(true);
        void refreshAfterComplement(documentId);
      } else {
        void load();
      }
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
    cobroDesdeLista.current = false;
    setPagoOmitidas(0);
    const clientId = selected.client_id;
    const currentId = selected.id;
    setCobroFecha(new Date().toISOString().slice(0, 10));
    setCobroForma("03");
    setCobroTipoCambio("");
    setCobroRows([]);
    setCobroCadaFactura(false);
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

  const openPagoDesdeLista = async () => {
    if (!cobranzaIds.length) return;
    setPagoListaLoading(true);
    cobroLoadSeq.current += 1;
    try {
      const loaded = await Promise.all(cobranzaIds.map((id) => fetchAccountDocument(id).catch(() => null)));
      const cargadas = loaded.filter((doc): doc is AccountDocument => doc != null);
      if (!cargadas.length) {
        toast.error("No se pudieron cargar las facturas seleccionadas");
        return;
      }
      const plan = planPagoLista(cargadas);
      if (plan.kind === "vacio" || plan.kind === "error") {
        toast.error(plan.message);
        return;
      }
      const hoy = new Date().toISOString().slice(0, 10);
      setPagoOmitidas(plan.omitidas + cobranzaIds.length - cargadas.length);
      if (plan.kind === "complemento") {
        cobroDesdeLista.current = true;
        setCobroFecha(hoy);
        setCobroForma("03");
        setCobroTipoCambio("");
        setCobroCadaFactura(false);
        setCobroRows(
          plan.docs.map((doc) => ({
            doc,
            checked: true,
            monto: String(montoCobroDefault(doc.saldo_pendiente, doc.saldo_sat ?? doc.saldo_pendiente)),
          })),
        );
        resetCorreo(plan.clientId);
        setCobroLoading(false);
        setCobroOpen(true);
        return;
      }
      cobroDesdeLista.current = false;
      setBulkPayFecha(hoy);
      setBulkPayNota("");
      setBulkPayRows(
        plan.docs.map((doc) => ({
          doc,
          checked: true,
          monto: String(doc.saldo_pendiente),
        })),
      );
      setBulkPayOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo preparar el pago");
    } finally {
      setPagoListaLoading(false);
    }
  };

  const saveCobro = async () => {
    const base = cobroRows.find((row) => row.checked)?.doc;
    if (!base?.client_id) {
      toast.error("La factura no tiene cliente");
      return;
    }
    const moneda = base.moneda || "MXN";
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
    const extra = complementoExtraBody(numOperacion, comentariosPago);
    const marcadas = cobroRows.filter((row) => row.checked);
    const documentos = marcadas.map((row) => ({ document_id: row.doc.id, monto: Number(row.monto) }));
    if (!documentos.length || documentos.some((doc) => !(doc.monto > 0))) {
      toast.error("Selecciona facturas con monto mayor a 0");
      return;
    }
    const cadaUna = cobroCadaFactura && documentos.length > 1;
    setCobroSaving(true);
    try {
      if (cadaUna) {
        const lote = await createPaymentComplementsEachApi({
          client_id: base.client_id,
          fecha_pago: cobroFecha,
          forma_pago_p: cobroForma,
          moneda_p: moneda,
          tipo_cambio_p: tipoCambio,
          documentos,
          ...extra,
          ...correo.fields,
        });
        const folioDe = new Map(marcadas.map((row) => [row.doc.id, row.doc.folio]));
        const desdeLista = cobroDesdeLista.current;
        cobroDesdeLista.current = false;
        setCobroOpen(false);
        if (desdeLista) setCobranzaIds([]);
        await load();
        if (!lote.fallidos.length) {
          toast.success(
            lote.timbrados.length === 1
              ? "Complemento timbrado"
              : `Se timbraron ${lote.timbrados.length} complementos`,
          );
          return;
        }
        setLoteTimbrados(lote.timbrados.length);
        setLoteFallos(
          lote.fallidos.map((fallo) => ({
            documentId: fallo.document_id,
            folio: folioDe.get(fallo.document_id) || fallo.document_id,
            complementoId: fallo.complemento_id,
            error: fallo.error,
            retrying: false,
          })),
        );
        return;
      }
      const result = await createPaymentComplementApi({
        client_id: base.client_id,
        fecha_pago: cobroFecha,
        forma_pago_p: cobroForma,
        moneda_p: moneda,
        tipo_cambio_p: tipoCambio,
        documentos,
        ...extra,
        ...correo.fields,
      });
      showComplementToast(base.id, result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo registrar el cobro";
      const pendingId = pendingComplementIdFromError(message);
      if (pendingId) {
        showComplementToast(base.id, {
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

  const quitarFallo = (documentId: string) => {
    setLoteFallos((prev) => {
      const next = (prev ?? []).filter((fallo) => fallo.documentId !== documentId);
      return next.length ? next : null;
    });
  };

  const retryFallo = async (documentId: string) => {
    const fallo = (loteFallos ?? []).find((row) => row.documentId === documentId);
    if (!fallo?.complementoId || fallo.retrying) return;
    setLoteFallos((prev) =>
      (prev ?? []).map((row) => (row.documentId === documentId ? { ...row, retrying: true } : row)),
    );
    try {
      const again = await retryPaymentComplementApi(fallo.complementoId);
      if (again.status === 201) {
        quitarFallo(documentId);
        setLoteTimbrados((count) => count + 1);
        toast.success(again.dto.uuid ? `Complemento timbrado ${again.dto.uuid}` : "Complemento timbrado");
        await load();
        return;
      }
      setLoteFallos((prev) =>
        (prev ?? []).map((row) =>
          row.documentId === documentId
            ? { ...row, retrying: false, error: again.dto.error_mensaje || row.error }
            : row,
        ),
      );
    } catch (e) {
      setLoteFallos((prev) =>
        (prev ?? []).map((row) => (row.documentId === documentId ? { ...row, retrying: false } : row)),
      );
      toast.error(e instanceof Error ? e.message : "No se pudo reintentar");
    }
  };

  const discardFallo = async (documentId: string) => {
    const fallo = (loteFallos ?? []).find((row) => row.documentId === documentId);
    if (!fallo?.complementoId || fallo.retrying) return;
    setLoteFallos((prev) =>
      (prev ?? []).map((row) => (row.documentId === documentId ? { ...row, retrying: true } : row)),
    );
    try {
      await discardPaymentComplementApi(fallo.complementoId);
      quitarFallo(documentId);
      toast.success("Complemento descartado");
    } catch (e) {
      setLoteFallos((prev) =>
        (prev ?? []).map((row) => (row.documentId === documentId ? { ...row, retrying: false } : row)),
      );
      toast.error(e instanceof Error ? e.message : "No se pudo descartar");
    }
  };

  const saveBulkPay = async () => {
    const lineas = bulkPayRows
      .filter((row) => row.checked)
      .map((row) => ({ id: row.doc.id, monto: Number(row.monto) }));
    if (!lineas.length || lineas.some((linea) => !(linea.monto > 0))) {
      toast.error("Selecciona facturas con monto mayor a 0");
      return;
    }
    setBulkPaySaving(true);
    let aplicadas = 0;
    try {
      for (const linea of lineas) {
        await addAccountPaymentApi(linea.id, {
          monto: linea.monto,
          fecha: bulkPayFecha,
          nota: bulkPayNota.trim() || undefined,
        });
        aplicadas += 1;
      }
      toast.success(lineas.length === 1 ? "Pago aplicado" : `Pago aplicado a ${lineas.length} cuentas`);
      setBulkPayOpen(false);
      setCobranzaIds([]);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo aplicar el pago";
      if (aplicadas > 0) {
        const hechas = new Set(lineas.slice(0, aplicadas).map((linea) => linea.id));
        setBulkPayRows((prev) => prev.filter((row) => !hechas.has(row.doc.id)));
        setCobranzaIds((prev) => prev.filter((id) => !hechas.has(id)));
        toast.error(`${message} ${aplicadas} ya quedaron aplicadas.`);
      } else {
        toast.error(message);
      }
      await load();
    } finally {
      setBulkPaySaving(false);
    }
  };

  const openStampDialog = () => {
    if (!selected) return;
    const pending = (selected.payments ?? []).filter(
      (payment) => !payment.cfdi_pago_id && !payment.pago_externo,
    );
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
        ...complementoExtraBody(numOperacion, comentariosPago),
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
  const monedaCobroDialog = cobroRows[0]?.doc.moneda || cobroMoneda;
  const cobroDialogEsMxn = monedaCobroDialog.toUpperCase() === "MXN";
  const abonosSinComplemento = (selected?.payments ?? []).filter(
    (payment) => !payment.cfdi_pago_id && !payment.pago_externo,
  );
  const puedeTimbrarAbonos =
    Boolean(selected?.complemento_disponible) && abonosSinComplemento.length > 0;
  const saldoSatReferencia = selected?.saldo_sat ?? selected?.saldo_pendiente ?? 0;
  const marcadasCobro = cobroRows.filter((row) => row.checked).length;
  const timbraCadaUna = cobroCadaFactura && marcadasCobro > 1;

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

          <div className="space-y-4">
          {tipo === "cxc" && canManage && (
            <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-3 border-y bg-background px-4 py-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-end md:-mx-6 md:px-6">
              <p className="text-sm sm:mr-auto sm:mb-2">
                {cobranzaIds.length
                  ? `${cobranzaIds.length} seleccionadas. Aplica el pago o la misma fecha de ingreso a cobranza.`
                  : "Selecciona facturas para aplicar un pago o asignarles la fecha de ingreso a cobranza."}
              </p>
              <Button
                type="button"
                size="sm"
                className="h-9"
                disabled={!cobranzaIds.length || pagoListaLoading || cobranzaSaving}
                onClick={() => void openPagoDesdeLista()}
              >
                {pagoListaLoading ? "Cargando…" : "Aplicar pago"}
              </Button>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fecha de ingreso a cobranza</Label>
                <Input
                  type="date"
                  value={cobranzaFecha}
                  onChange={(e) => setCobranzaFecha(e.target.value)}
                  className="w-full sm:w-[180px] bg-background"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9"
                disabled={!cobranzaIds.length || !cobranzaFecha || cobranzaSaving || pagoListaLoading}
                onClick={async () => {
                  setCobranzaSaving(true);
                  try {
                    const result = await assignFechaCobranzaApi({
                      ids: cobranzaIds,
                      fecha_ingreso_cobranza: cobranzaFecha,
                    });
                    toast.success(
                      `Fecha aplicada a ${result.updated} cuentas. Se recalculó el vencimiento de cada una.`,
                    );
                    setCobranzaIds([]);
                    await load();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "No se pudo asignar la fecha");
                  } finally {
                    setCobranzaSaving(false);
                  }
                }}
              >
                {cobranzaSaving ? "Aplicando…" : "Aplicar y recalcular"}
              </Button>
            </div>
          )}

          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {tipo === "cxc" && canManage && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          pageData.slice.some((d) => d.estatus !== "cancelada") &&
                          pageData.slice
                            .filter((d) => d.estatus !== "cancelada")
                            .every((d) => cobranzaIds.includes(d.id))
                        }
                        onCheckedChange={(checked) => {
                          const ids = pageData.slice
                            .filter((d) => d.estatus !== "cancelada")
                            .map((d) => d.id);
                          setCobranzaIds((prev) => {
                            if (checked === true) return [...new Set([...prev, ...ids])];
                            const drop = new Set(ids);
                            return prev.filter((id) => !drop.has(id));
                          });
                        }}
                        aria-label="Seleccionar facturas de esta página"
                      />
                    </TableHead>
                  )}
                  <TableHead>Entidad</TableHead>
                  <TableHead>Folio</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Unidad</TableHead>
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
                    {tipo === "cxc" && canManage && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={cobranzaIds.includes(d.id)}
                          disabled={d.estatus === "cancelada"}
                          onCheckedChange={(checked) => {
                            setCobranzaIds((prev) =>
                              checked === true ? [...prev, d.id] : prev.filter((id) => id !== d.id),
                            );
                          }}
                          aria-label={`Seleccionar ${d.folio}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{d.entidad_nombre}</TableCell>
                    <TableCell>{d.folio}</TableCell>
                    <TableCell>
                      {d.tipo === "cxc" ? tipoDoctoSaldos(d.modalidad_cobro) : ORIGEN_LABELS[d.origen] ?? d.origen}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{d.concepto}</TableCell>
                    <TableCell>{d.categoria ? CATEGORIA_LABEL[d.categoria] ?? d.categoria : "—"}</TableCell>
                    <TableCell>{d.unidad || "—"}</TableCell>
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
                    <TableCell colSpan={tipo === "cxc" && canManage ? 16 : 15} className="text-center text-muted-foreground py-8">
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
          </div>
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
              <div>
                <Label>Categoría</Label>
                <Select
                  value={form.categoria || "__none__"}
                  onValueChange={(v) =>
                    setForm({ ...form, categoria: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {Object.entries(CATEGORIA_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unidad</Label>
                <Select
                  value={form.unidad || "__none__"}
                  onValueChange={(v) =>
                    setForm({ ...form, unidad: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {[...trucks]
                      .map((t) => t.numero_economico?.trim())
                      .filter((n): n is string => Boolean(n))
                      .sort((a, b) => a.localeCompare(b, "es"))
                      .map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
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
                  {selected.tipo === "cxc" ? `Tipo: ${tipoDoctoSaldos(selected.modalidad_cobro)}. ` : ""}
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
                    <p className="text-muted-foreground">Categoría</p>
                    <p>{selected.categoria ? CATEGORIA_LABEL[selected.categoria] ?? selected.categoria : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Unidad</p>
                    <p>{selected.unidad || "—"}</p>
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
                          {p.pago_externo ? (
                            <span>Pagado en Sicofi</span>
                          ) : p.cfdi_pago_id ? (
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
                              {canManage && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setCancelError(null);
                                    setMotivoCancelacion("02");
                                    setFolioSustitucion("");
                                    setCancelPago(p);
                                  }}
                                >
                                  Cancelar
                                </Button>
                              )}
                            </>
                          ) : (
                            <span>Sin timbrar</span>
                          )}
                          <span>{fmtMXNDecimal(p.monto)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {!!selected.complementos_cancelados?.length && (
                    <div>
                      <p className="font-medium mb-1">Complementos cancelados</p>
                      <ul className="space-y-2">
                        {selected.complementos_cancelados.map((pago) => (
                          <li key={pago.id} className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm">
                              {pago.serie}-{pago.folio}
                              {pago.uuid ? ` · ${pago.uuid}` : ""}
                            </span>
                            <span className="flex flex-wrap items-center gap-2">
                              <span>Cancelado</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  void downloadPaymentComplementFile(pago.id, "xml").catch((e) =>
                                    toast.error(e instanceof Error ? e.message : "No se pudo descargar el XML"),
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
                                  void downloadPaymentComplementFile(pago.id, "pdf").catch((e) =>
                                    toast.error(e instanceof Error ? e.message : "No se pudo descargar el PDF"),
                                  );
                                }}
                              >
                                PDF
                              </Button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canManage &&
                selected?.tipo === "cxc" &&
                selected.complemento_disponible &&
                selected.estatus === "abierta" &&
                selected.saldo_pendiente > 0 && (
                  <label
                    className="flex items-center gap-2 text-sm"
                    title="Provisional. Aplica el pago en la cuenta sin timbrar el complemento. Úsalo cuando el pago ya está en Sicofi."
                  >
                    <Checkbox
                      checked={pagoSinTimbrar}
                      onCheckedChange={(v) => setPagoSinTimbrar(v === true)}
                    />
                    Aplicar sin timbrar
                  </label>
                )}
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
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!pagoSinTimbrar) {
                        openCobroDialog();
                        return;
                      }
                      setPayForm({
                        monto: String(selected.saldo_pendiente),
                        fecha: new Date().toISOString().slice(0, 10),
                        nota: "",
                      });
                      setPaymentOpen(true);
                    }}
                  >
                    {pagoSinTimbrar ? "Aplicar pago" : "Registrar cobro"}
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

      <Dialog
        open={Boolean(cancelPago)}
        onOpenChange={(open) => {
          if (!open) closeCancelPago();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar complemento de pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {cancelPago?.uuid && (
              <p className="text-sm text-muted-foreground break-all">
                UUID: <span className="font-mono text-foreground">{cancelPago.uuid}</span>
              </p>
            )}
            <div className="space-y-2">
              <Label>Motivo de cancelación</Label>
              <Select
                value={motivoCancelacion}
                onValueChange={(value) => {
                  setMotivoCancelacion(value);
                  setCancelError(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un motivo" />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS_CANCELACION_COMPLEMENTO.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Folio de sustitución (opcional)</Label>
              <Input
                value={folioSustitucion}
                onChange={(e) => {
                  setFolioSustitucion(e.target.value);
                  setCancelError(null);
                }}
                placeholder="UUID del CFDI que sustituye"
              />
            </div>
            {cancelError && (
              <div
                role="alert"
                className="max-h-32 overflow-y-auto break-all rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {cancelError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={cancelling} onClick={closeCancelPago}>
              Cerrar
            </Button>
            <Button
              variant="destructive"
              disabled={cancelling || !motivoCancelacion}
              onClick={() => void confirmCancelPago()}
            >
              {cancelling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cancelando…
                </>
              ) : (
                "Confirmar cancelación"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pagoSinTimbrar ? "Aplicar pago sin timbrar" : "Registrar abono"}</DialogTitle>
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
            <Button onClick={() => void savePayment()}>
              {pagoSinTimbrar ? "Aplicar pago" : "Guardar abono"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cobroOpen} onOpenChange={setCobroOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{cobroDesdeLista.current ? "Aplicar pago" : "Registrar cobro"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {pagoOmitidas > 0 && (
              <p className="text-sm text-muted-foreground">
                {pagoOmitidas === 1
                  ? "1 factura sin saldo no entra a este cobro."
                  : `${pagoOmitidas} facturas sin saldo no entran a este cobro.`}
              </p>
            )}
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={cobroFecha} onChange={(e) => setCobroFecha(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">La hora se registra al timbrar.</p>
            </div>
            <div>
              <Label>Forma de pago</Label>
              <FormaPagoSelect value={cobroForma} onChange={setCobroForma} />
            </div>
            <div>
              <Label>Moneda</Label>
              <Input value={monedaCobroDialog} disabled />
            </div>
            {!cobroDialogEsMxn && (
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
            {cobroRows.length > 1 && (
              <div className="space-y-2">
                <Label>Cómo timbrar</Label>
                <RadioGroup
                  value={cobroCadaFactura ? "cada" : "junto"}
                  onValueChange={(value) => setCobroCadaFactura(value === "cada")}
                  className="gap-2"
                >
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="junto" id="cobro-junto" className="mt-1" />
                    <Label htmlFor="cobro-junto" className="font-normal leading-snug">
                      Un complemento para todas
                      <span className="block text-xs text-muted-foreground">
                        Un solo CFDI con las facturas marcadas.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="cada" id="cobro-cada" className="mt-1" />
                    <Label htmlFor="cobro-cada" className="font-normal leading-snug">
                      Un complemento por factura
                      <span className="block text-xs text-muted-foreground">
                        Un CFDI por cada factura. Si una falla, las demás se timbran y esa se reintenta al final.
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}
            <ComplementoPagoCampos
              numOperacion={numOperacion}
              onNumOperacionChange={setNumOperacion}
              comentarios={comentariosPago}
              onComentariosChange={setComentariosPago}
            />
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
              {cobroSaving
                ? timbraCadaUna
                  ? `Timbrando ${marcadasCobro} complementos…`
                  : "Timbrando…"
                : timbraCadaUna
                  ? `Timbrar ${marcadasCobro} complementos`
                  : "Timbrar cobro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={loteFallos != null} onOpenChange={(open) => { if (!open) setLoteFallos(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reintentar facturas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {loteTimbrados === 0
                ? "Ningún complemento se timbró."
                : loteTimbrados === 1
                  ? "Se timbró 1 complemento."
                  : `Se timbraron ${loteTimbrados} complementos.`}{" "}
              Estas facturas no se timbraron. Reinténtalas ahora.
            </p>
            <div className="space-y-3">
              {(loteFallos ?? []).map((fallo) => (
                <div key={fallo.documentId} className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">{fallo.folio}</p>
                  <p className="text-sm text-muted-foreground">{fallo.error}</p>
                  {fallo.complementoId ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={fallo.retrying}
                        onClick={() => void discardFallo(fallo.documentId)}
                      >
                        Descartar
                      </Button>
                      <Button
                        size="sm"
                        disabled={fallo.retrying}
                        onClick={() => void retryFallo(fallo.documentId)}
                      >
                        {fallo.retrying ? "Reintentando…" : "Reintentar"}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No quedó un complemento para reintentar. Vuelve a timbrar esta factura desde Aplicar pago.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoteFallos(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkPayOpen} onOpenChange={setBulkPayOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aplicar pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {pagoOmitidas > 0 && (
              <p className="text-sm text-muted-foreground">
                {pagoOmitidas === 1
                  ? "1 factura sin saldo no entra a este pago."
                  : `${pagoOmitidas} facturas sin saldo no entran a este pago.`}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Cada factura conserva su propia cuenta. El monto se abona al saldo de esa factura.
            </p>
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={bulkPayFecha} onChange={(e) => setBulkPayFecha(e.target.value)} />
            </div>
            <div>
              <Label>Nota</Label>
              <Input value={bulkPayNota} onChange={(e) => setBulkPayNota(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Facturas</Label>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                {bulkPayRows.map((row) => (
                  <label key={row.doc.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={row.checked}
                      onCheckedChange={(v) =>
                        setBulkPayRows((prev) =>
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
                        setBulkPayRows((prev) =>
                          prev.map((item) =>
                            item.doc.id === row.doc.id ? { ...item, monto: e.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPayOpen(false)} disabled={bulkPaySaving}>
              Cancelar
            </Button>
            <Button disabled={bulkPaySaving} onClick={() => void saveBulkPay()}>
              {bulkPaySaving ? "Aplicando…" : "Aplicar pago"}
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
              <p className="mt-1 text-xs text-muted-foreground">La hora se registra al timbrar.</p>
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
            <ComplementoPagoCampos
              numOperacion={numOperacion}
              onNumOperacionChange={setNumOperacion}
              comentarios={comentariosPago}
              onComentariosChange={setComentariosPago}
            />
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
