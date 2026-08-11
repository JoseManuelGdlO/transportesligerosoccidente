import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
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
import type { Supplier } from "@/types/tlo";

type Props = {
  suppliers: Supplier[];
  value: string;
  onChange: (supplierId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
};

export function SupplierCombobox({
  suppliers,
  value,
  onChange,
  disabled,
  placeholder = "Buscar proveedor…",
  className,
  allowClear = true,
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => suppliers.find((s) => s.id === value) ?? null,
    [suppliers, value],
  );

  const label = selected?.razon_social ?? placeholder;

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
            <CommandEmpty>Sin proveedores</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem
                  value="__none__ sin proveedor"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                  <span className="text-muted-foreground">Sin proveedor</span>
                </CommandItem>
              )}
              {suppliers.map((s) => {
                const search = [s.razon_social, s.rfc, s.contacto].filter(Boolean).join(" ");
                return (
                  <CommandItem
                    key={s.id}
                    value={search}
                    onSelect={() => {
                      onChange(s.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4 shrink-0", value === s.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="min-w-0 flex-1 truncate">{s.razon_social}</span>
                    {s.rfc ? (
                      <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">
                        {s.rfc}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {allowClear && value ? (
          <div className="border-t p-2">
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
              Quitar proveedor
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
