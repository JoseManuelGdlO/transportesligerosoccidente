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
  lookupSatEstado,
  lookupSatLocalidad,
  lookupSatMunicipio,
  searchSatColonias,
  searchSatEstados,
  searchSatLocalidades,
  searchSatMunicipios,
} from "@/lib/tloApi";

export type SatUbicacionKind = "estado" | "municipio" | "localidad" | "colonia";

export type SatUbicacionSelection = {
  clave: string;
  descripcion: string;
  municipio_clave?: string;
  municipio?: string;
};

function normalizeDesc(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function pickByDescription<T extends { descripcion: string }>(
  items: T[],
  hint: string,
): T | null {
  if (!items.length) return null;
  const norm = normalizeDesc(hint);
  return (
    items.find((item) => normalizeDesc(item.descripcion) === norm) ??
    items.find((item) => normalizeDesc(item.descripcion).includes(norm)) ??
    items[0]
  );
}

type Props = {
  kind: SatUbicacionKind;
  value: string;
  estado?: string;
  cp?: string;
  descriptionHint?: string;
  estadoMunicipioHint?: { municipio_clave?: string; municipio: string };
  onSelect: (item: SatUbicacionSelection) => void;
  onResolve?: (item: SatUbicacionSelection) => void;
  onClear?: () => void;
  disabled?: boolean;
  className?: string;
};

export function SatUbicacionCombobox({
  kind,
  value,
  estado,
  cp,
  descriptionHint,
  estadoMunicipioHint,
  onSelect,
  onResolve,
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
  const resolvedRef = useRef("");
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;

  const filterReady =
    kind === "estado"
      ? true
      : kind === "colonia"
        ? /^\d{5}$/.test((cp ?? "").trim())
        : !!(estado ?? "").trim();

  useEffect(() => {
    const clave = value.trim();
    const hint = descriptionHint?.trim() ?? "";
    const municipioHint = estadoMunicipioHint?.municipio?.trim() ?? hint;

    if (!clave && !hint) {
      setSelected(null);
      resolvedRef.current = "";
      return;
    }

    if (clave && selected?.clave === clave) {
      if (kind === "municipio" || kind === "localidad" || kind === "colonia") return;
      if (kind !== "estado") return;
      const municipioClave = estadoMunicipioHint?.municipio_clave?.trim();
      if (!municipioClave) return;
      if (selected.municipio_clave === municipioClave) return;
    }

    let cancelled = false;
    void (async () => {
      let row: SatUbicacionSelection | null = null;

      const maybeResolve = (item: SatUbicacionSelection) => {
        const key = `${kind}:${item.clave}:${item.descripcion}`;
        if (!onResolveRef.current || resolvedRef.current === key) return;
        resolvedRef.current = key;
        onResolveRef.current(item);
      };

      if (kind === "estado") {
        let municipioClave = estadoMunicipioHint?.municipio_clave?.trim();
        if (!municipioClave && municipioHint && clave) {
          const hits = await searchSatMunicipios(municipioHint, clave, 10);
          const match = pickByDescription(hits, municipioHint);
          municipioClave = match?.clave;
        }
        if (clave && municipioClave) {
          const hit = await lookupSatEstado(clave, municipioClave);
          row = hit
            ? {
                clave: hit.clave,
                descripcion: hit.descripcion,
                municipio_clave: hit.municipio_clave,
                municipio: hit.municipio,
              }
            : null;
          if (row?.municipio_clave && !estadoMunicipioHint?.municipio_clave) {
            maybeResolve({
              clave: row.municipio_clave,
              descripcion: row.municipio ?? row.descripcion,
              municipio_clave: row.municipio_clave,
              municipio: row.municipio,
            });
          }
        } else if (clave) {
          row = { clave, descripcion: clave };
        }
      } else if (kind === "municipio" && estado) {
        if (clave) {
          const hit = await lookupSatMunicipio(estado, clave);
          row = hit ? { clave: hit.clave, descripcion: hit.descripcion } : null;
        }
        if (!row && hint) {
          const hits = await searchSatMunicipios(hint, estado, 10);
          const match = pickByDescription(hits, hint);
          if (match) {
            row = { clave: match.clave, descripcion: match.descripcion };
            maybeResolve(row);
          }
        }
      } else if (kind === "localidad" && estado) {
        if (clave) {
          const hit = await lookupSatLocalidad(estado, clave);
          row = hit ? { clave: hit.clave, descripcion: hit.descripcion } : null;
        }
        if (!row && hint) {
          const hits = await searchSatLocalidades(hint, estado, 10);
          const match = pickByDescription(hits, hint);
          if (match) {
            row = { clave: match.clave, descripcion: match.descripcion };
            maybeResolve(row);
          }
        }
      } else if (kind === "colonia" && cp) {
        if (clave) {
          const hit = await lookupSatColonia(cp, clave);
          row = hit ? { clave: hit.clave, descripcion: hit.nombre } : null;
        }
        if (!row && hint) {
          const hits = await searchSatColonias(hint, cp, 10);
          const norm = normalizeDesc(hint);
          const match =
            hits.find((item) => normalizeDesc(item.nombre) === norm) ??
            hits.find((item) => normalizeDesc(item.nombre).includes(norm)) ??
            hits[0];
          if (match) {
            row = { clave: match.clave, descripcion: match.nombre };
            maybeResolve(row);
          }
        }
      }

      if (!cancelled) setSelected(row);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    value,
    descriptionHint,
    selected?.clave,
    selected?.municipio_clave,
    kind,
    estado,
    cp,
    estadoMunicipioHint?.municipio,
    estadoMunicipioHint?.municipio_clave,
  ]);

  useEffect(() => {
    if (!open || !filterReady) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const term = query.trim() || value.trim();

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      const searchPromise =
        kind === "estado"
          ? searchSatEstados(term)
          : kind === "municipio"
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
                : {
                    clave: row.clave,
                    descripcion: row.descripcion,
                    municipio_clave:
                      "municipio_clave" in row ? row.municipio_clave : undefined,
                    municipio: "municipio" in row ? row.municipio : undefined,
                  },
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

  const selectedLabel = selected
    ? kind === "estado"
      ? selected.municipio_clave
        ? `${selected.clave} — ${selected.municipio ?? selected.descripcion}`
        : selected.clave
      : `${selected.clave} — ${selected.descripcion}`
    : null;

  const label = !filterReady
    ? kind === "colonia"
      ? "Capture C.P. primero…"
      : "Capture estado primero…"
    : selectedLabel
      ? selectedLabel
      : descriptionHint?.trim()
        ? descriptionHint.trim()
        : value.trim()
          ? value.trim()
          : kind === "estado"
            ? "Buscar estado…"
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
    <Popover modal open={open} onOpenChange={setOpen}>
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
        className="w-[min(32rem,calc(100vw-2rem))] min-w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
        align="start"
        side="bottom"
        collisionPadding={16}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} className="flex flex-col overflow-hidden">
          <CommandInput
            placeholder="Clave o descripción…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList
            className="h-52 max-h-52 overflow-y-auto overscroll-y-contain"
            style={{ maxHeight: "13rem", height: "13rem" }}
            onWheel={(e) => e.stopPropagation()}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando…
              </div>
            ) : (
              <CommandEmpty>Sin resultados en catálogo SAT</CommandEmpty>
            )}
            <CommandGroup className="overflow-visible">
              {items.map((item) => (
                <CommandItem
                  key={`${item.clave}-${item.municipio_clave ?? item.descripcion}`}
                  value={`${item.clave} ${item.descripcion}`}
                  onSelect={() => pick(item)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === item.clave &&
                        (!estadoMunicipioHint?.municipio_clave ||
                          estadoMunicipioHint.municipio_clave === item.municipio_clave)
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <span className="font-mono text-xs">{item.clave}</span>
                  <span className="ml-2 truncate">{item.descripcion}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {(value.trim() || selected || descriptionHint?.trim()) && onClear ? (
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
