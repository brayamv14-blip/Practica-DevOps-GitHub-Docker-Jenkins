# ───────────────────────── PuntoBase: imagen de Docker ─────────────────────────
# Imagen base: Node.js 22 sobre Alpine (ligera). Next.js 16 requiere Node 20.9 o superior.
FROM node:22-alpine AS builder

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# 1) Dependencias: se copian primero los archivos de dependencias para aprovechar la caché de capas
COPY package.json package-lock.json ./
RUN npm ci

# 2) Código fuente (lo que no se necesita está excluido en .dockerignore)
COPY . .

# Única variable que el navegador necesita en tiempo de construcción (llave pública de notificaciones push).
# Las llaves secretas y la conexión a Supabase se pasan al ejecutar el contenedor, nunca a la imagen.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_TELEMETRY_DISABLED=1

# 3) Construcción de la PWA (genera .next y el Service Worker en public/)
RUN npm run build

# ───────────────────────── Etapa final: solo lo necesario para ejecutar ─────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Se copia el resultado de la construcción (incluye node_modules, porque next-pwa y next.config.ts se cargan al iniciar)
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public

# Ejecutar la aplicación sin privilegios de administrador
USER node

# Puerto en el que escucha la aplicación
EXPOSE 3000

# Docker revisa periódicamente que la aplicación responda
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# Comando para iniciar la aplicación
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
