FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache wget

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json .sequelizerc sequelize.config.cjs ./
COPY src ./src

RUN npm run build

ENV NODE_ENV=production
EXPOSE 4100

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
