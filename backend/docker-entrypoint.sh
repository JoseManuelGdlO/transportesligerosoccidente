#!/bin/sh
set -e
cd /app
echo "[entrypoint] Migraciones…"
npx sequelize-cli db:migrate
echo "[entrypoint] Seeds (omitidos si ya están en SequelizeData)…"
npx sequelize-cli db:seed:all

# Easy Panel suele inyectar PORT=4000 desde el .env del proyecto y eso pisa el PORT del compose.
# El dominio del panel apunta al puerto interno del servicio (p. ej. 4100). Si PORT no coincide → 502.
LISTEN="${TLO_LISTEN_PORT:-4100}"
export PORT="$LISTEN"
echo "[entrypoint] API escuchando en puerto ${PORT} (en Easy Panel, destino HTTP = este puerto)."
exec "$@"
