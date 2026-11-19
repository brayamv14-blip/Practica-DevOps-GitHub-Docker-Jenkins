# PuntoBase — Manual de instalación y configuración

## 1. Requisitos
Node 20+, npm, cuenta Supabase, cuenta Vercel, (opcional) Cloudinary. Git.

## 2. Instalación local
```
npm ci
copy .env.example .env.local     (rellena los valores, ver §3)
npm run dev                      → http://localhost:3000
npm run typecheck && npm test    → tsc y 172 pruebas
npm run build && npm start       → producción local
npm run test:e2e                 → Playwright (usa Supabase simulado)
```

## 3. Variables de entorno (sin valores secretos)
| Variable | Tipo | Para qué |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | pública | URL del proyecto |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | pública | clave anon |
| SUPABASE_SERVICE_ROLE_KEY | **secreta** | acceso del servidor |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY | pública (se incrusta al compilar) | push |
| VAPID_PRIVATE_KEY | **secreta** | push |
| VAPID_SUBJECT | `mailto:correo-real` o `https://sitio` (no `.local`) | Apple rechaza otros |
| CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY | servidor | imágenes |
| CLOUDINARY_API_SECRET | **secreta** | imágenes |
| CRON_SECRET | **secreta**, ≥16 caracteres | tarea diaria |
Generar VAPID: `npx web-push generate-vapid-keys`. Nunca subas `.env*` a Git.

## 4. Base de datos (Supabase → SQL Editor)
Orden: `schema.sql` (solo base nueva) → `puntobase-migration.sql` → `-2` → `-3` → `-4` → `-5` → `-6`. Son repetibles y no borran datos. Rollbacks: `-5-rollback`, `-6-rollback`. **Sin la migración 6 todos los dispositivos actúan como administrador.**

## 5. Despliegue en Vercel
1. Importar el repo (framework Next.js; el build usa `next build --webpack`).
2. Cargar las variables del §3 (Production).
3. Deploy → esperar *Ready*. Si cambias `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, redespliega.
4. La tarea diaria (cron) está en `vercel.json` y exige `CRON_SECRET`.

## 6. Verificación posterior
- `https://tu-sitio/manifest.webmanifest` y `/sw.js` responden 200.
- Instalar desde Chrome; modo avión → vender → reconectar → sincronizar.
- Ajustes → Notificaciones → Probar.
- Lighthouse (Chrome DevTools, modo incógnito, móvil) sobre `/products` y `/dashboard`.
