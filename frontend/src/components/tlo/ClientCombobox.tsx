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
import type { Client } from "@/types/tlo";

export type ClientComboboxExtraOption = {
  value: string;
  label: string;
};

type Props = {
  clients: Client[];
  value: string;
  onChange: (clientId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  extraOptions?: ClientComboboxExtraOption[];
};

export function ClientCombobox({
  clients,
  value,
  onChange,
  disabled,
  placeholder = "Seleccionar cliente…",
  className,
  extraOptions = [],
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => clients.find((c) => c.id === value) ?? null,
    [clients, value],
  );
  const extraSelected = extraOptions.find((o) => o.value === value);
  const label = selected?.razon_social ?? extraSelected?.label ?? placeholder;

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && !extraSelected && "text-muted-foreground",
            className,
          )}
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
            <CommandEmpty>Sin clientes</CommandEmpty>
            <CommandGroup>
              {extraOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")}
                  />
                  <span className="text-muted-foreground">{option.label}</span>
                </CommandItem>
              ))}
              {clients.map((c) => {
                const search = [c.razon_social, c.rfc, c.alias, c.id].filter(Boolean).join(" ");
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
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === c.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{c.razon_social}</span>
                    {c.alias?.trim() ? (
                      <span className="ml-2 shrink-0 truncate text-xs text-muted-foreground">
                        {c.alias.trim()}
                      </span>
                    ) : null}
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
