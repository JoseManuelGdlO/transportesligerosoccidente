# Sicofi Factura40 — Integración TLO

Guía operativa y troubleshooting. Para arquitectura del código, flujo API y mapa de módulos, ver [backend/src/services/pac/README.md](../backend/src/services/pac/README.md).

## Endpoint

Un solo endpoint para ingreso y traslado:

```
POST {base}/Comprobante40/Factura40
```

| Entorno | Base URL (sin path) |
|---------|---------------------|
| Demo | `https://demo.sicofi.com.mx/DFWSR/api` |
| Prod | Configurar en `tenant.pac_url` o `SICOFI_API_BASE_URL` |

Resolución: `tenant.pac_url` → `SICOFI_API_BASE_URL` → demo.

## Autenticación (híbrida, 2 pasos)

Sicofi requiere **Basic auth** para obtener un JWT y luego **Bearer** + credenciales en el body para timbrar. TLO usa las mismas credenciales del tenant en ambos pasos (`pac_usuario` + `pac_token` descifrado).

| Paso | Endpoint | Headers | Body |
|------|----------|---------|------|
| 1. Token | `POST {base}/auth/token` | `Authorization: Basic base64(usuario:contraseña)` | vacío (`application/x-www-form-urlencoded`) |
| 2. Timbrado | `POST {base}/Comprobante40/Factura40` | `Authorization: Bearer <JWT>` | JSON con `Usuario`, `Contrasena`, `DatosCFDI40`, … |

Respuesta de `/auth/token` (demo): `{ "token": "<JWT>", "expiration": … }` (no usa el nombre OAuth `access_token`).

- `Usuario` → `tenant.pac_usuario`
- `Contrasena` → `decryptSecret(tenant.pac_token_enc)` (campo `pac_token` en PATCH fiscal)

El token JWT se cachea en memoria por `{baseUrl}:{usuario}` con TTL = `expires_in - 60s`. Si `Factura40` responde 401, se invalida el cache y se reintenta una vez.

## Variantes de comprobante

| Tipo UI | `TipodeComprobante` | Montos | Moneda | UsoCfdi | CartaPorte31 |
|---------|---------------------|--------|--------|---------|--------------|
| Ingreso | `FA` | tarifa + impuestos | MXN/USD | configurable (G03) | Sí |
| Traslado | `T` | 0 | `XXX` | `S01` fijo | Obligatorio |

## Respuesta

- Éxito: **XML** del CFDI timbrado (a veces envuelto en JSON con campo `Xml`).
- Extracción: `tfd:TimbreFiscalDigital` → `UUID`, `FechaTimbrado`; atributos `Serie`/`Folio` en `cfdi:Comprobante`.
- Sin `folio_cfdi` previo, TLO envía `Folio: 1` (Sicofi no auto-asigna con `0`).
- `DatosCFDI40.Fecha` → fecha/hora local válida `YYYY-MM-DDTHH:mm:ss` (TZ del servidor, recomendado `America/Mexico_City`).

## Errores comunes (Sicofi 301 / validación XSD)

Sicofi devuelve `Error: 301 - No cumple con el estándar de XML` cuando algún campo no pasa el esquema SAT. TLO valida en preview los casos más frecuentes antes de llamar al PAC.

| Síntoma | Causa | Qué usar |
|---------|--------|----------|
| `SERIE: CP` no dada de alta | Serie no registrada en Sicofi | Administración → SAT → Administrar Series, o alinear `tenant.cfdi_serie` |
| RFC `…ABC` inválido (`t_RFC`) | Homoclave debe terminar en dígito o `A` | `XAXX010101000` (público en general) |
| `CFDI40143` receptor no inscrito | RFC sintácticamente válido pero no en padrón SAT | `XAXX010101000` en demo, o RFC real del cliente |
| `IDUbicacion` `ORAE8AA9` inválido | Debe ser `(OR\|DE)[0-9]{6}` | TLO genera `OR123456` / `DE123456` automáticamente |
| `78101800` no en enumeración de `BienesTransp` | Mezcla de catálogos | Ver tabla abajo |
| `TPAFO1` no en enumeración de `PermSCT` | Confusión letra O vs dígito 0 | `TPAF01` (c_TipoPermiso) |
| `14500` u otro numérico en `ConfigVehicular` | No es c_ConfigAutotransporte | `C2`, `VL`, `T3S2`, etc. |
| Traslado `CP107` receptor ≠ emisor | En tipo `T` el receptor CFDI debe ser el **mismo RFC que el CSD** en Sicofi | TLO usa `tenant.rfc` como receptor; si el certificado en Sicofi es de otro RFC, timbra CP107 aunque el JSON sea correcto |
| `CFDI40106` CSD no corresponde a emisor | CSD del PAC ≠ emisor del XML | Alinear `tenant.rfc`, razón social y CP con el CSD cargado en Sicofi |
| Ingreso + Carta Porte con `XAXX010101000` | SAT no admite público en general con complemento | Cliente con RFC real inscrito en el SAT |
| Ingreso a público en general sin CP `CFDI40130` | Falta nodo global | `InformacionGlobal` + régimen `616` + CP = lugar expedición (solo sin Carta Porte) |
| Ingreso + Carta Porte `CP131` | Falta `CantidadTransporta` en mercancías | TLO envía `Cantidad`, `IDOrigen`, `IDDestino` por mercancía |

### Dos catálogos distintos (no intercambiables)

| Campo JSON / XML | Catálogo SAT | Ejemplo válido | Uso en TLO |
|------------------|--------------|----------------|------------|
| `ConceptosCFDI40.ClaveProdServ` | **c_ClaveProdServ** (CFDI) | `78101800` traslado, `78101801` ingreso/flete | `mapConceptos.ts` (automático) |
| `CartaPorte31…Mercancia30.bienestransp` | **c_ClaveProdServCP** (Carta Porte) | `50192100`, `50202201` | `trip_mercancias.clave_prod_serv` |

`78101800` es el servicio de transporte en el **concepto** del CFDI; **no** es la clave de la mercancía transportada. En mercancías del viaje capture la clave del producto real según [c_ClaveProdServCP](https://logipro.mx/sat/carta-porte-31/c_ClaveProdServCP) (catálogo Carta Porte 3.1 del SAT).

Default de prueba en TLO: `50192100`. Consulte también el [complemento Carta Porte en el SAT](https://wwwmat.sat.gob.mx/consultas/68823/complemento-carta-porte-).

## Errores HTTP

| HTTP | Significado |
|------|-------------|
| 401 | Token JWT inválido/expirado o credenciales incorrectas (auth o body) |
| 400 | Validación SAT / payload |
| 500 | Error interno Sicofi |

## Spike local

```bash
cd backend
SICOFI_USUARIO=demo@mail.com SICOFI_CONTRASENA=secret \
  npx tsx scripts/sicofi-spike.ts --tipo ingreso
```

## Módulos TLO

| Archivo | Rol |
|---------|-----|
| `pac/sicofi/sicofiAuth.ts` | POST `/auth/token`, cache JWT |
| `pac/sicofi/buildFactura40Payload.ts` | trip → JSON |
| `pac/SicofiPacProvider.ts` | token + POST Factura40 + parse |
| `pac/sicofi/parseResponse.ts` | XML → TimbradoResult |

`buildCartaPorteXml` queda solo para preview/debug legacy (CFDI tipo T).

## Referencia

- [Sicofi+ REST](https://plus.sicofi.com.mx/rest#)
