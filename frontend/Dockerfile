# =============================================================================
# Etapa 1 — build del bundle con Vite
# =============================================================================
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# IMPORTANTE: Vite resuelve import.meta.env en tiempo de BUILD, no de runtime.
# El valor queda incrustado literalmente en los .js generados, de modo que la
# imagen resultante queda atada a esta URL. Cambiarla exige reconstruir la
# imagen (`docker compose build frontend`); reiniciar el contenedor no sirve.
#
# El valor por defecto es relativo (/api) porque nginx hace de proxy hacia el
# backend desde el mismo origen. Solo hace falta una URL absoluta si el API se
# sirve desde otro host o dominio.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY . .
RUN npm run build

# =============================================================================
# Etapa 2 — servir el estatico con nginx
# =============================================================================
FROM nginx:1.27-alpine

RUN apk add --no-cache tzdata

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
