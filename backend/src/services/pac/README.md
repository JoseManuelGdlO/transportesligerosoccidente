# Integración PAC — Carta Porte

## Pendiente con contador / cliente

1. **Tipo de CFDI**: traslado vs complemento en factura de ingreso del flete.
2. **Proveedor PAC**: implementar adaptador en `index.ts` (Facturama, SW Sapien, Finkok, etc.).
3. **Ambiente**: certificados de prueba SAT vs producción.
4. **Catálogos SAT**: validación de `c_ClaveProdServ`, `c_ConfigAutotransporte`, etc.

## Uso actual

- `PAC_PROVIDER=stub` (por defecto) simula timbrado para desarrollo y pruebas de flujo.
- CSD y contraseña se guardan cifrados en el tenant (`FISCAL_ENC_KEY` en `.env`).
