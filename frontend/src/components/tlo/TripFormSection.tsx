import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/** Agrupa campos relacionados dentro de modales de viaje. */
export function TripFormSection({ title, description, children, className }: Props) {
  return (
    <section className={cn("space-y-3 rounded-lg border bg-muted/20 p-3 sm:p-4", className)}>
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
