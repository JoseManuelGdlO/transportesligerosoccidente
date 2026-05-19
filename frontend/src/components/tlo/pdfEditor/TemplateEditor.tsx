import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandingForm } from "./BrandingForm";
import { BlockChip } from "./BlockChip";
import { BlockPalette } from "./BlockPalette";
import { BlockPropsSheet } from "./BlockPropsSheet";
import {
  BLOCK_CATALOG,
  type BlockInstance,
  type BlockProps,
  type BlockType,
  type PdfBranding,
  type PdfTemplate,
  type TemplateKind,
  type ZoneId,
} from "@/types/pdfTemplate";

const ZONE_LABELS: Record<ZoneId, string> = {
  header: "Encabezado",
  body: "Cuerpo",
  footer: "Pie",
};

const ZONES: ZoneId[] = ["header", "body", "footer"];

function uidFor(zone: ZoneId, index: number): string {
  return `${zone}__${index}`;
}

function parseUid(uid: string): { zone: ZoneId; index: number } | null {
  const [zone, idx] = uid.split("__");
  if (zone !== "header" && zone !== "body" && zone !== "footer") return null;
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0) return null;
  return { zone, index: i };
}

export interface TemplateEditorProps {
  kind: TemplateKind;
  template: PdfTemplate;
  onChange: (next: PdfTemplate) => void;
  logoPreview: string | null;
  hasLogo: boolean;
  onLogoFile: (file: File | null) => void;
  onLogoRemove: () => void;
  disabled?: boolean;
}

export function TemplateEditor({
  kind,
  template,
  onChange,
  logoPreview,
  hasLogo,
  onLogoFile,
  onLogoRemove,
  disabled,
}: TemplateEditorProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [propsSheet, setPropsSheet] = useState<{ zone: ZoneId; index: number } | null>(null);

  const handleBranding = (next: PdfBranding) => {
    onChange({ ...template, branding: next });
  };

  const setZoneBlocks = (zone: ZoneId, blocks: BlockInstance[]) => {
    onChange({
      ...template,
      sections: { ...template.sections, [zone]: blocks },
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || activeId === overId) return;
    const a = parseUid(activeId);
    const o = parseUid(overId);
    if (!a || !o) return;

    if (a.zone === o.zone) {
      const arr = template.sections[a.zone];
      setZoneBlocks(a.zone, arrayMove(arr, a.index, o.index));
      return;
    }

    const src = template.sections[a.zone];
    const dst = template.sections[o.zone];
    const moving = src[a.index];
    if (!moving) return;
    const def = BLOCK_CATALOG[moving.id];
    if (!def || !def.zones.includes(o.zone)) return;
    const nextSrc = src.filter((_, i) => i !== a.index);
    const nextDst = [...dst];
    nextDst.splice(o.index, 0, moving);
    onChange({
      ...template,
      sections: { ...template.sections, [a.zone]: nextSrc, [o.zone]: nextDst },
    });
  };

  const addBlock = (zone: ZoneId, id: BlockType) => {
    const def = BLOCK_CATALOG[id];
    const block: BlockInstance = {
      id,
      enabled: true,
      ...(def?.defaultProps ? { props: { ...def.defaultProps } } : {}),
    };
    setZoneBlocks(zone, [...template.sections[zone], block]);
  };

  const removeBlock = (zone: ZoneId, index: number) => {
    setZoneBlocks(zone, template.sections[zone].filter((_, i) => i !== index));
  };

  const toggleEnabled = (zone: ZoneId, index: number) => {
    setZoneBlocks(
      zone,
      template.sections[zone].map((b, i) => (i === index ? { ...b, enabled: !b.enabled } : b)),
    );
  };

  const updateProps = (zone: ZoneId, index: number, props: BlockProps) => {
    setZoneBlocks(
      zone,
      template.sections[zone].map((b, i) => {
        if (i !== index) return b;
        const cleaned = Object.keys(props).length > 0 ? props : undefined;
        return cleaned ? { ...b, props: cleaned } : { ...b, props: undefined };
      }),
    );
  };

  const usedByZone = useMemo<Record<ZoneId, Set<BlockType>>>(() => {
    const out = { header: new Set<BlockType>(), body: new Set<BlockType>(), footer: new Set<BlockType>() };
    for (const z of ZONES) {
      for (const b of template.sections[z]) out[z].add(b.id);
    }
    return out;
  }, [template]);

  const activeProps = propsSheet
    ? template.sections[propsSheet.zone][propsSheet.index] ?? null
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branding</CardTitle>
        </CardHeader>
        <CardContent>
          <BrandingForm
            branding={template.branding}
            onChange={handleBranding}
            logoPreview={logoPreview}
            hasLogo={hasLogo}
            onLogoFile={onLogoFile}
            onLogoRemove={onLogoRemove}
            disabled={disabled}
          />
        </CardContent>
      </Card>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {ZONES.map((zone) => {
          const blocks = template.sections[zone];
          const ids = blocks.map((_, i) => uidFor(zone, i));
          return (
            <Card key={zone}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{ZONE_LABELS[zone]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  {blocks.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2 italic">Sin bloques en esta zona.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {blocks.map((block, i) => (
                        <BlockChip
                          key={uidFor(zone, i)}
                          uid={uidFor(zone, i)}
                          block={block}
                          onToggleEnabled={() => toggleEnabled(zone, i)}
                          onOpenProps={() => setPropsSheet({ zone, index: i })}
                          onRemove={() => removeBlock(zone, i)}
                        />
                      ))}
                    </div>
                  )}
                </SortableContext>
                <div className="pt-1 border-t">
                  <div className="text-[11px] uppercase text-muted-foreground mt-2 mb-1">Agregar bloque</div>
                  <BlockPalette kind={kind} zone={zone} usedIds={usedByZone[zone]} onAdd={(id) => addBlock(zone, id)} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </DndContext>

      <BlockPropsSheet
        block={activeProps}
        onClose={() => setPropsSheet(null)}
        onChange={(p) => propsSheet && updateProps(propsSheet.zone, propsSheet.index, p)}
      />
    </div>
  );
}
