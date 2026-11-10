import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { FileUp, Pencil, Trash2, ExternalLink, Loader2, Download } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { downloadDocumentBundle, type BundleMode } from "@/lib/documentBundleDownload";
import type { CatalogDocument, DocumentCatalogItem, DocumentCatalogStatus } from "@/types/tlo";
import {
  fetchDriverDocumentsCatalog,
  fetchTruckDocumentsCatalog,
  postDriverDocument,
  postTruckDocument,
  patchDocument,
  deleteDocument,
  openAuthenticatedFile,
} from "@/lib/tloApi";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

function statusBadge(status: DocumentCatalogStatus) {
  const map: Record<DocumentCatalogStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pendiente: { label: "Pendiente", variant: "secondary" },
    vigente: { label: "Vigente", variant: "default" },
    por_vencer: { label: "Por vencer", variant: "outline" },
    vencido: { label: "Vencido", variant: "destructive" },
    sin_vigencia: { label: "Archivo", variant: "secondary" },
  };
  const x = map[status];
  return <Badge variant={x.variant}>{x.label}</Badge>;
}

type Props = {
  kind: "driver" | "truck";
  entityId: string | null;
  /** Nombre o número económico, para el archivo descargado. */
  entityLabel?: string;
};

function documentDetail(doc: CatalogDocument): string {
  const parts: string[] = [];
  if (doc.numero?.trim()) parts.push(`No. ${doc.numero.trim()}`);
  if (doc.vigencia_inicio || doc.vigencia_fin) {
    const inicio = doc.vigencia_inicio ? fmtDate(doc.vigencia_inicio) : "-";
    const fin = doc.vigencia_fin ? fmtDate(doc.vigencia_fin) : "-";
    parts.push(`Vigencia ${inicio} - ${fin}`);
  }
  return parts.join(" · ");
}

export function DocumentManager({ kind, entityId, entityLabel }: Props) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("documentos.editar");
  const [items, setItems] = useState<DocumentCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentCatalogItem | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [numero, setNumero] = useState("");
  const [vigenciaInicio, setVigenciaInicio] = useState("");
  const [vigenciaFin, setVigenciaFin] = useState("");
  const [notas, setNotas] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadMode, setDownloadMode] = useState<BundleMode>("separate");
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const rows =
        kind === "driver"
          ? await fetchDriverDocumentsCatalog(entityId)
          : await fetchTruckDocumentsCatalog(entityId);
      setItems(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar documentación");
    } finally {
      setLoading(false);
    }
  }, [entityId, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = (row: DocumentCatalogItem) => {
    setEditing(row);
    setNumero("");
    setVigenciaInicio("");
    setVigenciaFin("");
    setNotas("");
    setFile(null);
    setDialogOpen(true);
  };

  const openEdit = (row: DocumentCatalogItem) => {
    if (!row.document) return;
    setEditing(row);
    const d = row.document;
    setNumero(d.numero ?? "");
    setVigenciaInicio(d.vigencia_inicio?.slice(0, 10) ?? "");
    setVigenciaFin(d.vigencia_fin?.slice(0, 10) ?? "");
    setNotas(d.notas ?? "");
    setFile(null);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!entityId || !editing) return;
    const dt = editing.document_type;
    if (dt.requiere_vigencia && !vigenciaFin.trim()) {
      toast.error("Indica la fecha de vigencia final");
      return;
    }
    if (!editing.document && !file) {
      toast.error("Selecciona un archivo");
      return;
    }
    try {
      if (editing.document) {
        const fd = new FormData();
        fd.append("numero", numero);
        if (dt.requiere_vigencia) {
          fd.append("vigencia_inicio", vigenciaInicio || "");
          fd.append("vigencia_fin", vigenciaFin || "");
        }
        fd.append("notas", notas);
        if (file) fd.append("file", file);
        await patchDocument(editing.document.id, fd);
        toast.success("Documento actualizado");
      } else {
        const fd = new FormData();
        fd.append("document_type_id", dt.id);
        fd.append("numero", numero);
        if (dt.requiere_vigencia) {
          fd.append("vigencia_inicio", vigenciaInicio || "");
          fd.append("vigencia_fin", vigenciaFin || "");
        }
        fd.append("notas", notas);
        fd.append("file", file!);
        if (kind === "driver") await postDriverDocument(entityId, fd);
        else await postTruckDocument(entityId, fd);
        toast.success("Documento guardado");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    }
  };

  const remove = async (doc: CatalogDocument) => {
    if (!canEdit) return;
    if (!window.confirm("¿Eliminar este documento y su archivo?")) return;
    try {
      await deleteDocument(doc.id);
      toast.success("Eliminado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  const view = async (doc: CatalogDocument) => {
    try {
      await openAuthenticatedFile(doc.file_url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir el archivo");
    }
  };

  const uploaded = items.filter((row) => row.document?.file_url);
  const subject = kind === "truck" ? "esta unidad" : "este operador";

  const download = async () => {
    setDownloading(true);
    try {
      const result = await downloadDocumentBundle({
        mode: downloadMode,
        kind,
        entityLabel: entityLabel ?? "",
        files: uploaded.map((row) => ({
          title: row.document_type.nombre,
          detail: documentDetail(row.document!),
          fileUrl: row.document!.file_url,
          fileName: row.document!.file_name,
          mime: row.document!.mime,
        })),
      });
      if (result.downloaded === 0) {
        toast.error(
          result.missing.length === 1
            ? `No se encontró "${result.missing[0]}"`
            : `No se encontraron los documentos: ${result.missing.join(", ")}`,
        );
        return;
      }
      if (result.missing.length > 0) {
        toast.warning(
          result.missing.length === 1
            ? `No se encontró "${result.missing[0]}". Se descargó el resto.`
            : `No se encontraron: ${result.missing.join(", ")}. Se descargó el resto.`,
        );
      }
      toast.success(
        downloadMode === "merged"
          ? "Se descargó el PDF"
          : `Se descargaron ${result.downloaded} archivo${result.downloaded === 1 ? "" : "s"}`,
      );
      setDownloadOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo descargar");
    } finally {
      setDownloading(false);
    }
  };

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        {kind === "truck" ? "Sin unidad seleccionada." : "Sin operador seleccionado."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {uploaded.length > 0 ? (
        <Button type="button" variant="outline" className="w-full" onClick={() => setDownloadOpen(true)}>
          <Download className="h-4 w-4 mr-2" />
          Descargar resumen documentos
        </Button>
      ) : null}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando documentación…
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/50">
            <TableHead>Documento</TableHead>
            <TableHead>Estatus</TableHead>
            <TableHead>Vigencia</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow key={row.document_type.id}>
              <TableCell className="font-medium">{row.document_type.nombre}</TableCell>
              <TableCell>{statusBadge(row.status)}</TableCell>
              <TableCell className="text-sm">
                {row.document?.vigencia_fin
                  ? fmtDate(row.document.vigencia_fin)
                  : row.document_type.requiere_vigencia
                    ? "—"
                    : "N/A"}
              </TableCell>
              <TableCell className="text-right space-x-1">
                {row.document && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => view(row.document!)}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
                {canEdit && !row.document && (
                  <Button type="button" variant="outline" size="sm" onClick={() => openCreate(row)}>
                    <FileUp className="h-4 w-4 mr-1" /> Subir
                  </Button>
                )}
                {canEdit && row.document && (
                  <>
                    <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(row.document!)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.document ? "Editar documento" : "Subir documento"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">{editing.document_type.nombre}</p>
              <div>
                <Label>Número / folio / póliza</Label>
                <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej. 1244000-1" />
              </div>
              {editing.document_type.requiere_vigencia && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Inicio vigencia</Label>
                      <Input type="date" value={vigenciaInicio} onChange={(e) => setVigenciaInicio(e.target.value)} />
                    </div>
                    <div>
                      <Label>Fin vigencia</Label>
                      <Input type="date" value={vigenciaFin} onChange={(e) => setVigenciaFin(e.target.value)} />
                    </div>
                  </div>
                </>
              )}
              <div>
                <Label>Archivo {editing.document ? "(opcional, reemplazar)" : ""}</Label>
                <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} className="bg-primary text-primary-foreground">
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={downloadOpen}
        onOpenChange={(open) => {
          if (downloading) return;
          setDownloadOpen(open);
          if (open) setDownloadMode("separate");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Descargar resumen documentos</DialogTitle>
            <DialogDescription>
              {uploaded.length} archivo{uploaded.length === 1 ? "" : "s"} de {subject}
              {entityLabel?.trim() ? ` (${entityLabel.trim()})` : ""}.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={downloadMode}
            onValueChange={(value) => setDownloadMode(value as BundleMode)}
            className="gap-3"
            disabled={downloading}
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem value="separate" id="docs-separate" className="mt-1" />
              <Label htmlFor="docs-separate" className="font-normal leading-snug">
                Descargar por separado
                <span className="block text-xs text-muted-foreground">
                  Un archivo por documento, en su formato original.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="merged" id="docs-merged" className="mt-1" />
              <Label htmlFor="docs-merged" className="font-normal leading-snug">
                Descargar en un solo documento
                <span className="block text-xs text-muted-foreground">
                  Une los PDF y las imágenes en un único PDF.
                </span>
              </Label>
            </div>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadOpen(false)} disabled={downloading}>
              Cancelar
            </Button>
            <Button onClick={() => void download()} disabled={downloading} className="bg-primary text-primary-foreground">
              {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Descargar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
