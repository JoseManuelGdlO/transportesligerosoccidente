import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function LoadingSpinner({
  label = "Cargando",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return <progress aria-label={label} className={cn("loading-spinner", className)} />;
}

export function PageLoader({
  label = "Cargando",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 py-16", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <LoadingSpinner label={label} />
      <p className="text-sm text-muted-foreground">{label}…</p>
    </div>
  );
}

export function TableBodySkeleton({ rows = 8, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <TableRow key={r} aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <TableCell key={c}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Skeleton className="h-4 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[88px] w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[280px] w-full rounded-lg" />
      <Skeleton className="h-[220px] w-full rounded-lg" />
    </div>
  );
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando formulario">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Estructura del layout autenticado mientras se restaura la sesión. */
export function AppShellSkeleton() {
  return (
    <div className="h-svh flex w-full bg-background overflow-hidden" aria-busy="true" aria-label="Cargando sesión">
      <aside className="hidden md:flex w-[16rem] shrink-0 flex-col border-r bg-[hsl(var(--sidebar-background))]">
        <div className="flex items-center gap-3 px-4 py-5 border-b border-[hsl(var(--sidebar-border))]">
          <Skeleton className="h-11 w-11 rounded-md bg-white/20" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-16 bg-white/20" />
            <Skeleton className="h-2.5 w-28 bg-white/15" />
          </div>
        </div>
        <div className="p-4 space-y-6">
          {Array.from({ length: 3 }, (_, g) => (
            <div key={g} className="space-y-2">
              <Skeleton className="h-3 w-20 bg-white/15" />
              {Array.from({ length: g === 0 ? 6 : 4 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full bg-white/10" />
              ))}
            </div>
          ))}
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 flex items-center gap-3 border-b bg-card px-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-5 w-40" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="hidden md:block h-4 w-48" />
        </header>
        <main className="flex-1 min-h-0 p-4 md:p-6 overflow-hidden">
          <DashboardSkeleton />
        </main>
      </div>
    </div>
  );
}
