import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { hasApiConfigured } from "@/lib/api";
import { FEATURE_CARTA_PORTE } from "@/config/features";
import { setTripStatuses } from "@/lib/tloApi";
import {
  customStatusesFromTrip,
  tripIsLiquidated,
  tripIsProrated,
} from "@/lib/tripStatus";
import type { Trip, TripStatusRef } from "@/types/tlo";
import { toast } from "sonner";

export const TripStatusBadge = ({ status }: { status: "en_curso" | "cerrado" }) => (
  <Badge
    variant="outline"
    className={cn(
      "font-medium",
      status === "en_curso"
        ? "bg-accent/10 text-accent border-accent/30"
        : "bg-success/10 text-success border-success/30"
    )}
  >
    {status === "en_curso" ? "En curso" : "Cerrado"}
  </Badge>
);

export const TripStatusChip = ({ status }: { status: TripStatusRef }) => (
  <Badge
    variant="outline"
    className="font-medium border-transparent"
    style={{
      backgroundColor: `${status.color}20`,
      color: status.color,
      borderColor: `${status.color}50`,
    }}
  >
    {status.nombre}
  </Badge>
);

const TripFinanceBadges = ({ trip }: { trip: Trip }) => {
  const liquidado = tripIsLiquidated(trip);
  const prorrateado = tripIsProrated(trip);
  const cpTimbrada = FEATURE_CARTA_PORTE && trip.carta_porte?.estatus === "timbrada";
  if (!liquidado && !prorrateado && !cpTimbrada) return null;
  return (
    <>
      {liquidado && (
        <Badge
          variant="outline"
          className="font-medium text-[10px] bg-primary/10 text-primary border-primary/30"
        >
          Liquidado
        </Badge>
      )}
      {prorrateado && (
        <Badge variant="secondary" className="text-[10px]">
          Prorrateado
        </Badge>
      )}
      {cpTimbrada && (
        <Badge
          variant="outline"
          title={
            trip.carta_porte?.serie && trip.carta_porte?.folio_cfdi
              ? `CFDI ${trip.carta_porte.serie}-${trip.carta_porte.folio_cfdi}`
              : trip.carta_porte?.uuid
                ? `UUID ${trip.carta_porte.uuid}`
                : undefined
          }
          className="font-medium text-[10px] bg-success/10 text-success border-success/30"
        >
          Timbrada
        </Badge>
      )}
    </>
  );
};

export const TripStatusesBadges = ({
  statuses,
  trip,
}: {
  statuses: TripStatusRef[];
  trip?: Trip;
}) => {
  const financeBadges = trip ? <TripFinanceBadges trip={trip} /> : null;
  if (!statuses.length && !financeBadges) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {statuses.map((s) => (
        <TripStatusChip key={s.id} status={s} />
      ))}
      {financeBadges}
    </div>
  );
};

const StatusMenuRow = ({ status }: { status: TripStatusRef }) => (
  <span className="inline-flex items-center gap-2">
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
      style={{ backgroundColor: status.color }}
    />
    {status.nombre}
  </span>
);

export const TripStatusesPicker = ({
  trip,
  catalog,
  onUpdated,
}: {
  trip: Trip;
  catalog: TripStatusRef[];
  onUpdated: (trip: Trip) => void;
}) => {
  const customOptions = useMemo(
    () => catalog.filter((s) => !s.is_system && s.activo !== false),
    [catalog],
  );
  const systemStatuses = useMemo(
    () => (trip.statuses ?? []).filter((s) => s.is_system),
    [trip.statuses],
  );
  const selectedCustomIds = useMemo(
    () => customStatusesFromTrip(trip).map((s) => s.id),
    [trip],
  );
  const [saving, setSaving] = useState(false);

  const applyStatuses = async (nextCustomIds: string[]) => {
    setSaving(true);
    try {
      if (hasApiConfigured()) {
        const updated = await setTripStatuses(trip.id, nextCustomIds);
        onUpdated(updated);
      } else {
        const custom = catalog.filter((s) => nextCustomIds.includes(s.id));
        onUpdated({ ...trip, statuses: [...systemStatuses, ...custom] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar estados");
    } finally {
      setSaving(false);
    }
  };

  const toggleCustomStatus = (statusId: string, checked: boolean) => {
    const nextIds = checked
      ? [...selectedCustomIds, statusId]
      : selectedCustomIds.filter((id) => id !== statusId);
    void applyStatuses(nextIds);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(e) => e.stopPropagation()}
        >
          <TripStatusesBadges statuses={trip.statuses ?? []} trip={trip} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuLabel>Estados del viaje</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {systemStatuses.map((s) => (
          <DropdownMenuCheckboxItem key={s.id} checked disabled>
            <StatusMenuRow status={s} />
          </DropdownMenuCheckboxItem>
        ))}
        {customOptions.length > 0 && <DropdownMenuSeparator />}
        {customOptions.length === 0 ? (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            Crea estados personalizados con «Estados»
          </DropdownMenuItem>
        ) : (
          customOptions.map((s) => (
            <DropdownMenuCheckboxItem
              key={s.id}
              checked={selectedCustomIds.includes(s.id)}
              disabled={saving}
              onCheckedChange={(v) => toggleCustomStatus(s.id, v === true)}
              onSelect={(e) => e.preventDefault()}
            >
              <StatusMenuRow status={s} />
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const TruckStatusBadge = ({ status }: { status: "activo" | "taller" | "baja" }) => {
  const map: Record<string, string> = {
    activo: "bg-success/10 text-success border-success/30",
    taller: "bg-warning/20 text-warning-foreground border-warning/40",
    baja: "bg-destructive/10 text-destructive border-destructive/30",
  };
  const label: Record<string, string> = { activo: "Activo", taller: "En taller", baja: "Baja" };
  return <Badge variant="outline" className={cn("font-medium", map[status])}>{label[status]}</Badge>;
};

export const DriverStatusBadge = ({ status }: { status: "activo" | "inactivo" }) => (
  <Badge
    variant="outline"
    className={cn(
      "font-medium",
      status === "activo"
        ? "bg-success/10 text-success border-success/30"
        : "bg-muted text-muted-foreground border-border"
    )}
  >
    {status === "activo" ? "Activo" : "Inactivo"}
  </Badge>
);

export const MarginBadge = ({ pct }: { pct: number }) => {
  const tone =
    pct >= 20 ? "bg-success/10 text-success border-success/30"
    : pct >= 5 ? "bg-warning/20 text-warning-foreground border-warning/40"
    : "bg-destructive/10 text-destructive border-destructive/30";
  return (
    <Badge variant="outline" className={cn("font-mono font-semibold", tone)}>
      {pct.toFixed(1)}%
    </Badge>
  );
};