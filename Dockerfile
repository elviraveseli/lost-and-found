# Multi-stage build: build the React client, then run the API, which also
# serves the built client (single origin => simple cookie/CSRF handling).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY client client
RUN npm run build -w client

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY server/src server/src
COPY --from=build /app/client/dist client/dist
RUN mkdir -p server/storage/uploads && chown -R node:node server/storage
USER node
EXPOSE 4000
CMD ["node", "server/src/server.js"]
