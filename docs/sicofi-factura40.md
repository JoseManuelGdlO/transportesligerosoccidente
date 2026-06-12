# Sicofi Factura40 — Integración TLO

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

## Autenticación

Credenciales en el **body JSON** (no Bearer):

- `Usuario` → `tenant.pac_usuario`
- `Contrasena` → `decryptSecret(tenant.pac_token_enc)` (campo `pac_token` en PATCH fiscal)

## Variantes de comprobante

| Tipo UI | `TipodeComprobante` | Montos | Moneda | UsoCfdi | CartaPorte31 |
|---------|---------------------|--------|--------|---------|--------------|
| Ingreso | `FA` | tarifa + impuestos | MXN/USD | configurable (G03) | Sí |
| Traslado | `T` | 0 | `XXX` | `S01` fijo | Obligatorio |

## Respuesta

- Éxito: **XML** del CFDI timbrado (a veces envuelto en JSON con campo `Xml`).
- Extracción: `tfd:TimbreFiscalDigital` → `UUID`, `FechaTimbrado`; atributos `Serie`/`Folio` en `cfdi:Comprobante`.
- `Folio: 0` y `Fecha: "0001-01-01T00:00:00"` → Sicofi auto-asigna folio y fecha.

## Errores

| HTTP | Significado |
|------|-------------|
| 401 | Usuario/contraseña inválidos |
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
| `pac/sicofi/buildFactura40Payload.ts` | trip → JSON |
| `pac/SicofiPacProvider.ts` | POST + parse |
| `pac/sicofi/parseResponse.ts` | XML → TimbradoResult |

`buildCartaPorteXml` queda solo para preview/debug legacy (CFDI tipo T).

## Referencia

- [Sicofi+ REST](https://plus.sicofi.com.mx/rest#)
