import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AutoSupplierReview, Supplier } from "@/types/tlo";
import {
  detachAutoSupplierFuelApi,
  fetchAutoSupplierReview,
  mergeAutoSupplierApi,
} from "@/lib/tloApi";
import { toast } from "sonner";

type Props = {
  catalog: Supplier[];
  onChanged: () => Promise<void>;
};

export function SupplierCleanupPanel({ catalog, onChanged }: Props) {
  const [rows, setRows] = useState<AutoSupplierReview[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await fetchAutoSupplierReview());
  }, []);

  useEffect(() => {
    void load().catch((e) => {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar la limpieza");
    });
  }, [load]);

  const refresh = async () => {
    await onChanged();
    await load();
  };

  const detach = async (row: AutoSupplierReview) => {
    setBusyId(row.id);
    try {
      const result = await detachAutoSupplierFuelApi(row.id);
      toast.success(
        result.inactivated
          ? `${row.razon_social} quedó inactivo. El combustible sigue en Cuentas con el nombre de la estación.`
          : `Se soltó el combustible de ${row.razon_social}. Sigue ligado a otros movimientos.`,
      );
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo soltar el combustible");
    } finally {
      setBusyId(null);
    }
  };

  const merge = async (row: AutoSupplierReview) => {
    const targetId = targets[row.id];
    if (!targetId) {
      toast.error("Elige el proveedor del catálogo al que se van a pasar los movimientos");
      return;
    }
    setBusyId(row.id);
    try {
      const result = await mergeAutoSupplierApi(row.id, targetId);
      toast.success(`${row.razon_social} se fusionó en ${result.razon_social} y quedó inactivo`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo fusionar");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Generados automáticamente</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Filas sin RFC que el sistema creó al registrar combustible. Puedes soltar el combustible
          (la cuenta por pagar conserva el nombre de la estación) o fusionarlas en un proveedor del catálogo.
        </p>
      </div>
      {!rows.length ? (
        <p className="text-sm text-muted-foreground">No hay proveedores automáticos sin RFC.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tickets</TableHead>
                <TableHead>CXP combustible</TableHead>
                <TableHead>Otros</TableHead>
                <TableHead>Fusionar en</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.razon_social}
                    {row.estatus === "inactivo" ? (
                      <span className="ml-2 text-xs text-muted-foreground">inactivo</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.tickets}</TableCell>
                  <TableCell>{row.cxp_combustible}</TableCell>
                  <TableCell>{row.otros}</TableCell>
                  <TableCell className="min-w-[180px]">
                    <Label className="sr-only" htmlFor={`merge-${row.id}`}>
                      Proveedor destino
                    </Label>
                    <Select
                      value={targets[row.id]}
                      onValueChange={(value) => setTargets({ ...targets, [row.id]: value })}
                    >
                      <SelectTrigger id={`merge-${row.id}`}>
                        <SelectValue placeholder="Catálogo…" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalog.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.razon_social}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="space-x-2 whitespace-nowrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === row.id || row.estatus === "inactivo"}
                      onClick={() => void detach(row)}
                    >
                      Soltar combustible
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === row.id || row.estatus === "inactivo" || !catalog.length}
                      onClick={() => void merge(row)}
                    >
                      Fusionar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
