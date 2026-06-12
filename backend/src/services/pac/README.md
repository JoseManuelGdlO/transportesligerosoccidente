# Integración PAC — Carta Porte / Sicofi

## Proveedores

| `pac_proveedor` | Comportamiento |
|-----------------|----------------|
| `stub` (default) | Simula timbrado local para desarrollo |
| `sicofi` | JWT Bearer + POST JSON a `Factura40` (ingreso o traslado) |

## Credenciales tenant

- `pac_usuario` — usuario Sicofi (Basic auth en `/auth/token` y campo `Usuario` en Factura40)
- `pac_token` (API) → `pac_token_enc` — **contraseña** Sicofi cifrada con `FISCAL_ENC_KEY` (no es JWT)
- `pac_url` — base URL opcional (ej. `https://demo.sicofi.com.mx/DFWSR/api`)

## Variables de entorno

```env
PAC_PROVIDER=stub
SICOFI_API_BASE_URL=https://demo.sicofi.com.mx/DFWSR/api
SICOFI_TIMEOUT_MS=120000
FISCAL_ENC_KEY=...
```

## Flujo timbrado

1. `cartaPorteService.timbrarCartaPorte(tenantId, tripId, tipo, opts)`
2. `buildFactura40Payload(ctx)` → JSON Sicofi
3. `SicofiPacProvider.timbrar(ctx)`:
   - `POST {base}/auth/token` (Basic) → JWT cacheado en memoria
   - `POST {base}/Comprobante40/Factura40` (Bearer + `Usuario`/`Contrasena` en body)
   - Reintento único si Factura40 responde 401 (token expirado)
4. Persistencia en `cartas_porte` + `trips.num_factura`

Ver [docs/sicofi-factura40.md](../../../docs/sicofi-factura40.md).

## Spike

```bash
npx tsx scripts/sicofi-spike.ts --tipo traslado --usuario X --contrasena Y
```

El spike obtiene token y luego timbra, igual que el provider en producción.
