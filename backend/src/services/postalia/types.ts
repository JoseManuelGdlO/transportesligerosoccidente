export type PostaliaColonia = {
  nombre: string;
  tipo: string;
};

export type PostaliaCodigoPostalResponse = {
  codigo_postal: string;
  estado: string;
  municipio: string;
  ciudad: string;
  zona: string;
  colonias: PostaliaColonia[];
};

export type UbicacionDomicilioInput = {
  cp: string;
  colonia?: string | null;
  colonia_clave?: string | null;
  localidad?: string | null;
  localidad_clave?: string | null;
  municipio?: string | null;
  municipio_clave?: string | null;
  estado?: string | null;
  pais?: string | null;
};

export type ResolvedDomicilioSat = {
  colonia?: string;
  colonia_clave?: string;
  localidad?: string;
  localidad_clave?: string;
  municipio?: string;
  municipio_clave?: string;
  estado?: string;
  pais?: string;
  issues: string[];
};
