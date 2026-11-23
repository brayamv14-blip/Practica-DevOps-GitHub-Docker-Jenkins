# Práctica DevOps: GitHub + Docker + Jenkins

Aplicación: **PuntoBase** (PWA offline-first de punto de venta e inventario).
Materia: Gestión de Desarrollo de Software (décimo cuatrimestre, UTFV).

## Archivos de la práctica

| Archivo | Función |
|---|---|
| `Dockerfile` | Construye la imagen de PuntoBase (Node 22 Alpine, build en dos etapas, usuario sin privilegios, HEALTHCHECK) |
| `.dockerignore` | Excluye de la imagen lo que no se necesita (node_modules, .git, docs, pruebas e2e, archivos .env) |
| `Jenkinsfile` | Pipeline: Checkout → Pruebas → Imagen Docker → Contenedor → Verificación |
| `Dockerfile.jenkins` | Jenkins con cliente Docker, Node 22 y plugins (Git, GitHub, Pipeline, Docker) |
| `docker-compose.jenkins.yml` | Levanta Jenkins localmente con acceso al Docker del equipo |
| `app/api/health/route.ts` | Endpoint `/api/health` para comprobar que la app arrancó |

## Docker

Requerimientos de la aplicación:

- Node.js 20.9 o superior (se usa la 22).
- `npm ci` para instalar dependencias (`package-lock.json`).
- `npm run build` genera la PWA (Next.js + Service Worker).
- `npm run start` inicia el servidor en el puerto 3000.
- Variables de entorno del servidor (ver `.env.example`): Supabase, VAPID, Cloudinary y `CRON_SECRET`.
  Se entregan al **ejecutar** el contenedor; nunca se guardan en la imagen.

Construir la imagen con nombre y etiqueta:

```bash
docker build -t puntobase:1.0 .
# Con notificaciones push: pasar la llave pública VAPID (es la única variable que el navegador necesita al construir)
docker build -t puntobase:1.0 --build-arg NEXT_PUBLIC_VAPID_PUBLIC_KEY="<llave-publica>" .
```

Ejecutar el contenedor:

```bash
# Aplicación completa (con tus credenciales reales en .env.local)
docker run -d --name puntobase -p 3000:3000 --env-file .env.local puntobase:1.0

# Solo comprobar que arranca (sin base de datos real)
docker run -d --name puntobase -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
  -e SUPABASE_SERVICE_ROLE_KEY=placeholder \
  puntobase:1.0
```

Verificar:

```bash
docker ps
curl http://localhost:3000/api/health      # {"status":"ok","app":"PuntoBase",...}
# Navegador: http://localhost:3000/offline-ayuda  (no requiere base de datos)
# Con credenciales reales: http://localhost:3000  y  http://localhost:3000/catalogo
```

## Jenkins

```bash
docker compose -f docker-compose.jenkins.yml up -d --build
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

1. Abrir `http://localhost:8080` e ingresar la contraseña inicial.
2. Instalar plugins sugeridos y verificar: Git, GitHub, Pipeline, Docker Pipeline.
3. Crear el usuario administrador.
4. Nueva Tarea → `Practica-DevOps-Pipeline` → tipo **Pipeline**.
5. *Pipeline script from SCM* → Git → URL del repositorio → rama `*/main` → Script Path `Jenkinsfile`.
6. (Opcional) Webhook en GitHub: Settings → Webhooks → `http://<servidor-jenkins>:8080/github-webhook/`, `application/json`, evento *push*; en Jenkins marcar *GitHub hook trigger for GITScm polling*.

## Etapas del pipeline

1. **Checkout**: obtiene el código desde GitHub.
2. **Pruebas**: `npm ci` y `npm test` (Vitest).
3. **Construir imagen Docker**: `docker build` con el `Dockerfile` del proyecto.
4. **Ejecutar contenedor**: levanta `puntobase-ci` en el puerto 3100.
5. **Verificar aplicación**: consulta `/api/health` hasta que responda (hasta 20 intentos).
6. **Post**: reporta el resultado y elimina el contenedor de prueba.
