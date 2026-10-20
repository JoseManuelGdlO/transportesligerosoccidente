import { describe, expect, it } from "vitest";
import { keepFilledFiscal } from "@/lib/fiscalPrefill";

describe("keepFilledFiscal", () => {
  it("no deja que un catálogo vacío borre el RFC o el permiso ya leídos de la ficha", () => {
    expect(keepFilledFiscal(undefined, "VAAJ780722U22")).toBe("VAAJ780722U22");
    expect(keepFilledFiscal("", "TPAF01")).toBe("TPAF01");
    expect(keepFilledFiscal("C2", "T3S2")).toBe("C2");
  });
});
