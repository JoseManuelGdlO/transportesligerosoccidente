import type { Tenant } from "../../models";
import type { PacProvider } from "./types";
import { StubPacProvider } from "./StubPacProvider";
import { SicofiPacProvider } from "./SicofiPacProvider";

export type { PacProvider, TimbradoResult, TimbradoContext, TimbradoOpts } from "./types";

export function getPacProvider(tenant?: Tenant | null): PacProvider {
  const p = (tenant?.pac_proveedor || process.env.PAC_PROVIDER || "stub").toLowerCase();
  switch (p) {
    case "sicofi":
      return new SicofiPacProvider();
    case "stub":
    default:
      return new StubPacProvider();
  }
}
