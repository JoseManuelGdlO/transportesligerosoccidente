#!/bin/sh
set -e
cd /app
echo "[entrypoint] Migraciones…"
npx sequelize-cli db:migrate
echo "[entrypoint] Seeds (omitidos si ya están en SequelizeData)…"
npx sequelize-cli db:seed:all
exec "$@"
