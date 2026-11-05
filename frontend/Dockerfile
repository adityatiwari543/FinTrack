# ==========================================
# FinTrack Frontend - Production Dockerfile
# Multi-stage build with Nginx static runner
# ==========================================

# Stage 1: Build Static Assets
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_GATEWAY_URL
ENV VITE_API_GATEWAY_URL=${VITE_API_GATEWAY_URL}

RUN npm run build

# Stage 2: Production Nginx Server
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
