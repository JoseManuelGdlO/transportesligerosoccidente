import { computeTrip } from "@/lib/calc";
import { fmtDate, fmtMXN } from "@/lib/format";
import type { Driver, DriverAdvance, DriverDiscount, DiscountType, SettlementSummaryApi } from "@/types/tlo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/tlo/KpiCard";
import { Wallet, Receipt, TrendingUp, Truck as TruckIcon, Plus, Trash2, Pencil } from "lucide-react";

export interface AdvanceFormState {
  monto: number;
  fecha: string;
  descripcion: string;
}

export interface DiscountFormState {
  tipo: DiscountType;
  monto: number;
  fecha: string;
  descripcion: string;
}

interface SettlementSummaryPanelProps {
  summary: SettlementSummaryApi;
  driver: Driver;
  readOnly?: boolean;
  canEditFinance?: boolean;
  advForm?: AdvanceFormState;
  discForm?: DiscountFormState;
  onAdvFormChange?: (form: AdvanceFormState) => void;
  onDiscFormChange?: (form: DiscountFormState) => void;
  onAddAdvance?: () => void;
  onAddDiscount?: () => void;
  onRemoveAdvance?: (id: string) => void;
  onRemoveDiscount?: (id: string) => void;
  onEditTrip?: (tripId: string) => void;
}

export function SettlementSummaryPanel({
  summary,
  driver,
  readOnly = false,
  canEditFinance = false,
  advForm,
  discForm,
  onAdvFormChange,
  onDiscFormChange,
  onAddAdvance,
  onAddDiscount,
  onRemoveAdvance,
  onRemoveDiscount,
  onEditTrip,
}: SettlementSummaryPanelProps) {
  const showFinanceForms = !readOnly && canEditFinance;
  const sortedTrips = [...summary.trips].sort((a, b) =>
    a.folio.localeCompare(b.folio, undefined, { numeric: true, sensitivity: "base" }),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Viajes" value={String(summary.trips.length)} icon={TruckIcon} tone="default" />
        <KpiCard label="Comisiones" value={fmtMXN(summary.total_comisiones)} icon={Wallet} tone="accent" />
        <KpiCard
          label="Descuentos + anticipos"
          value={fmtMXN(summary.total_descuentos + summary.total_anticipos)}
          icon={Receipt}
          tone="default"
        />
        <KpiCard
          label="Neto a pagar"
          value={fmtMXN(summary.neto_pagar)}
          icon={TrendingUp}
          tone={summary.neto_pagar >= 0 ? "success" : "destructive"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="tlo-shadow-md">
          <CardHeader><CardTitle className="text-base">Anticipos del periodo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {showFinanceForms && advForm && onAdvFormChange && onAddAdvance && (
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  placeholder="Monto"
                  value={advForm.monto || ""}
                  onChange={(e) => onAdvFormChange({ ...advForm, monto: +e.target.value })}
                />
                <Input
                  type="date"
                  value={advForm.fecha}
                  onChange={(e) => onAdvFormChange({ ...advForm, fecha: e.target.value })}
                />
                <Button size="sm" onClick={onAddAdvance}><Plus className="h-4 w-4" /></Button>
                <Input
                  className="col-span-3"
                  placeholder="Descripción"
                  value={advForm.descripcion}
                  onChange={(e) => onAdvFormChange({ ...advForm, descripcion: e.target.value })}
                />
              </div>
            )}
            <Table>
              <TableBody>
                {(summary.advances ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-4 text-sm">
                      Sin anticipos pendientes de liquidar
                    </TableCell>
                  </TableRow>
                )}
                {(summary.advances ?? []).map((a: DriverAdvance) => (
                  <TableRow key={a.id}>
                    <TableCell>{fmtDate(a.fecha)}</TableCell>
                    <TableCell className="text-sm">
                      {a.descripcion}
                      {a.en_periodo === false && (
                        <Badge variant="outline" className="ml-2 text-xs">Fuera del periodo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{fmtMXN(a.monto)}</TableCell>
                    {showFinanceForms && !a.settlement_id && onRemoveAdvance && (
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => onRemoveAdvance(a.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="tlo-shadow-md">
          <CardHeader><CardTitle className="text-base">Descuentos del periodo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {showFinanceForms && discForm && onDiscFormChange && onAddDiscount && (
              <div className="grid grid-cols-3 gap-2">
                <Select
                  value={discForm.tipo}
                  onValueChange={(v) => onDiscFormChange({ ...discForm, tipo: v as DiscountType })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prestamo">Préstamo</SelectItem>
                    <SelectItem value="dano">Daño</SelectItem>
                    <SelectItem value="multa">Multa</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={discForm.monto || ""}
                  onChange={(e) => onDiscFormChange({ ...discForm, monto: +e.target.value })}
                />
                <Button size="sm" onClick={onAddDiscount}><Plus className="h-4 w-4" /></Button>
                <Input
                  className="col-span-3"
                  placeholder="Descripción"
                  value={discForm.descripcion}
                  onChange={(e) => onDiscFormChange({ ...discForm, descripcion: e.target.value })}
                />
              </div>
            )}
            <Table>
              <TableBody>
                {(summary.discounts ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-4 text-sm">
                      Sin descuentos pendientes de liquidar
                    </TableCell>
                  </TableRow>
                )}
                {(summary.discounts ?? []).map((d: DriverDiscount) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.tipo}</TableCell>
                    <TableCell className="text-sm">
                      {d.descripcion}
                      {d.en_periodo === false && (
                        <Badge variant="outline" className="ml-2 text-xs">Fuera del periodo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{fmtMXN(d.monto)}</TableCell>
                    {showFinanceForms && !d.settlement_id && onRemoveDiscount && (
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => onRemoveDiscount(d.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="tlo-shadow-md">
        <CardHeader><CardTitle className="text-base">Viajes del periodo</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead>Folio</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Comisión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTrips.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-4 text-sm">
                    Sin viajes en el periodo
                  </TableCell>
                </TableRow>
              )}
              {sortedTrips.map((t) => {
                const f = computeTrip(t, driver);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-sm">{t.folio}</TableCell>
                    <TableCell>{t.tipo_viaje === "foraneo" ? "Foráneo" : "Local"}</TableCell>
                    <TableCell>{fmtDate(t.fecha_salida)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="font-semibold text-accent">{fmtMXN(f.comision)}</span>
                        {onEditTrip && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            aria-label={`Editar viaje ${t.folio}`}
                            onClick={() => onEditTrip(t.id)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
