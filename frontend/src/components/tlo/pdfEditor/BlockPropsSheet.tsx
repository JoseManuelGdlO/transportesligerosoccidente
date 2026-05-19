import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BLOCK_CATALOG, type BlockInstance, type BlockProps } from "@/types/pdfTemplate";

export interface BlockPropsSheetProps {
  block: BlockInstance | null;
  onClose: () => void;
  onChange: (props: BlockProps) => void;
}

export function BlockPropsSheet({ block, onClose, onChange }: BlockPropsSheetProps) {
  const def = block ? BLOCK_CATALOG[block.id] : null;
  const open = Boolean(block && def?.propSchema && def.propSchema.length > 0);

  const value = block?.props ?? {};
  const update = (key: keyof BlockProps, v: unknown) => {
    const next: BlockProps = { ...value };
    if (v === "" || v === undefined || v === null) {
      delete next[key];
    } else {
      (next as Record<string, unknown>)[key as string] = v;
    }
    onChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Propiedades del bloque</SheetTitle>
          <SheetDescription>{def?.label}{def?.description ? ` · ${def.description}` : ""}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {def?.propSchema?.map((field) => {
            const current = value[field.key];
            const id = `prop-${field.key}`;
            if (field.type === "select" && field.options) {
              const stringValue = typeof current === "string" ? current : "";
              return (
                <div key={field.key} className="space-y-1">
                  <Label htmlFor={id}>{field.label}</Label>
                  <Select value={stringValue} onValueChange={(v) => update(field.key, v)}>
                    <SelectTrigger id={id}><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {field.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            }
            if (field.type === "number") {
              const num = typeof current === "number" ? current : (typeof current === "string" ? Number(current) : "");
              return (
                <div key={field.key} className="space-y-1">
                  <Label htmlFor={id}>{field.label}</Label>
                  <Input
                    id={id}
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step ?? 1}
                    value={Number.isFinite(num) ? String(num) : ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      update(field.key, v);
                    }}
                  />
                </div>
              );
            }
            const txt = typeof current === "string" ? current : "";
            if (field.multiline) {
              return (
                <div key={field.key} className="space-y-1">
                  <Label htmlFor={id}>{field.label}</Label>
                  <Textarea
                    id={id}
                    rows={6}
                    value={txt}
                    placeholder={field.placeholder}
                    onChange={(e) => update(field.key, e.target.value)}
                  />
                </div>
              );
            }
            return (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={id}>{field.label}</Label>
                <Input id={id} value={txt} placeholder={field.placeholder} onChange={(e) => update(field.key, e.target.value)} />
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
