FROM node:20-alpine

# Alpine no trae la base de datos de zonas horarias. Sin tzdata la variable TZ
# se ignora en silencio y el contenedor se queda en UTC — justo el desfase de
# 5 horas contra America/Bogota que rompe citas y promociones.
RUN apk add --no-cache tzdata

WORKDIR /app

# Capa de dependencias aparte: solo se reconstruye si cambian los manifiestos,
# no cada vez que se toca el codigo fuente.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Usuario no-root: la imagen base ya define `node` (uid 1000).
#
# Ya no hace falta crear logs/ ni cambiarle el dueno: winston solo activa los
# transports de archivo cuando NODE_ENV != production (hallazgo I3, corregido).
# En contenedor los logs salen por stdout y los recoge el runtime.
USER node

EXPOSE 3000

# Node 20 trae fetch global, asi que no hace falta instalar curl solo para esto.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
