import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { groupCatalogUbicaciones } from "@/lib/groupClientUbicaciones";
import type { ClientUbicacion } from "@/types/tlo";

type Props = {
  rows: ClientUbicacion[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
};

export function CatalogUbicacionSelect({ rows, value, onChange }: Props) {
  const groups = groupCatalogUbicaciones(rows);
  return (
    <Select
      value={value || "none"}
      onValueChange={(next) => onChange(next === "none" ? undefined : next)}
    >
      <SelectTrigger>
        <SelectValue placeholder="Seleccionar ubicación" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Manual</SelectItem>
        {groups.map((group) => (
          <SelectGroup key={group.key}>
            <SelectLabel className="text-xs font-semibold text-foreground">{group.header}</SelectLabel>
            {group.items.map((item) => (
              <SelectItem key={item.id} value={item.id} className="pl-10 text-muted-foreground">
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
