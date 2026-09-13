FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/chenguang.db

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "src/server.js"]
