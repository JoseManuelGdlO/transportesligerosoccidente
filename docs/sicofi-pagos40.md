# Sicofi Pagos40 — Complemento de pago TLO

Guía operativa del timbrado de **CFDI tipo P** (Pagos 2.0) desde Cuentas. Para arquitectura del código y flujo API, ver [backend/src/services/pac/README.md](../backend/src/services/pac/README.md). La autenticación y resolución de base URL son las mismas que en [sicofi-factura40.md](./sicofi-factura40.md).

## Endpoint

```
POST {base}/Comprobante40/Pagos40
```

| Entorno | Base URL (sin path) |
|---------|---------------------|
| Demo | `https://demo.sicofi.com.mx/DFWSR/api` |
| Prod | Configurar en `tenant.pac_url` o `SICOFI_API_BASE_URL` |

Resolución: `tenant.pac_url` → `SICOFI_API_BASE_URL` → demo. La URL completa cuelga `Pagos40` de esa base (misma lógica que `Factura40`).

## Autenticación

Idéntica a **Factura40**: `POST {base}/auth/token` con Basic, luego `POST Pagos40` con `Authorization: Bearer <JWT>` y en el body JSON `Usuario`, `Contrasena` y el payload `DatosCFDI40` (Pagos 2.0). TLO usa `tenant.pac_usuario` y `decryptSecret(tenant.pac_token_enc)`. Un 401 invalida el cache del JWT y reintenta una vez.

## Serie

- Campo tenant: **`cfdi_serie_pago`** (Empresa → datos fiscales / PAC Sicofi, placeholder `P`).
- Si está vacío, TLO envía serie **`P`** en el JSON.
- La serie debe estar dada de alta en Sicofi (Administración → SAT → Administrar Series), igual que las series de ingreso.

## Respuesta

- Éxito: **XML** del complemento timbrado (a veces envuelto en JSON con campo `Xml`).
- TLO extrae UUID, fecha de timbrado y genera PDF del complemento.
- Solo tras timbrado exitoso se crean o enlazan los abonos en Cuentas y se recalcula el saldo.

## Rechazos locales (antes de llamar a Sicofi)

TLO valida en backend y responde **400** (o **409** en el último caso) sin modificar el saldo del documento.

| Caso | Qué ocurre |
|------|------------|
| Forma de pago **`99`** (por definir) u otro código inválido | `La forma de pago no es válida para complemento` |
| **Monedas distintas** entre documentos del lote, o moneda del pago distinta a la de las facturas | `Todos los documentos deben ser del mismo cliente y la misma moneda` o `La moneda del pago debe coincidir con la de los documentos` |
| **Total del XML** de la factura distinto al monto original de la CXC | `El monto original no coincide con el total del XML` |
| **Complemento en error** de un intento anterior sin descartar | `Hay un complemento pendiente (…). Reintentalo o descartalo.` (**409**) |

Si Sicofi rechaza el timbrado, el registro del complemento queda en **error** con el mensaje del PAC; **no** se crean abonos ni cambia el saldo hasta un timbrado exitoso.

## Referencia

- [Sicofi+ REST — Pagos WS](https://plus.sicofi.com.mx/SicofiAPI/rest#pagosws)
