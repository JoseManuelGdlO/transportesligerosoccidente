import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RouteCatalog } from "@/types/tlo";

const CUSTOM_ROUTE_ID = "__custom__";
const CUSTOM_ROUTE_LABEL = "Personalizada (editar paradas)";

function routeLabel(route: RouteCatalog): string {
  return `${route.nombre} — ${route.ruta_resumen}${route.client_id ? "" : " (global)"}`;
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

type Props = {
  routes: RouteCatalog[];
  value: string;
  onChange: (routeId: string) => void;
  disabled?: boolean;
};

export function RouteCombobox({ routes, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => routes.find((r) => r.id === value) ?? null, [routes, value]);
  const label =
    value === CUSTOM_ROUTE_ID ? CUSTOM_ROUTE_LABEL : selected ? routeLabel(selected) : "Personalizada o del catálogo";

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-auto min-h-10 w-full justify-between py-2 font-normal", !value && "text-muted-foreground")}
        >
          <span className="truncate text-left">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(42rem,calc(100vw-2rem))] min-w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
        align="start"
        side="bottom"
        collisionPadding={16}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command
          className="flex flex-col overflow-hidden"
          filter={(itemValue, search) => (fold(itemValue).includes(fold(search)) ? 1 : 0)}
        >
          <CommandInput placeholder="Escribe para filtrar rutas…" />
          <CommandList
            className="h-60 max-h-60 overflow-y-auto overscroll-y-contain"
            onWheel={(e) => e.stopPropagation()}
          >
            <CommandEmpty>Sin rutas</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`${CUSTOM_ROUTE_LABEL} personalizada`}
                onSelect={() => {
                  onChange(CUSTOM_ROUTE_ID);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn("mr-2 h-4 w-4 shrink-0", value === CUSTOM_ROUTE_ID ? "opacity-100" : "opacity-0")}
                />
                <span className="text-muted-foreground">{CUSTOM_ROUTE_LABEL}</span>
              </CommandItem>
              {routes.map((route) => {
                const text = routeLabel(route);
                return (
                  <CommandItem
                    key={route.id}
                    value={`${text} ${route.id}`}
                    onSelect={() => {
                      onChange(route.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4 shrink-0", value === route.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="min-w-0 flex-1 whitespace-normal text-left leading-snug">{text}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
