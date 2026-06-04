# Carta Porte (SAT)

Documentación del módulo fiscal **Carta Porte 3.1** en Transportes Ligeros de Occidente. Describe el estado actual del código (no es guía de cumplimiento SAT ni manual de contador).

## Resumen

Cada **viaje** puede tener una carta porte asociada (relación 1:1). El flujo permite:

1. Configurar datos fiscales de la empresa y CSD.
2. Capturar ubicaciones y mercancías del viaje según el complemento Carta Porte.
3. Validar requisitos y generar un XML de CFDI tipo traslado (`TipoDeComprobante="T"`).
4. **Timbrar** mediante un proveedor PAC (hoy solo implementación **stub** para desarrollo).

La UI vive en la pestaña **Carta Porte** del detalle de viaje. La configuración del emisor está en **Empresa → Datos fiscales**.

## Activación

| Control | Ubicación | Comportamiento |
|---------|-----------|----------------|
| Feature flag | `frontend/src/config/features.ts` → `FEATURE_CARTA_PORTE` | Si es `false`, no se muestra la pestaña |
| Permiso | `cartaporte.ver` | Requerido para ver la pestaña |
| API | Rutas bajo `/api/v1/trips/:id/carta-porte` | Siempre registradas; protegidas por JWT y permisos |

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend                                                         │
│  Empresa.tsx          → /tenant/fiscal, /tenant/fiscal/csd       │
│  ViajeDetalle.tsx     → pestaña Carta Porte (si flag + permiso)  │
│  TripCartaPorte.tsx   → formularios, validar, timbrar            │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST /api/v1
┌───────────────────────────────▼─────────────────────────────────┐
│ Backend                                                          │
│  fiscalController     → configuración tenant + CSD               │
│  cartaPorteController → carta porte, ubicaciones, mercancías     │
│  cartaPorteService    → validación, XML, timbrado, cancelación   │
│  tripFiscalService    → CRUD ubicaciones/mercancías del viaje  │
│  pac/                 → proveedor PAC (stub por defecto)         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│ Base de datos                                                    │
│  cartas_porte, trip_ubicaciones, trip_mercancias                 │
│  + campos fiscales en tenants, clients, trucks, drivers          │
└─────────────────────────────────────────────────────────────────┘
```

### Archivos principales

| Área | Ruta |
|------|------|
| Servicio core | `backend/src/services/cartaPorteService.ts` |
| Datos fiscales del viaje | `backend/src/services/tripFiscalService.ts` |
| Controlador HTTP | `backend/src/controllers/cartaPorteController.ts` |
| Config. empresa | `backend/src/controllers/fiscalController.ts` |
| Modelo | `backend/src/models/CartaPorte.ts` |
| Rutas | `backend/src/routes/v1.ts` (bloque carta-porte y mercancías) |
| UI viaje | `frontend/src/components/tlo/TripCartaPorte.tsx` |
| Tipos | `frontend/src/types/tlo.ts` (`CartaPorteRecord`, `TripUbicacion`, …) |
| PAC | `backend/src/services/pac/` (ver también `pac/README.md`) |

### Migraciones

- `backend/src/migrations/20250518120000-fiscal-carta-porte.js` — tablas y columnas fiscales base.
- `backend/src/migrations/20250528120000-carta-porte-field-extensions.js` — `id_ccp`, `transporte_internacional`, `id_ubicacion_sat`, etc.
- `backend/src/migrations/20250601000000-routes-and-trip-stops.js` — campo `orden` en `trip_ubicaciones` y soporte multi-parada.

### Permisos (seeder)

`backend/src/seeders/20250518120001-seed-carta-porte-permissions.js`

| Slug | Uso |
|------|-----|
| `cartaporte.ver` | Ver pestaña y registro; listar mercancías |
| `cartaporte.timbrar` | Validar (preview) y timbrar |
| `cartaporte.cancelar` | Cancelar CFDI timbrado (solo API hoy) |
| `fiscal.configurar` | Editar datos fiscales y subir CSD en Empresa |

El rol `admin` recibe estos permisos al ejecutar el seeder.

---

## Modelo de datos

### Tabla `cartas_porte`

Un registro por viaje (`trip_id` único).

| Campo | Descripción |
|-------|-------------|
| `estatus` | `borrador` \| `timbrada` \| `cancelada` \| `error` |
| `uuid` | UUID del timbre (tras timbrar) |
| `serie`, `folio_cfdi` | Serie/folio CFDI |
| `xml_timbrado` | XML timbrado (texto en BD) |
| `pdf_path` | Reservado; no se genera PDF fiscal automático en el flujo actual |
| `pac_proveedor`, `pac_response` | Proveedor y respuesta del PAC |
| `error_mensaje` | Último error de timbrado |
| `timbrado_at` | Fecha de timbrado |
| `id_ccp` | Identificador del complemento Carta Porte |
| `transporte_internacional` | `true` si el viaje es foráneo o se marca explícitamente |

Al primer `GET /trips/:id/carta-porte` se crea un borrador si no existe (`getOrCreateCartaPorte`).

### Tabla `trip_ubicaciones`

Cadena ordenada de paradas fiscales (`orden` 1 = origen, 2…N = destinos/entregas).

Campos relevantes: domicilio (calle, CP, estado, país, …), `fecha_hora`, `distancia_km` (obligatoria en destinos salvo origen), `id_ubicacion_sat`, `client_ubicacion_id`.

Si el viaje tiene **paradas** (`trip_stops`), `ensureUbicacionesFromClient` sincroniza ubicaciones desde esas paradas. Si no, se prefieren direcciones del **cliente** y textos `origen`/`destino` del viaje.

### Tabla `trip_mercancias`

Mercancías transportadas: descripción, cantidad, unidad (default `H87`), `peso_kg`, `clave_prod_serv`, `material_peligroso`, `cantidad_transportada`, etc.

### Catálogos extendidos (migración fiscal)

- **Tenant**: RFC, razón social, régimen, CP fiscal, CSD (rutas cifradas), `cfdi_serie`, datos PAC.
- **Client**: domicilio fiscal para receptor en XML.
- **Truck**: `config_vehicular`, permiso SCT, peso bruto, aseguradora/póliza RC.
- **Driver**: RFC, `licencia_federal`, `tipo_figura` (default `01`).

---

## API REST

Base: `/api/v1`. Todas requieren `Authorization: Bearer <token>`.

### Carta porte del viaje

| Método | Ruta | Permiso |
|--------|------|---------|
| `GET` | `/trips/:id/carta-porte` | `cartaporte.ver` |
| `POST` | `/trips/:id/carta-porte/preview` | `cartaporte.timbrar` |
| `POST` | `/trips/:id/carta-porte/timbrar` | `cartaporte.timbrar` |
| `POST` | `/trips/:id/carta-porte/cancelar` | `cartaporte.cancelar` |

**Preview** — respuesta ejemplo:

```json
{
  "valid": true,
  "issues": [],
  "xml_preview": "<?xml ...",
  "carta_porte": { "id": "...", "estatus": "borrador", ... }
}
```

**Cancelar** — body: `{ "motivo": "texto obligatorio" }`. Solo si `estatus === "timbrada"` y hay `uuid`.

### Ubicaciones y mercancías

| Método | Ruta | Permiso |
|--------|------|---------|
| `PUT` | `/trips/:id/carta-porte/ubicacion-origen` | `viajes.crear` |
| `PUT` | `/trips/:id/carta-porte/ubicacion-destino` | `viajes.crear` |
| `PUT` | `/trips/:id/carta-porte/ubicaciones` | `viajes.crear` |
| `GET` | `/trips/:id/mercancias` | `cartaporte.ver` |
| `POST` | `/trips/:id/mercancias` | `viajes.crear` |
| `DELETE` | `/trips/:id/mercancias/:mercanciaId` | `viajes.crear` |

`PUT .../ubicaciones` espera `{ "ubicaciones": [ { "orden": 1, ... }, ... ] }` con al menos 2 elementos.

### Configuración fiscal (empresa)

| Método | Ruta | Permiso |
|--------|------|---------|
| `GET` | `/tenant/fiscal` | `fiscal.configurar` o `cartaporte.ver` |
| `PATCH` | `/tenant/fiscal` | `fiscal.configurar` |
| `POST` | `/tenant/fiscal/csd` | `fiscal.configurar` (multipart: `.cer`, `.key`, contraseña) |

El viaje en `GET /trips/:id` incluye anidados `carta_porte`, `ubicaciones` y `mercancias` cuando existen.

---

## Flujo de negocio

### 1. Preparación (antes de timbrar)

1. En **Empresa**, cargar RFC, régimen, CP fiscal, serie CFDI y certificados **CSD** (`.cer` + `.key` + contraseña).
2. En catálogos, completar datos fiscales de **cliente**, **camión** y **operador** asignados al viaje.
3. En el viaje, estado **`en_curso`** o **`cerrado`** (otros estados fallan validación).
4. En la pestaña Carta Porte: guardar **ubicaciones** (origen, paradas intermedias si aplica, destino con distancias en km) y al menos una **mercancía**.

### 2. Validar

`POST .../preview` ejecuta `validateCartaPorteData`. Si hay problemas, devuelve `valid: false` e `issues` (lista en español). Si todo OK, genera `xml_preview` (sin timbrar).

### 3. Timbrar

`POST .../timbrar`:

1. Repite validación y construcción de XML (`buildCartaPorteXml`).
2. Llama al PAC (`getPacProvider`).
3. Guarda XML en disco: `{UPLOAD_DIR}/{tenantId}/cartas-porte/{tripId}.xml`.
4. Actualiza registro: `estatus: timbrada`, `uuid`, `xml_timbrado`, `timbrado_at`, etc.

Si falla el PAC: `estatus: error` y `error_mensaje`; respuesta HTTP 502.

### 4. Cancelar

Solo vía API con permiso `cartaporte.cancelar`. El PAC stub no hace llamada real. **No hay botón de cancelación en el frontend** en la versión actual.

### Reglas cruzadas

- No se pueden modificar **paradas del viaje** si la carta porte ya está **timbrada** (`tripStopService.assertParadasEditable`).
- No se puede timbrar dos veces si ya está `timbrada`.
- Edición de ubicaciones/mercancías en UI requiere viaje abierto (`tripIsOpen`) y permiso `viajes.crear`.

---

## Validaciones (`validateCartaPorteData`)

Mensajes típicos que aparecen en preview:

**Empresa**

- RFC, razón social, régimen fiscal, CP fiscal configurados.
- Certificados CSD cargados (`csd_cer_path`, `csd_key_path`).

**Ubicaciones**

- Al menos 2 ubicaciones (origen + destino).
- CP y estado en origen y en cada destino.
- `distancia_km` en cada destino (no en origen).

**Mercancías**

- Al menos una mercancía.

**Camión**

- `config_vehicular`, `perm_sct`, `num_permiso_sct`, `peso_bruto_vehicular`.
- Aseguradora y póliza de responsabilidad civil (no `NA`).

**Operador**

- Asignado, con RFC y licencia federal o licencia.

**Viaje**

- Estado `en_curso` o `cerrado`.

---

## Generación de XML

Implementado en `buildCartaPorteXml` (`cartaPorteService.ts`):

- CFDI **4.0**, `TipoDeComprobante="T"`, moneda `XXX`, totales en cero.
- Complemento **CartaPorte 3.1** (`xmlns:cartaporte31`).
- Ubicaciones tipo Origen/Destino con domicilios y distancias.
- Mercancías con `CantidadTransportada` entre IDs de origen y destino final.
- `FiguraTransporte` (operador) y `AutotransporteFederal` (unidad y seguros).
- `IdCCP` estable por registro; `TranspInternac` según viaje foráneo o flag.

El folio CFDI usa `folio_cfdi` del registro o dígitos derivados del folio operativo del viaje.

---

## Integración PAC

Ver `backend/src/services/pac/README.md`.

| Variable / campo | Efecto |
|----------------|--------|
| `PAC_PROVIDER=stub` (default) | Simula timbrado; inserta nodo de timbre ficticio en el XML |
| `tenant.pac_proveedor` | Override por empresa |
| `FISCAL_ENC_KEY` | Cifrado de contraseña CSD y token PAC en `.env` |

Proveedores reales (Facturama, SW Sapien, Finkok, …) están **pendientes**; solo existe `StubPacProvider` en `pac/index.ts`.

---

## Interfaz de usuario

### Empresa (`frontend/src/pages/tlo/Empresa.tsx`)

Sección **Datos fiscales (Carta Porte)** con permiso `fiscal.configurar`.

### Detalle de viaje

Pestaña **Carta Porte** → componente `TripCartaPorte`:

- Estado, IdCCP, UUID, errores.
- Botones **Validar datos** y **Timbrar** (si `cartaporte.timbrar`).
- Formularios origen / paradas / destino (catálogo de ubicaciones del cliente).
- Alta y baja de mercancías.
- Tarjetas de solo lectura para operador y camión.

### PDF operativo del viaje

`frontend/src/lib/pdfRender.ts` puede mostrar serie/folio de carta porte y una sección de ubicaciones; **no** sustituye al XML/PDF fiscal del SAT.

---

## Variables de entorno relevantes

| Variable | Descripción |
|----------|-------------|
| `PAC_PROVIDER` | Proveedor PAC (`stub` por defecto) |
| `FISCAL_ENC_KEY` | Clave para cifrar secretos fiscales |
| `UPLOAD_DIR` | Raíz de uploads; XML timbrado en `{UPLOAD_DIR}/{tenantId}/cartas-porte/` |

---

## Pendientes y limitaciones conocidas

Documentados también en `backend/src/services/pac/README.md`:

1. **Tipo de CFDI**: definir con contador si es traslado independiente o complemento en factura de ingreso.
2. **PAC productivo**: implementar adaptador real en `pac/index.ts`.
3. **Ambiente SAT**: certificados de prueba vs producción.
4. **Catálogos SAT**: validación estricta de claves (`c_ClaveProdServ`, `c_ConfigAutotransporte`, …).
5. **Cancelación en UI**: permiso y endpoint existen; falta pantalla.
6. **PDF fiscal del CFDI**: campo `pdf_path` sin flujo automático.
7. **Timbrado real**: el stub no valida ante el SAT; solo sirve para probar el flujo de la aplicación.

---

## Referencia rápida de estatus

| `estatus` | Significado |
|-----------|-------------|
| `borrador` | Creada, sin timbrar (o reintento tras error si se corrigen datos) |
| `timbrada` | Timbrado exitoso; UUID y XML guardados |
| `cancelada` | Cancelada vía PAC (API) |
| `error` | Falló el último intento de timbrado; ver `error_mensaje` |

---

*Última revisión según el código del repositorio. Actualizar este documento cuando se integre un PAC real o cambien rutas/validaciones.*
