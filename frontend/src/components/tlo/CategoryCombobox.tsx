import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
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
import type { MaintenanceCategory } from "@/types/tlo";

type Props = {
  categories: MaintenanceCategory[];
  value: string;
  onChange: (categoryId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
  onCreateNavigate?: () => void;
};

export function CategoryCombobox({
  categories,
  value,
  onChange,
  disabled,
  placeholder = "Buscar categoría…",
  className,
  allowClear = true,
  onCreateNavigate,
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => categories.find((c) => c.id === value) ?? null,
    [categories, value],
  );

  const label = selected?.nombre ?? placeholder;

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate text-left">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(28rem,calc(100vw-2rem))] min-w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
        align="start"
        side="bottom"
        collisionPadding={16}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command className="flex flex-col overflow-hidden">
          <CommandInput placeholder="Escribe para filtrar…" />
          <CommandList
            className="h-60 max-h-60 overflow-y-auto overscroll-y-contain"
            onWheel={(e) => e.stopPropagation()}
          >
            <CommandEmpty>Sin categorías</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem
                  value="__none__ sin categoria"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                  <span className="text-muted-foreground">Sin categoría</span>
                </CommandItem>
              )}
              {categories.map((c) => {
                const search = [c.nombre, c.descripcion].filter(Boolean).join(" ");
                return (
                  <CommandItem
                    key={c.id}
                    value={search}
                    onSelect={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4 shrink-0", value === c.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t p-2 space-y-1">
          {onCreateNavigate ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setOpen(false);
                onCreateNavigate();
              }}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Nueva categoría
            </Button>
          ) : null}
          {allowClear && value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <X className="mr-2 h-3.5 w-3.5" />
              Quitar categoría
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
