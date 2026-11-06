import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MODALIDAD_COBRO_LABEL,
  MODALIDADES_COBRO,
  type ModalidadCobro,
} from "@/lib/modalidadCobro";

export function ModalidadCobroSelect({
  value,
  onChange,
  includeTodas,
}: {
  value: string;
  onChange: (value: string) => void;
  includeTodas?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {includeTodas ? <SelectItem value="todos">Todas</SelectItem> : null}
        {MODALIDADES_COBRO.map((m) => (
          <SelectItem key={m} value={m}>
            {MODALIDAD_COBRO_LABEL[m as ModalidadCobro]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
