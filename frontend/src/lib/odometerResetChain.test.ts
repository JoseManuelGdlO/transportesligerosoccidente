import { describe, expect, it } from "vitest";
import { chainError, linkChain, type ChainDraft } from "@/lib/odometerResetChain";

function row(partial: Partial<ChainDraft> & Pick<ChainDraft, "id" | "folio">): ChainDraft {
  return {
    cerrado: true,
    kmInicial: 0,
    kmFinal: "",
    ...partial,
  };
}

describe("linkChain", () => {
  it("copia el km final al km inicial del siguiente", () => {
    const linked = linkChain([
      row({ id: "a", folio: "TLO-1", kmInicial: 1221, kmFinal: "1300" }),
      row({ id: "b", folio: "TLO-2", kmInicial: 0, kmFinal: "1410" }),
    ]);
    expect(linked[1]?.kmInicial).toBe(1300);
  });

  it("exige km final antes de seguir la cadena", () => {
    const rows = [
      row({ id: "a", folio: "TLO-1", kmInicial: 1221, kmFinal: "" }),
      row({ id: "b", folio: "TLO-2", kmInicial: 0, kmFinal: "1410" }),
    ];
    expect(chainError(rows)).toMatch(/TLO-1/);
  });
});
