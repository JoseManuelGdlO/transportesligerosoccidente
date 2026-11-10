import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { groupCatalogUbicaciones } from "@/lib/groupClientUbicaciones";
import { cn } from "@/lib/utils";
import type { ClientUbicacion } from "@/types/tlo";

type Props = {
  rows: ClientUbicacion[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
};

function foldSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function CatalogUbicacionSelect({ rows, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupCatalogUbicaciones(rows), [rows]);
  const needle = foldSearch(query);

  const visible = useMemo(() => {
    if (!needle) return groups;
    return groups.flatMap((group) => {
      const headerHit = foldSearch(group.header).includes(needle);
      const items = headerHit
        ? group.items
        : group.items.filter((item) => foldSearch(item.label).includes(needle));
      return items.length > 0 ? [{ ...group, items }] : [];
    });
  }, [groups, needle]);

  const selectedLabel = value
    ? groups.flatMap((group) => group.items).find((item) => item.id === value)?.label
    : undefined;

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };

  return (
    <Popover modal open={open} onOpenChange={close}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-auto min-h-10 w-full justify-between py-2 font-normal", !selectedLabel && "text-muted-foreground")}
        >
          <span className="truncate text-left">{selectedLabel ?? "Manual"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(36rem,calc(100vw-2rem))] min-w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
        align="start"
        side="bottom"
        collisionPadding={16}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} className="flex flex-col overflow-hidden">
          <CommandInput
            placeholder="Escribe para filtrar…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList
            className="max-h-72 overflow-y-auto overscroll-y-contain"
            onWheel={(e) => e.stopPropagation()}
          >
            <CommandGroup>
              <CommandItem
                value="manual"
                onSelect={() => {
                  onChange(undefined);
                  close(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                Manual
              </CommandItem>
            </CommandGroup>
            {visible.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin ubicaciones</p>
            ) : (
              visible.map((group) => (
                <CommandGroup key={group.key}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-foreground">{group.header}</div>
                  {group.items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={() => {
                        onChange(item.id);
                        close(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          value === item.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="whitespace-normal text-muted-foreground">{item.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
