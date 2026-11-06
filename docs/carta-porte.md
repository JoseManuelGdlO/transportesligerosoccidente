# Carta Porte (SAT)

Documentación del módulo fiscal **Carta Porte 3.1** en Transportes Ligeros de Occidente. Describe el estado actual del código (no es guía de cumplimiento SAT ni manual de contador).

## Resumen

Cada **viaje** puede tener **una o más** cartas porte (`cartas_porte`). Cada carta se timbra, cancela y cobra por separado. El flujo permite:

1. Configurar datos fiscales de la empresa y CSD.
2. Capturar ubicaciones y mercancías del viaje según el complemento Carta Porte (autoguardado en la pestaña).
3. Pulsar **Timbrar**: el sistema valida requisitos (`POST preview`) y, si todo está correcto, genera el XML y timbra mediante un proveedor PAC (hoy solo implementación **stub** para desarrollo).
4. Si faltan datos, se muestran en pantalla y el usuario puede completarlos en la misma pestaña antes de volver a timbrar.

La UI vive en la pestaña **Carta Porte** del detalle de viaje. La configuración del emisor está en **Empresa → Datos fiscales**.

## Activación

| Control | Ubicación | Comportamiento |
|---------|-----------|----------------|
| Feature flag | `frontend/src/config/features.ts` → `FEATURE_CARTA_PORTE` | Si es `false`, no se muestra la pestaña |
| Permiso | `cartaporte.ver` | Requerido para ver la pestaña |
| API | Rutas bajo `/api/v1/trips/:id/cartas-porte` y `/api/v1/trips/:id/carta-porte` | Siempre registradas; protegidas por JWT y permisos |

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend                                                         │
│  Empresa.tsx          → /tenant/fiscal, /tenant/fiscal/csd       │
│  ViajeDetalle.tsx     → pestaña Carta Porte (si flag + permiso)  │
│  TripCartaPorte.tsx   → formularios, timbrar (valida antes)    │
│  cartaPorteIssues.ts  → mapeo issues → resaltado en UI         │
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
| Mapeo de validación UI | `frontend/src/lib/cartaPorteIssues.ts` |
| Tipos | `frontend/src/types/tlo.ts` (`CartaPorteRecord`, `TripUbicacion`, …) |
| PAC | `backend/src/services/pac/` (ver también `pac/README.md`) |

### Migraciones

- `backend/src/migrations/20250518120000-fiscal-carta-porte.js` — tablas y columnas fiscales base.
- `backend/src/migrations/20250528120000-carta-porte-field-extensions.js` — `id_ccp`, `transporte_internacional`, `id_ubicacion_sat`, etc.
- `backend/src/migrations/20250601000000-routes-and-trip-stops.js` — campo `orden` en `trip_ubicaciones` y soporte multi-parada.
- `backend/src/migrations/20261106120000-cartas-porte-multi.js` — varias cartas por viaje, `cfdi_conceptos` en la carta y CXC por `carta_porte_id`.

### Permisos (seeder)

`backend/src/seeders/20250518120001-seed-carta-porte-permissions.js`

| Slug | Uso |
|------|-----|
| `cartaporte.ver` | Ver pestaña y registro; listar mercancías |
| `cartaporte.timbrar` | Timbrar (incluye preview automático en UI) |
| `cartaporte.cancelar` | Cancelar CFDI timbrado (solo API hoy) |
| `fiscal.configurar` | Editar datos fiscales y subir CSD en Empresa |

El rol `admin` recibe estos permisos al ejecutar el seeder.

---

## Modelo de datos

### Tabla `cartas_porte`

Un viaje tiene **una o más** filas en `cartas_porte` (índice no único `cartas_porte_tenant_trip_idx` sobre `tenant_id` + `trip_id`). Por carta van `id_ccp`, folio, UUID, XML, PDF, conceptos CFDI (`cfdi_conceptos`) y la CXC (`account_documents.carta_porte_id`). Las **ubicaciones** y **mercancías** pertenecen al viaje (se comparten entre facturas) y se **bloquean** cuando cualquier carta está `timbrada`.

Cada carta nueva nace en `borrador` con un `id_ccp` distinto (`randomUUID()`). No se reutiliza el `id_ccp` de otra fila. El complemento Carta Porte de todas las facturas del viaje describe el mismo traslado.

| Campo | Descripción |
|-------|-------------|
| `estatus` | `borrador` \| `timbrada` \| `cancelada` \| `error` |
| `uuid` | UUID del timbre (tras timbrar); propio de esa fila |
| `serie`, `folio_cfdi` | Serie/folio CFDI; dos cartas del mismo viaje no pueden reservar el mismo folio |
| `xml_timbrado` | XML timbrado (texto en BD) |
| `pdf_path` | PDF fiscal de esa carta (archivo `{cartaId}.pdf`; legado `{tripId}.pdf`) |
| `cfdi_conceptos` | Conceptos de ingreso de **esta** factura (JSON); no se copian a otra carta |
| `pac_proveedor`, `pac_response` | Proveedor y respuesta del PAC |
| `error_mensaje` | Último error de timbrado |
| `timbrado_at` | Fecha de timbrado |
| `id_ccp` | Identificador del complemento Carta Porte (único por fila) |
| `transporte_internacional` | `true` si el viaje es foráneo o se marca explícitamente |

Al primer `GET /trips/:id/carta-porte` se crea un borrador si no existe ninguna (`getOrCreateCartaPorte`). `GET /trips/:id` anida `cartas_porte` (todas) y `carta_porte` (la visible: `cartaVisible`, en general el borrador/`error` más reciente).

### Tabla `trip_ubicaciones`

Cadena ordenada de paradas fiscales (`orden` 1 = origen, 2…N = destinos/entregas).

Campos relevantes: domicilio (calle, CP, estado, país, …), `fecha_hora`, `distancia_km` (obligatoria en destinos salvo origen), `id_ubicacion_sat`, `client_ubicacion_id`.

Si el viaje tiene **paradas** (`trip_stops`), `ensureUbicacionesFromClient` sincroniza ubicaciones desde esas paradas. Si no, se prefieren direcciones del **cliente** y textos `origen`/`destino` del viaje.

### Tabla `trip_mercancias`

Mercancías transportadas: descripción, cantidad, unidad (default `H87`), `peso_kg`, `clave_prod_serv` (**obligatoria**, catálogo `c_ClaveProdServCP`), `material_peligroso`, `cantidad_transportada`, etc.

Default de UI y fallback de backend (`DEFAULT_CLAVE_BIENES_TRANSP` / `DEFAULT_BIENES_TRANSP_CP`): **`30102404`** (Varilla corrugada), el producto más usado en operación TLO. Si la mercancía no trae clave al armar el payload Sicofi, se usa ese valor.

La clave `clave_prod_serv` debe existir en la tabla global `sat_claves_productos`, importada desde el Excel oficial del SAT (hoja `c_ClaveProdServCP`). Según la columna **Material peligroso** del catálogo:

| Valor SAT | Comportamiento en UI |
|-----------|----------------------|
| `0` | No se muestra el checkbox; no se envía `materialpeligroso` en el payload Sicofi |
| `1` | Checkbox marcado y no editable; Sicofi recibe `materialpeligroso: "Sí"` |
| `0,1` | Checkbox visible y editable; Sicofi recibe `"Sí"` o `"No"` según el usuario |

### Tabla `sat_claves_productos`

Catálogo global (sin `tenant_id`) con columnas: `clave` (PK, 8 dígitos), `descripcion`, `palabras_similares`, `material_peligroso` (`0` / `1` / `0,1`), vigencia y metadatos de importación.

Importación (después de migrar):

```bash
cd backend
npm run db:migrate
npm run db:import:sat-claves -- /ruta/CatalogosCartaPorte31.xls
npm run db:import:sat-ubicaciones -- /ruta/CatalogosCartaPorte31.xls
```

### Tablas `sat_municipios`, `sat_localidades`, `sat_colonias`

Catálogos globales de domicilio SAT importados desde las hojas `c_Municipio`, `c_Localidad` y `c_Colonia_1/2/3` del mismo Excel. Las claves se guardan en `colonia_clave`, `municipio_clave` y `localidad_clave` en clientes y ubicaciones de cliente.

API de búsqueda (requiere `cartaporte.ver`):

- `GET /sat/municipios?q=&estado=BCN`
- `GET /sat/localidades?q=&estado=BCN`
- `GET /sat/colonias?q=&cp=21482`

### Catálogos extendidos (migración fiscal)

- **Tenant**: RFC, razón social, régimen, CP fiscal, CSD (rutas cifradas), `cfdi_serie`, datos PAC.
- **Client**: domicilio fiscal para receptor en XML.
- **Truck**: `config_vehicular`, permiso SCT, peso bruto, aseguradora/póliza RC.
- **Driver**: RFC, `licencia_federal`, `tipo_figura` (default `01`).

---

## API REST

Base: `/api/v1`. Todas requieren `Authorization: Bearer <token>`.

### Cartas porte del viaje

| Método | Ruta | Permiso |
|--------|------|---------|
| `GET` | `/trips/:id/cartas-porte` | `cartaporte.ver` |
| `POST` | `/trips/:id/cartas-porte` | `cartaporte.timbrar` |
| `PUT` | `/trips/:id/cartas-porte/:cartaId/conceptos` | `cartaporte.timbrar` |
| `GET` | `/trips/:id/cartas-porte/:cartaId/xml` | `cartaporte.ver` |
| `GET` | `/trips/:id/cartas-porte/:cartaId/pdf` | `cartaporte.ver` |
| `POST` | `/trips/:id/cartas-porte/:cartaId/preview` | `cartaporte.timbrar` |
| `POST` | `/trips/:id/cartas-porte/:cartaId/timbrar` | `cartaporte.timbrar` |
| `PATCH` | `/trips/:id/cartas-porte/:cartaId/folio` | `cartaporte.timbrar` |
| `PATCH` | `/trips/:id/cartas-porte/:cartaId/comentarios` | `cartaporte.timbrar` |
| `POST` | `/trips/:id/cartas-porte/:cartaId/cancelar` | `cartaporte.cancelar` |

`GET` lista las cartas del viaje. `POST` crea otra en `borrador` con `id_ccp` nuevo; no desarma un viaje ya timbrado (ubicaciones y mercancías siguen iguales). Timbrado, preview, folio, comentarios, cancelar, XML y PDF van por `:cartaId`.

### Carta visible (rutas legacy)

Las rutas `/trips/:id/carta-porte/...` **siguen activas** y operan sobre la carta visible (`cartaVisible`), para no romper clientes antiguos.

| Método | Ruta | Permiso |
|--------|------|---------|
| `GET` | `/trips/:id/carta-porte` | `cartaporte.ver` |
| `GET` | `/trips/:id/carta-porte/xml` | `cartaporte.ver` |
| `GET` | `/trips/:id/carta-porte/pdf` | `cartaporte.ver` |
| `POST` | `/trips/:id/carta-porte/preview` | `cartaporte.timbrar` |
| `POST` | `/trips/:id/carta-porte/timbrar` | `cartaporte.timbrar` |
| `PATCH` | `/trips/:id/carta-porte/folio` | `cartaporte.timbrar` |
| `PATCH` | `/trips/:id/carta-porte/comentarios` | `cartaporte.timbrar` |
| `POST` | `/trips/:id/carta-porte/cancelar` | `cartaporte.cancelar` |

**Descargar XML** — respuesta `application/xml` con `Content-Disposition: attachment`. Solo si `estatus` es `timbrada` o `cancelada` y existe XML (archivo en `{UPLOAD_DIR}/{tenantId}/cartas-porte/{cartaId}.xml`, legado `{tripId}.xml`, o columna `xml_timbrado`). Nombre sugerido: `{serie}-{folio}.xml`.

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
| `PUT` | `/trips/:id/carta-porte/ubicacion-origen` | `viajes.crear` o `cartaporte.timbrar` |
| `PUT` | `/trips/:id/carta-porte/ubicacion-destino` | `viajes.crear` o `cartaporte.timbrar` |
| `PUT` | `/trips/:id/carta-porte/ubicaciones` | `viajes.crear` o `cartaporte.timbrar` |
| `GET` | `/trips/:id/mercancias` | `cartaporte.ver` |
| `POST` | `/trips/:id/mercancias` | `viajes.crear` o `cartaporte.timbrar` |
| `DELETE` | `/trips/:id/mercancias/:mercanciaId` | `viajes.crear` o `cartaporte.timbrar` |

`PUT .../ubicaciones` espera `{ "ubicaciones": [ { "orden": 1, ... }, ... ] }` con al menos 2 elementos.

### Catálogo SAT c_ClaveProdServCP

| Método | Ruta | Permiso |
|--------|------|---------|
| `GET` | `/sat/claves-productos?q=botana&limit=20` | `cartaporte.ver` |
| `GET` | `/sat/claves-productos/:clave` | `cartaporte.ver` |

La búsqueda admite prefijo numérico de clave o texto en descripción/palabras similares. El lookup por clave devuelve `404` si no existe en el catálogo importado.

### Configuración fiscal (empresa)

| Método | Ruta | Permiso |
|--------|------|---------|
| `GET` | `/tenant/fiscal` | `fiscal.configurar` o `cartaporte.ver` |
| `PATCH` | `/tenant/fiscal` | `fiscal.configurar` |
| `POST` | `/tenant/fiscal/csd` | `fiscal.configurar` (multipart: `.cer`, `.key`, contraseña) |

El viaje en `GET /trips/:id` incluye anidados `cartas_porte` (arreglo), `carta_porte` (visible), `ubicaciones` y `mercancias` cuando existen.

---

## Flujo de negocio

### 1. Preparación (antes de timbrar)

1. En **Empresa**, cargar RFC, régimen, CP fiscal, serie CFDI y certificados **CSD** (`.cer` + `.key` + contraseña).
2. Completar datos fiscales de **cliente**, **camión** y **operador** (en catálogos o inline en la pestaña Carta Porte).
3. En el viaje, estado **`en_curso`** o **`cerrado`** (otros estados fallan validación).
4. En la pestaña Carta Porte: capturar **ubicaciones** (origen, paradas intermedias si aplica, destino con distancias en km; se autoguardan al salir del campo) y al menos una **mercancía**.

### 2. Timbrar (UI)

Al pulsar **Timbrar** en `TripCartaPorte`:

1. Se hace flush de ubicaciones pendientes en memoria.
2. `POST .../preview` ejecuta `validateCartaPorteData`.
3. Si `valid: false`: se muestran `issues`, se resaltan secciones/campos afectados y el usuario corrige en la misma pestaña.
4. Si `valid: true`: `POST .../timbrar` continúa el flujo de timbrado.
5. Tras timbrado exitoso, la UI descarga automáticamente el XML (`GET .../cartas-porte/:cartaId/xml`).
6. En una carta ya timbrada, el botón **XML** en la misma pestaña permite volver a descargar el archivo de esa carta.

### 3. Timbrar (backend)

`POST .../timbrar` (también invocable directamente por API):

1. Repite validación y construcción del payload (Sicofi JSON o preview XML legacy).
2. Llama al PAC (`getPacProvider`).
3. Guarda XML en disco: `{UPLOAD_DIR}/{tenantId}/cartas-porte/{cartaId}.xml` (lectura con fallback a `{tripId}.xml`).
4. Actualiza **esa** fila: `estatus: timbrada`, `uuid`, `xml_timbrado`, `timbrado_at`, etc. Otra carta del mismo viaje en `borrador` se puede timbrar aparte.

Si falla el PAC: `estatus: error` y `error_mensaje`; respuesta HTTP 502.

### 3b. Descargar XML

`GET .../cartas-porte/:cartaId/xml` (o la ruta legacy) devuelve el CFDI timbrado de esa carta. La UI usa `downloadCartaPorteXml` en `frontend/src/lib/tloApi.ts`.

`POST .../preview` sigue disponible como endpoint; la UI ya no expone un botón separado de validación.

### 4. Cancelar

Solo vía API con permiso `cartaporte.cancelar`. El PAC stub no hace llamada real. **No hay botón de cancelación en el frontend** en la versión actual.

### Reglas cruzadas

- No se pueden modificar **paradas, ubicaciones ni mercancías** del viaje si **cualquier** carta está **timbrada** (`algunaCartaTimbrada`). Crear otra factura no desarma el viaje.
- El candado de timbrado es **por carta**: no se puede timbrar de nuevo una fila ya `timbrada`; otra carta en `borrador` sí.
- Edición de ubicaciones/mercancías en UI requiere viaje **`en_curso` o `cerrado`**, ninguna carta `timbrada`, y permiso `viajes.crear` o `cartaporte.timbrar`.
- Edición fiscal inline de operador/camión en la pestaña requiere además `catalogos.editar` (PATCH a catálogos).

---

## Validaciones (`validateCartaPorteData`)

Mensajes típicos que aparecen en preview (y se usan en UI para resaltar campos vía `cartaPorteIssues.ts`):

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
- `IdCCP` estable por **fila** de carta; `TranspInternac` según viaje foráneo o flag.

El folio CFDI usa `folio_cfdi` de esa carta o dígitos derivados del folio operativo del viaje. `trip.tarifa` y `trip.num_factura` no se recalculan al timbrar una segunda carta.

---

## Integración PAC

Ver `backend/src/services/pac/README.md`.

| Variable / campo | Efecto |
|----------------|--------|
| `PAC_PROVIDER=stub` (default) | Simula timbrado; inserta nodo de timbre ficticio en el XML |
| `tenant.pac_proveedor` | Override por empresa |
| `tenant.pac_proveedor=sicofi` | Timbrado vía Sicofi Factura40 (auth híbrida: Basic → JWT Bearer); ver `docs/sicofi-factura40.md` |
| `FISCAL_ENC_KEY` | Cifrado de contraseña CSD y contraseña PAC Sicofi en `.env` |

Proveedores adicionales (Facturama, SW Sapien, Finkok, …) están **pendientes**; hoy existen `StubPacProvider` y `SicofiPacProvider` en `pac/index.ts`.

---

## Interfaz de usuario

### Empresa (`frontend/src/pages/tlo/Empresa.tsx`)

Sección **Datos fiscales (Carta Porte)** con permiso `fiscal.configurar`.

### Detalle de viaje

Pestaña **Carta Porte** → componente `TripCartaPorte`:

- Selector de cartas del viaje y botón **Nueva factura** (`POST /trips/:id/cartas-porte`) para un segundo CFDI (conceptos propios; mismo cliente, mismas ubicaciones y mercancías).
- Estado, IdCCP, UUID, errores de timbrado previo de la carta seleccionada.
- Un botón **Timbrar** (`cartaporte.timbrar`): valida con preview y timbra **esa** carta si los datos son correctos.
- Lista de `issues` y resaltado de campos/secciones tras validación fallida (scroll al primer error).
- Formularios origen / paradas / destino con **autoguardado** (debounce ~400 ms y al salir del campo); sin botones «Guardar origen/entrega».
- Catálogo de ubicaciones del cliente (select) cuando aplica.
- Alta (**Agregar**) y baja de mercancías.
- Tarjetas editables de operador y camión (campos fiscales SAT) con guardado al salir del campo; requieren `catalogos.editar`.
- Banner con enlace a **Empresa → Datos fiscales** cuando fallan validaciones de tenant/CSD.
- Ubicaciones y mercancías en solo lectura si **cualquier** carta ya está **timbrada**; la carta en `borrador` sigue pudiendo editar conceptos, folio y comentarios, y timbrarse.

### PDF operativo del viaje

`frontend/src/lib/pdfRender.ts` puede mostrar serie/folio de carta porte y una sección de ubicaciones; **no** sustituye al XML/PDF fiscal del SAT.

---

## Variables de entorno relevantes

| Variable | Descripción |
|----------|-------------|
| `PAC_PROVIDER` | Proveedor PAC (`stub` por defecto) |
| `FISCAL_ENC_KEY` | Clave para cifrar secretos fiscales |
| `UPLOAD_DIR` | Raíz de uploads; XML/PDF por carta en `{UPLOAD_DIR}/{tenantId}/cartas-porte/{cartaId}.*` |

---

## Pendientes y limitaciones conocidas

Documentados también en `backend/src/services/pac/README.md`:

1. **Tipo de CFDI**: definir con contador si es traslado independiente o complemento en factura de ingreso.
2. **PAC productivo**: implementar adaptador real en `pac/index.ts`.
3. **Ambiente SAT**: certificados de prueba vs producción.
4. **Catálogos SAT**: tabla `sat_claves_productos` importada desde Excel oficial (`npm run db:import:sat-claves`); validación de `c_ClaveProdServCP` y coherencia de material peligroso; además `c_ConfigAutotransporte`, permisos SCT, etc.
5. **Cancelación en UI**: permiso y endpoint existen; falta pantalla.
6. **PDF fiscal del CFDI**: campo `pdf_path` sin flujo automático.
7. **Timbrado real**: el stub no valida ante el SAT; solo sirve para probar el flujo de la aplicación.
8. **Varias facturas, mismo traslado**: no se parten mercancías ni ubicaciones entre cartas; el receptor es el cliente del viaje en todas. El SAT puede observar un traslado duplicado; es el comportamiento actual.

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
