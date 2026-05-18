import type { PacProvider } from "./types";
import { StubPacProvider } from "./StubPacProvider";

export type { PacProvider, TimbradoResult } from "./types";

export function getPacProvider(proveedor?: string | null): PacProvider {
  const p = (proveedor || process.env.PAC_PROVIDER || "stub").toLowerCase();
  switch (p) {
    case "stub":
    default:
      return new StubPacProvider();
  }
}
