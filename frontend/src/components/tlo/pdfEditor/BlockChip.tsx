import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Settings2, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BLOCK_CATALOG, type BlockInstance } from "@/types/pdfTemplate";

export interface BlockChipProps {
  uid: string;
  block: BlockInstance;
  onToggleEnabled: () => void;
  onOpenProps: () => void;
  onRemove: () => void;
}

export function BlockChip({ uid, block, onToggleEnabled, onOpenProps, onRemove }: BlockChipProps) {
  const def = BLOCK_CATALOG[block.id];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: uid });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const hasProps = Boolean(def?.propSchema && def.propSchema.length > 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 px-2 py-1.5 rounded border bg-card ${block.enabled ? "" : "opacity-60"}`}
    >
      <button
        type="button"
        className="p-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Arrastrar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-medium truncate">{def?.label ?? block.id}</div>
        {def?.description && <div className="text-[11px] text-muted-foreground truncate">{def.description}</div>}
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={onToggleEnabled}
        title={block.enabled ? "Ocultar" : "Mostrar"}
      >
        {block.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </Button>
      {hasProps && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={onOpenProps}
          title="Propiedades"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-destructive hover:text-destructive"
        onClick={onRemove}
        title="Eliminar"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
