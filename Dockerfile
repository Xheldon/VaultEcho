# Build the admin UI on the native build platform. Its output is static
# JS/CSS (architecture-independent), so building it under QEMU emulation for
# other target arches would only make multi-arch builds extremely slow.
FROM --platform=$BUILDPLATFORM node:22-alpine AS admin-builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY admin ./admin
RUN npm run admin:build

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY src ./src
COPY --from=admin-builder /app/public ./public

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

USER node

CMD ["node", "src/server.js"]
