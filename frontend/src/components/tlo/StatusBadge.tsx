import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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