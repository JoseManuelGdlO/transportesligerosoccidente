import { describe, expect, it } from "vitest";
import {
  classifyCartaPorteIssues,
  empresaFiscalHint,
  firstErrorSection,
  timbradoValidationToast,
} from "./cartaPorteIssues";

describe("classifyCartaPorteIssues", () => {
  it("manda Cliente al aviso de cliente, no al de empresa", () => {
    const flags = classifyCartaPorteIssues(["Cliente: falta régimen fiscal"], 2);
    expect(flags.hasClienteIssues).toBe(true);
    expect(flags.hasEmpresaIssues).toBe(false);
    expect(flags.hasPacIssues).toBe(false);
  });

  it("manda PAC al aviso de PAC, no al de empresa", () => {
    const flags = classifyCartaPorteIssues(["PAC: falta usuario Sicofi"], 2);
    expect(flags.hasPacIssues).toBe(true);
    expect(flags.hasEmpresaIssues).toBe(false);
    expect(flags.hasClienteIssues).toBe(false);
  });

  it("deja en empresa los datos del emisor", () => {
    const flags = classifyCartaPorteIssues(
      ["RFC de la empresa no configurado", "Empresa: falta razón social del emisor"],
      2,
    );
    expect(flags.hasEmpresaIssues).toBe(true);
    expect(flags.hasClienteIssues).toBe(false);
    expect(flags.hasPacIssues).toBe(false);
  });

  it("no trata la razón social de una ubicación como dato de empresa", () => {
    const flags = classifyCartaPorteIssues(["Ubicación origen: falta razón social"], 2);
    expect(flags.hasEmpresaIssues).toBe(false);
    expect(flags.origen.nombre).toBe(true);
  });
});

describe("firstErrorSection", () => {
  it("hace scroll al cliente cuando el único faltante es del cliente", () => {
    const flags = classifyCartaPorteIssues(["Cliente: falta código postal fiscal"], 2);
    expect(firstErrorSection(flags, 2)).toBe("cliente");
  });

  it("hace scroll al PAC cuando el único faltante es la credencial", () => {
    const flags = classifyCartaPorteIssues(["PAC: falta contraseña Sicofi"], 2);
    expect(firstErrorSection(flags, 2)).toBe("pac");
  });

  it("prioriza empresa sobre cliente", () => {
    const flags = classifyCartaPorteIssues(
      ["RFC de la empresa no configurado", "Cliente: falta RFC"],
      2,
    );
    expect(firstErrorSection(flags, 2)).toBe("empresa");
  });
});

describe("empresaFiscalHint", () => {
  it("omite certificados CSD cuando el PAC es Sicofi", () => {
    expect(empresaFiscalHint("sicofi")).not.toMatch(/CSD/);
    expect(empresaFiscalHint("Sicofi")).toMatch(/RFC/);
  });

  it("pide CSD si el PAC no es Sicofi", () => {
    expect(empresaFiscalHint("otro")).toMatch(/CSD/);
    expect(empresaFiscalHint(null)).toMatch(/CSD/);
  });
});

describe("timbradoValidationToast", () => {
  it("incluye las frases exactas del preview", () => {
    const toast = timbradoValidationToast([
      "Cliente: falta régimen fiscal",
      "PAC: falta usuario Sicofi",
    ]);
    expect(toast.description).toContain("Cliente: falta régimen fiscal");
    expect(toast.description).toContain("PAC: falta usuario Sicofi");
  });

  it("conserva el aviso genérico si el preview no trajo frases", () => {
    expect(timbradoValidationToast([])).toEqual({
      title: "Completa los datos fiscales señalados",
    });
  });
});
