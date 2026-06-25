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
import { lookupSatClaveProducto, searchSatClavesProducto } from "@/lib/tloApi";
import type { SatClaveProducto } from "@/types/tlo";

type Props = {
  value: string;
  onSelect: (item: SatClaveProducto) => void;
  onClear?: () => void;
  disabled?: boolean;
  className?: string;
};

export function SatClaveProductoCombobox({
  value,
  onSelect,
  onClear,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SatClaveProducto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SatClaveProducto | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!value.trim()) {
      setSelected(null);
      return;
    }
    if (selected?.clave === value.trim()) return;

    let cancelled = false;
    void (async () => {
      const row = await lookupSatClaveProducto(value);
      if (!cancelled) setSelected(row);
    })();

    return () => {
      cancelled = true;
    };
  }, [value, selected?.clave]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const term = query.trim() || value.trim();
    if (!term) {
      setItems([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      void searchSatClavesProducto(term)
        .then((rows) => setItems(rows))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query, value]);

  const label = selected
    ? `${selected.clave} — ${selected.descripcion}`
    : value.trim()
      ? value.trim()
      : "Buscar clave o descripción…";

  const pick = (item: SatClaveProducto) => {
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
          disabled={disabled}
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
                  key={item.clave}
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
