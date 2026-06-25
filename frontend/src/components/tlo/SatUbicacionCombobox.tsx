import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
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
import {
  lookupSatColonia,
  lookupSatLocalidad,
  lookupSatMunicipio,
  searchSatColonias,
  searchSatLocalidades,
  searchSatMunicipios,
} from "@/lib/tloApi";

export type SatUbicacionKind = "municipio" | "localidad" | "colonia";

export type SatUbicacionSelection = {
  clave: string;
  descripcion: string;
};

type Props = {
  kind: SatUbicacionKind;
  value: string;
  estado?: string;
  cp?: string;
  onSelect: (item: SatUbicacionSelection) => void;
  onClear?: () => void;
  disabled?: boolean;
  className?: string;
};

export function SatUbicacionCombobox({
  kind,
  value,
  estado,
  cp,
  onSelect,
  onClear,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SatUbicacionSelection[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SatUbicacionSelection | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filterReady =
    kind === "colonia" ? /^\d{5}$/.test((cp ?? "").trim()) : !!(estado ?? "").trim();

  useEffect(() => {
    if (!value.trim()) {
      setSelected(null);
      return;
    }
    if (selected?.clave === value.trim()) return;

    let cancelled = false;
    void (async () => {
      let row: SatUbicacionSelection | null = null;
      if (kind === "municipio" && estado) {
        const hit = await lookupSatMunicipio(estado, value);
        row = hit ? { clave: hit.clave, descripcion: hit.descripcion } : null;
      } else if (kind === "localidad" && estado) {
        const hit = await lookupSatLocalidad(estado, value);
        row = hit ? { clave: hit.clave, descripcion: hit.descripcion } : null;
      } else if (kind === "colonia" && cp) {
        const hit = await lookupSatColonia(cp, value);
        row = hit ? { clave: hit.clave, descripcion: hit.nombre } : null;
      }
      if (!cancelled) setSelected(row);
    })();

    return () => {
      cancelled = true;
    };
  }, [value, selected?.clave, kind, estado, cp]);

  useEffect(() => {
    if (!open || !filterReady) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const term = query.trim() || value.trim();

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      const searchPromise =
        kind === "municipio"
          ? searchSatMunicipios(term, estado ?? "")
          : kind === "localidad"
            ? searchSatLocalidades(term, estado ?? "")
            : searchSatColonias(term, cp ?? "");

      void searchPromise
        .then((rows) =>
          setItems(
            rows.map((row) =>
              kind === "colonia"
                ? { clave: row.clave, descripcion: row.nombre }
                : { clave: row.clave, descripcion: row.descripcion },
            ),
          ),
        )
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query, value, kind, estado, cp, filterReady]);

  const label = !filterReady
    ? kind === "colonia"
      ? "Capture C.P. primero…"
      : "Capture estado primero…"
    : selected
      ? `${selected.clave} — ${selected.descripcion}`
      : value.trim()
        ? value.trim()
        : kind === "colonia"
          ? "Buscar colonia…"
          : kind === "localidad"
            ? "Buscar localidad…"
            : "Buscar municipio…";

  const pick = (item: SatUbicacionSelection) => {
    setSelected(item);
    onSelect(item);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || !filterReady}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate text-left">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(32rem,calc(100vw-2rem))] min-w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        side="bottom"
        collisionPadding={16}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Clave o descripción…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando…
              </div>
            ) : (
              <CommandEmpty>Sin resultados en catálogo SAT</CommandEmpty>
            )}
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={`${item.clave}-${item.descripcion}`}
                  value={`${item.clave} ${item.descripcion}`}
                  onSelect={() => pick(item)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === item.clave ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="font-mono text-xs">{item.clave}</span>
                  <span className="ml-2 truncate">{item.descripcion}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {value && onClear ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setSelected(null);
                setQuery("");
                onClear();
                setOpen(false);
              }}
            >
              Limpiar selección
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
