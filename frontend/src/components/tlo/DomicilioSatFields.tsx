import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SatUbicacionCombobox } from "@/components/tlo/SatUbicacionCombobox";
import { cn } from "@/lib/utils";

export type DomicilioSatValue = {
  calle?: string;
  numero_exterior?: string;
  numero_interior?: string;
  colonia?: string;
  colonia_clave?: string;
  localidad?: string;
  localidad_clave?: string;
  municipio?: string;
  municipio_clave?: string;
  estado?: string;
  cp?: string;
  pais?: string;
};

type Props = {
  value: DomicilioSatValue;
  onChange: (patch: Partial<DomicilioSatValue>) => void;
  idPrefix?: string;
  cpError?: string;
  estadoError?: string;
  paisError?: string;
  onClearCpError?: () => void;
  onClearEstadoError?: () => void;
  onClearPaisError?: () => void;
  requiredFields?: Partial<Record<"estado" | "cp" | "pais", boolean>>;
};

export function DomicilioSatFields({
  value,
  onChange,
  idPrefix = "",
  cpError,
  estadoError,
  paisError,
  onClearCpError,
  onClearEstadoError,
  onClearPaisError,
  requiredFields,
}: Props) {
  const id = (name: string) => (idPrefix ? `${idPrefix}_${name}` : name);
  const estado = value.estado ?? "";
  const cp = value.cp ?? "";

  const patchAddress = (p: Partial<DomicilioSatValue>) => {
    if (p.estado != null && p.estado !== estado) {
      onChange({
        localidad: undefined,
        localidad_clave: undefined,
        municipio: undefined,
        municipio_clave: undefined,
        ...p,
      });
      return;
    }
    if (p.cp != null && p.cp !== cp) {
      onChange({
        ...p,
        colonia: undefined,
        colonia_clave: undefined,
      });
      return;
    }
    onChange(p);
  };

  return (
    <>
      <div>
        <Label htmlFor={id("calle")}>Calle</Label>
        <Input
          id={id("calle")}
          value={value.calle ?? ""}
          onChange={(e) => patchAddress({ calle: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={id("numero_exterior")}>No. exterior</Label>
          <Input
            id={id("numero_exterior")}
            value={value.numero_exterior ?? ""}
            onChange={(e) => patchAddress({ numero_exterior: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor={id("numero_interior")}>No. interior</Label>
          <Input
            id={id("numero_interior")}
            value={value.numero_interior ?? ""}
            onChange={(e) => patchAddress({ numero_interior: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor={id("estado")}>
            Estado (clave SAT)
            {requiredFields?.estado && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <SatUbicacionCombobox
            kind="estado"
            value={estado}
            estadoMunicipioHint={
              value.municipio_clave && value.municipio
                ? { municipio_clave: value.municipio_clave, municipio: value.municipio }
                : undefined
            }
            onSelect={(item) => {
              patchAddress({
                estado: item.clave,
                ...(item.municipio_clave
                  ? {
                      municipio_clave: item.municipio_clave,
                      municipio: item.municipio ?? item.descripcion,
                    }
                  : {}),
              });
              onClearEstadoError?.();
            }}
            onClear={() => patchAddress({ estado: "" })}
            className={cn(estadoError && "border-destructive")}
          />
          {estadoError && <p className="text-sm text-destructive mt-1">{estadoError}</p>}
        </div>
        <div>
          <Label htmlFor={id("cp")}>
            C.P.
            {requiredFields?.cp && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            id={id("cp")}
            value={cp}
            onChange={(e) => {
              patchAddress({ cp: e.target.value });
              onClearCpError?.();
            }}
            maxLength={5}
            aria-invalid={!!cpError}
            className={cn(cpError && "border-destructive")}
          />
          {cpError && <p className="text-sm text-destructive mt-1">{cpError}</p>}
        </div>
        <div>
          <Label htmlFor={id("municipio")}>Municipio</Label>
          <SatUbicacionCombobox
            kind="municipio"
            value={value.municipio_clave ?? ""}
            estado={estado}
            onSelect={(item) =>
              patchAddress({ municipio_clave: item.clave, municipio: item.descripcion })
            }
            onClear={() => patchAddress({ municipio_clave: undefined, municipio: undefined })}
          />
        </div>
        <div>
          <Label htmlFor={id("localidad")}>Localidad</Label>
          <SatUbicacionCombobox
            kind="localidad"
            value={value.localidad_clave ?? ""}
            estado={estado}
            onSelect={(item) =>
              patchAddress({ localidad_clave: item.clave, localidad: item.descripcion })
            }
            onClear={() => patchAddress({ localidad_clave: undefined, localidad: undefined })}
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor={id("colonia")}>Colonia</Label>
          <SatUbicacionCombobox
            kind="colonia"
            value={value.colonia_clave ?? ""}
            cp={cp}
            onSelect={(item) =>
              patchAddress({ colonia_clave: item.clave, colonia: item.descripcion })
            }
            onClear={() => patchAddress({ colonia_clave: undefined, colonia: undefined })}
          />
        </div>
        <div>
          <Label htmlFor={id("pais")}>
            País
            {requiredFields?.pais && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            id={id("pais")}
            value={value.pais ?? "MEX"}
            onChange={(e) => {
              patchAddress({ pais: e.target.value });
              onClearPaisError?.();
            }}
            maxLength={3}
            aria-invalid={!!paisError}
            className={cn(paisError && "border-destructive")}
          />
          {paisError && <p className="text-sm text-destructive mt-1">{paisError}</p>}
        </div>
      </div>
    </>
  );
}
