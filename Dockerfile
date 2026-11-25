# Build both the React frontend and the Nest/Fastify backend.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Keep development and build tools out of the runtime image.
FROM node:22-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# OpenShift may replace this UID with a project-assigned non-root UID.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3100
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
# Migrations are read from disk at startup and must accompany the compiled app.
COPY --from=build /app/server/db ./server/db
RUN chmod -R a+rX /app
USER 1001
EXPOSE 3100
# Fastify serves both the built frontend and /api on this one port.
CMD ["node", "dist/server/main.js"]
