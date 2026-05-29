# TLO API (Express + Sequelize + MySQL)

Backend del sistema **Transportes Ligeros de Occidente**: REST bajo `/api/v1`, autenticación JWT, roles y permisos alineados con el frontend (`frontend/src/types/tlo.ts`).

## Requisitos

- Node.js 18+
- MySQL 8 (o compatible)

## Configuración

1. Copia `.env.example` a `.env` y completa variables (no subas `.env` al repositorio).

Variables principales:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_DIALECT=mysql`
- `JWT_SECRET` (cadena larga y aleatoria en producción)
- `JWT_ACCESS_EXPIRES_SEC` — segundos de vida del token de acceso (también acepta `1h`, `90m`). Si no existe: `JWT_EXPIRES_SEC`, `JWT_EXPIRES_IN`, y por defecto 1 h.
- `JWT_REFRESH_EXPIRES_SEC` — vida del refresh token (por defecto 7 días; admite `7d`, segundos, etc.)
- `PORT` (por defecto `4000`)
- `CORS_ORIGIN` (por defecto `http://localhost:5173`)
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (solo para el seeder del usuario administrador inicial)

## Base de datos

```bash
npm install
npm run db:migrate
npm run db:seed
```

- `db:migrate` crea tablas y enums.
- `db:seed` inserta permisos, roles, matriz `role_permissions` y un usuario admin (contraseña según `SEED_ADMIN_PASSWORD`).

## Desarrollo

```bash
npm run dev
```

La API queda en `http://localhost:4000`. Rutas:

- `GET /health` — sin autenticación
- `POST /api/v1/auth/login` — sin JWT (devuelve `token`, `refresh_token`, `tenant`, `user` con `permissions`)
- `POST /api/v1/auth/refresh` — body `{ "refresh_token": "<jwt>" }`; devuelve nuevo `token` y `refresh_token` (rotación)
- Resto de rutas: header `Authorization: Bearer <token>` y permisos según la operación

## Logging

| Variable | Valores | Default |
|----------|---------|---------|
| `LOG_LEVEL` | `error`, `warn`, `info`, `debug` | `info` |

Cada petición HTTP genera una línea con timestamp, método (negrita), ruta, código de estado (color por clase HTTP) y duración. Con `LOG_LEVEL=debug` se incluyen además query params y body (campos sensibles enmascarados).

```bash
LOG_LEVEL=debug npm run dev
```

En terminales interactivas las peticiones usan color ANSI (estilo Morgan). En logs agregados de Docker o con `NO_COLOR` definido, la salida es texto plano.

## Producción

```bash
npm run build
npm start
```

## Permisos (resumen)

| Permiso | Uso típico |
|---------|------------|
| `viajes.ver` | Listar / ver viajes |
| `viajes.crear` | Crear / editar viaje abierto, combustible, gastos |
| `viajes.cerrar` | Cerrar viaje |
| `viajes.eliminar` | Eliminar viaje |
| `liquidaciones.ver` | Resumen de liquidación |
| `liquidaciones.cerrar` | Persistir cierre de liquidación |
| `catalogos.ver` | Leer camiones, operadores, clientes |
| `catalogos.editar` | CRUD catálogos |
| `reportes.ver` | `GET /reports/aggregates` |
| `usuarios.gestionar` | Usuarios y roles/permisos |
| `documentos.ver` | Ver documentos y archivos de operadores/unidades |
| `documentos.editar` | Subir y editar documentos |
| `tipos_documento.gestionar` | CRUD de tipos de documento por tenant |
| `notificaciones.ver` | Campana de notificaciones y avisos de vencimiento |

## Archivos adjuntos y Web Push

- **`UPLOAD_DIR`**: directorio donde se guardan PDF/imagenes (en Docker debe ser un **volumen del host** montado en el contenedor, p. ej. `UPLOAD_DIR=/app/uploads` y bind mount `./data/uploads:/app/uploads`).
- **`VAPID_*`**: claves para notificaciones push en el navegador. Generar con `npx web-push generate-vapid-keys` y copiar a las variables de entorno.
- **`CRON_DOC_CHECK`**: expresión cron del job diario que crea notificaciones por documentos por vencer / vencidos.

## Combustibles (sincronización automática)

Job diario (`CRON_FUEL_SYNC`, por defecto 05:00) que:

1. Descarga el Excel del proveedor de combustible (HTTP o archivo local de prueba).
2. Importa tickets (`origen: api`) con deduplicación.
3. El **prorrateo** no se guarda en BD: al abrir **Combustibles → Prorrateo / Resumen** se calcula con los tickets ya importados.

Variables en `.env.example`: `FUEL_SYNC_ENABLED`, `FUEL_PROVIDER_*`, `FUEL_SYNC_LOOKBACK_DAYS`. Por empresa: `PATCH /api/v1/tenant/fuel` (`fuel_sync_habilitado`, URL y credenciales). Disparo manual: `POST /api/v1/fuel-tickets/sync`. Prueba: `npm run job:fuel-sync`.

Si el proveedor está caído, el usuario recibe notificación y puede importar el Excel a mano en **Combustibles → Tickets**.

El rol `admin` tiene todos los permisos; `capturista` se ajusta en el seed (coincide con el mock del frontend).

## Seguridad

- Rota credenciales de base de datos si se han expuesto.
- Usa `JWT_SECRET` fuerte y HTTPS en producción.
