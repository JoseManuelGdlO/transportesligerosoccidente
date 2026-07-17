import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/tlo/KpiCard";
import { fmtDate, fmtMXN } from "@/lib/format";
import {
  cancelDriverAccountItem,
  createDriverAccountItem,
  createDriverAccountPayment,
  fetchDriverAccount,
} from "@/lib/tloApi";
import type { AccountItemType, DriverAccountItem, DriverAccountSummary } from "@/types/tlo";
import { CircleDollarSign, HandCoins, Plus, Wallet } from "lucide-react";

interface DriverAccountPanelProps {
  driverId: string;
  canEdit?: boolean;
}

const emptyItemForm = () => ({
  tipo: "incidencia" as AccountItemType,
  concepto: "",
  monto_original: 0,
  cuota_liquidacion: 0,
  fecha: new Date().toISOString().slice(0, 10),
});

const emptyPayForm = () => ({
  monto: 0,
  fecha: new Date().toISOString().slice(0, 10),
  nota: "",
});

export function DriverAccountPanel({ driverId, canEdit = false }: DriverAccountPanelProps) {
  const [account, setAccount] = useState<DriverAccountSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [payForms, setPayForms] = useState<Record<string, ReturnType<typeof emptyPayForm>>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDriverAccount(driverId);
      setAccount(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar cuenta");
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreateItem = async () => {
    if (!itemForm.concepto.trim() || itemForm.monto_original <= 0 || itemForm.cuota_liquidacion <= 0) {
      toast.error("Completa concepto, importe y cuota");
      return;
    }
    if (itemForm.cuota_liquidacion > itemForm.monto_original) {
      toast.error("La cuota no puede ser mayor al importe");
      return;
    }
    try {
      await createDriverAccountItem(driverId, {
        ...itemForm,
        concepto: itemForm.concepto.trim(),
      });
      setItemForm(emptyItemForm());
      toast.success("Adeudo registrado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar adeudo");
    }
  };

  const onPay = async (item: DriverAccountItem) => {
    const form = payForms[item.id] ?? emptyPayForm();
    if (form.monto <= 0) {
      toast.error("Indica un monto de abono");
      return;
    }
    if (form.monto > item.saldo) {
      toast.error(`El abono no puede exceder el saldo (${fmtMXN(item.saldo)})`);
      return;
    }
    try {
      await createDriverAccountPayment(driverId, item.id, {
        monto: form.monto,
        fecha: form.fecha,
        nota: form.nota.trim() || undefined,
      });
      setPayForms((prev) => ({ ...prev, [item.id]: emptyPayForm() }));
      toast.success("Abono registrado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar abono");
    }
  };

  const onCancel = async (item: DriverAccountItem) => {
    try {
      await cancelDriverAccountItem(driverId, item.id);
      toast.success("Adeudo cancelado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cancelar");
    }
  };

  if (loading && !account) {
    return <p className="text-sm text-muted-foreground pt-4">Cargando cuenta…</p>;
  }

  if (!account) {
    return <p className="text-sm text-muted-foreground pt-4">No se pudo cargar la cuenta.</p>;
  }

  const statusBadge = (estatus: string) => {
    if (estatus === "activo") return <Badge variant="default">Activo</Badge>;
    if (estatus === "liquidado") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Liquidado</Badge>;
    return <Badge variant="secondary">Cancelado</Badge>;
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Saldo pendiente" value={fmtMXN(account.saldo_total)} icon={Wallet} tone="destructive" />
        <KpiCard label="Total abonado" value={fmtMXN(account.total_abonado)} icon={HandCoins} tone="success" />
        <KpiCard
          label="Adeudos activos"
          value={String(account.adeudos_activos)}
          icon={CircleDollarSign}
          tone="accent"
        />
      </div>

      {canEdit ? (
        <Card className="tlo-shadow-md">
          <CardHeader>
            <CardTitle className="text-base">Nuevo adeudo (incidencia / préstamo)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Tipo</Label>
                <Select
                  value={itemForm.tipo}
                  onValueChange={(v: AccountItemType) => setItemForm({ ...itemForm, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incidencia">Incidencia</SelectItem>
                    <SelectItem value="prestamo">Préstamo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={itemForm.fecha}
                  onChange={(e) => setItemForm({ ...itemForm, fecha: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>Concepto</Label>
                <Input
                  placeholder="Ej. Llanta tronada unidad 12"
                  value={itemForm.concepto}
                  onChange={(e) => setItemForm({ ...itemForm, concepto: e.target.value })}
                />
              </div>
              <div>
                <Label>Importe total</Label>
                <Input
                  type="number"
                  value={itemForm.monto_original || ""}
                  onChange={(e) => setItemForm({ ...itemForm, monto_original: +e.target.value })}
                />
              </div>
              <div>
                <Label>Cuota por liquidación</Label>
                <Input
                  type="number"
                  value={itemForm.cuota_liquidacion || ""}
                  onChange={(e) => setItemForm({ ...itemForm, cuota_liquidacion: +e.target.value })}
                />
              </div>
            </div>
            <Button size="sm" onClick={() => void onCreateItem()}>
              <Plus className="h-4 w-4 mr-1" />
              Registrar adeudo
            </Button>
            <p className="text-xs text-muted-foreground">
              En cada liquidación se descontará automáticamente hasta la cuota (o el neto disponible), del adeudo más
              antiguo al más reciente.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        {account.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin adeudos registrados.</p>
        ) : (
          account.items.map((item) => {
            const pay = payForms[item.id] ?? emptyPayForm();
            const open = expandedId === item.id;
            return (
              <Card key={item.id} className="tlo-shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                        <span className="capitalize">{item.tipo}</span>
                        {statusBadge(item.estatus)}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{item.concepto}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmtDate(item.fecha)} · Original {fmtMXN(item.monto_original)} · Cuota{" "}
                        {fmtMXN(item.cuota_liquidacion)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">Saldo</p>
                      <p className="text-lg font-bold">{fmtMXN(item.saldo)}</p>
                      <p className="text-xs text-muted-foreground">Abonado {fmtMXN(item.abonado)}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId(open ? null : item.id)}
                    >
                      {open ? "Ocultar estado de cuenta" : "Ver estado de cuenta"}
                    </Button>
                    {canEdit && item.estatus === "activo" && item.movements.length === 0 ? (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void onCancel(item)}>
                        Cancelar
                      </Button>
                    ) : null}
                  </div>

                  {open ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Abono</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell>{fmtDate(item.fecha)}</TableCell>
                          <TableCell>Cargo inicial</TableCell>
                          <TableCell className="text-right">—</TableCell>
                          <TableCell className="text-right">{fmtMXN(item.monto_original)}</TableCell>
                        </TableRow>
                        {item.movements.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell>{fmtDate(m.fecha)}</TableCell>
                            <TableCell>
                              {m.tipo === "liquidacion" ? "Liquidación" : "Abono directo"}
                              {m.nota ? ` · ${m.nota}` : ""}
                            </TableCell>
                            <TableCell className="text-right text-destructive">-{fmtMXN(m.monto)}</TableCell>
                            <TableCell className="text-right">{fmtMXN(m.saldo_despues)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : null}

                  {canEdit && item.estatus === "activo" && item.saldo > 0 ? (
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t">
                      <Input
                        type="number"
                        placeholder="Abono"
                        value={pay.monto || ""}
                        onChange={(e) =>
                          setPayForms((prev) => ({
                            ...prev,
                            [item.id]: { ...pay, monto: +e.target.value },
                          }))
                        }
                      />
                      <Input
                        type="date"
                        value={pay.fecha}
                        onChange={(e) =>
                          setPayForms((prev) => ({
                            ...prev,
                            [item.id]: { ...pay, fecha: e.target.value },
                          }))
                        }
                      />
                      <Button size="sm" onClick={() => void onPay(item)}>
                        Abonar
                      </Button>
                      <Input
                        className="col-span-3"
                        placeholder="Nota (opcional)"
                        value={pay.nota}
                        onChange={(e) =>
                          setPayForms((prev) => ({
                            ...prev,
                            [item.id]: { ...pay, nota: e.target.value },
                          }))
                        }
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
