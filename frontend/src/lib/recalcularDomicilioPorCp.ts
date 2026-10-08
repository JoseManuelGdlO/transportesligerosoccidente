import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { lookupDomicilioPorCp, lookupSatColonia } from "@/lib/tloApi";
import type { DomicilioPorCp } from "@/types/tlo";

export const CLEARED_SAT_DOMICILIO = {
  estado: "",
  municipio: "",
  municipio_clave: "",
  localidad: "",
  localidad_clave: "",
  colonia: "",
  colonia_clave: "",
};

export type SatDomicilioPatch = {
  cp: string;
  estado: string;
  municipio: string;
  municipio_clave: string;
  localidad: string;
  localidad_clave: string;
  colonia: string;
  colonia_clave: string;
  pais: string;
};

export function satPatchFromCpLookup(cp: string, dom: DomicilioPorCp | null): SatDomicilioPatch {
  return {
    cp,
    estado: dom?.estado ?? "",
    municipio: dom?.municipio ?? "",
    municipio_clave: dom?.municipio_clave ?? "",
    localidad: dom?.localidad ?? "",
    localidad_clave: dom?.localidad_clave ?? "",
    colonia: dom?.colonia ?? "",
    colonia_clave: dom?.colonia_clave ?? "",
    pais: dom?.pais || "MEX",
  };
}

/**
 * Si el CP de 5 dígitos no corresponde a la colonia SAT guardada, vuelve a
 * resolver estado, municipio, localidad y colonia.
 */
export function useRecalcularDomicilioPorCp(
  cp: string,
  coloniaClave: string,
  onResolved: (patch: SatDomicilioPatch) => void,
) {
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;
  const checkedKey = useRef("");

  useEffect(() => {
    const cpNorm = cp.trim();
    const clave = coloniaClave.trim();
    if (!/^\d{5}$/.test(cpNorm)) {
      checkedKey.current = "";
      return;
    }

    const key = `${cpNorm}|${clave}`;
    if (checkedKey.current === key) return;

    let cancelled = false;
    void (async () => {
      try {
        if (clave) {
          let row = null;
          try {
            row = await lookupSatColonia(cpNorm, clave);
          } catch {
            if (!cancelled) checkedKey.current = key;
            return;
          }
          if (cancelled) return;
          if (row) {
            checkedKey.current = key;
            return;
          }
        }
        const dom = await lookupDomicilioPorCp(cpNorm);
        if (cancelled) return;
        if (!dom) {
          checkedKey.current = key;
          toast.error("No se encontró domicilio SAT para el C.P.");
          return;
        }
        const patch = satPatchFromCpLookup(cpNorm, dom);
        checkedKey.current = `${cpNorm}|${patch.colonia_clave.trim()}`;
        onResolvedRef.current(patch);
      } catch (e) {
        if (cancelled) return;
        checkedKey.current = key;
        toast.error(e instanceof Error ? e.message : "No se pudo actualizar el domicilio con el C.P.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cp, coloniaClave]);
}
