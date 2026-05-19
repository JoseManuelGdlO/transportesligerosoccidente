import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  BLOCK_CATALOG,
  blockAvailableForKind,
  type BlockType,
  type TemplateKind,
  type ZoneId,
} from "@/types/pdfTemplate";

export interface BlockPaletteProps {
  kind: TemplateKind;
  zone: ZoneId;
  usedIds: Set<BlockType>;
  onAdd: (id: BlockType) => void;
}

export function BlockPalette({ kind, zone, usedIds, onAdd }: BlockPaletteProps) {
  const items = useMemo(() => {
    return (Object.keys(BLOCK_CATALOG) as BlockType[])
      .filter((id) => blockAvailableForKind(id, kind))
      .filter((id) => BLOCK_CATALOG[id].zones.includes(zone))
      .filter((id) => BLOCK_CATALOG[id].multi || !usedIds.has(id));
  }, [kind, zone, usedIds]);

  if (items.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground py-1">
        No hay bloques disponibles para agregar a esta zona.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((id) => {
        const def = BLOCK_CATALOG[id];
        return (
          <Button
            key={id}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => onAdd(id)}
            title={def.description}
          >
            <Plus className="h-3 w-3 mr-1" />
            {def.label}
          </Button>
        );
      })}
    </div>
  );
}
