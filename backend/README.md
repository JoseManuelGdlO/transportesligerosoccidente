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

El rol `admin` tiene todos los permisos; `capturista` se ajusta en el seed (coincide con el mock del frontend).

## Seguridad

- Rota credenciales de base de datos si se han expuesto.
- Usa `JWT_SECRET` fuerte y HTTPS en producción.
