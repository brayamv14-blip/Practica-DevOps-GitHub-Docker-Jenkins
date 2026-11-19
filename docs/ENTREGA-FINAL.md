# PuntoBase — Informe final de auditoría y entrega

Fecha: 12-nov-2026 · Curso: Aplicaciones Web Progresivas (DGS 1002), UTFV.

## 1. Resultados reales de las pruebas (versión final, copia limpia)
| Verificación | Resultado |
|---|---|
| TypeScript (`tsc --noEmit`) | 0 errores |
| ESLint | 0 errores |
| Vitest | **172/172** en 13 archivos |
| Migraciones 1–6 en PostgreSQL real (PGlite) con rollback | 14/14 |
| Playwright (Chromium, build de producción) | **7/7** |
| Build de producción | Correcto (aquí con fuente simulada: sin acceso a Google Fonts) |
| Mutación (errores inyectados a propósito) | todas detectadas |

## 2. Clasificación de funciones
**A — Implementada y probada automáticamente:** ventas y cálculo en servidor; ventas offline con identificador idempotente, reintentos, conflictos y sin duplicados; inventario y ajustes con bitácora; categorías y variantes; caja y cierre (sin doble cierre); transferencias (confirmar/rechazar, sin doble resolución, inventario restituido); apartados y su tarea diaria; devoluciones (parciales, sin duplicar, sin borrar la venta); reportes y CSV; roles y permisos (proxy + rutas, 403 por llamada directa); código de acceso (cifrado, sin guardarse en bitácora); bitácora; migraciones 1–6 y rollback; manifest, Service Worker (sin caché HTTP) y página sin conexión; push del servidor y del Service Worker.

**B — Probada con servicios reales:** despliegue en Vercel (commit 819ce96 = Parche 1, con HTTPS); instalación en Android; Lighthouse en producción (Rendimiento 64, Accesibilidad 96, Buenas prácticas 100, SEO 100). *Estas evidencias son de la versión anterior; ver §6.*

**C — Probada en dispositivo físico:** Android: instalación, icono, atajos, modo standalone, aviso sin conexión (Figuras 6–12 del documento de publicación). **iPhone: nada probado todavía.**

**D — Implementada, pendiente de validación:** parche acumulado y de roles/push desplegados; migración 6 en tu Supabase; tarea diaria (`CRON_SECRET`); roles con un empleado real en teléfono; notificaciones push en iPhone, Android y computadora; cámara y escáner QR; Background Sync; subida de imágenes a Cloudinary en producción; exportación a PDF (no revisada a fondo en esta ronda); responsive revisado a 390 px, no a los 6 anchos.

**E — Pendiente de implementar (mejoras opcionales):** `screenshots` en el manifest; re-medir Lighthouse en producción (laboratorio: /products 71→85, /dashboard 71→75; el 64 anterior es de la versión previa).

## 3. Qué se hizo en esta versión
- Integración: ZIP original + parche acumulado + parche de roles/español + parche de push, sin conflictos ni cambios duplicados (punto de recuperación: etiqueta `recuperacion-antes-push`).
- Registro de dispositivo en español; **corrección de seguridad**: el empleado ya no puede rechazar transferencias; interfaz por rol; matriz de permisos en Ajustes; renombrar dispositivos; cambiar código de acceso.
- Push: ver `docs/NOTIFICACIONES.md` (subject VAPID, push siempre visible, renovación, diagnóstico, pruebas diferidas, iPhone).
- Panel de notificaciones también en Ajustes.
- Documentos: `ROLES.md`, `NOTIFICACIONES.md` y este informe.

**Archivos modificados/nuevos respecto a tu ZIP:** ver la lista al final.

## 4. Variables de entorno (Vercel → Settings → Environment Variables)
| Variable | Tipo |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | pública (sin acceso a datos con RLS activo) |
| `SUPABASE_SERVICE_ROLE_KEY` | **secreta** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | pública (incrustada al compilar: cambiarla exige redesplegar) |
| `VAPID_PRIVATE_KEY` | **secreta** |
| `VAPID_SUBJECT` | `mailto:correo@dominio-real` o `https://tu-sitio` (no `.local`) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` | servidor |
| `CLOUDINARY_API_SECRET` | **secreta** |
| `CRON_SECRET` | **secreta**, mínimo 16 caracteres aleatorios |

## 5. Orden de migraciones (Supabase → SQL Editor, en este orden)
1. `schema.sql` (solo en base nueva) → 2. `puntobase-migration.sql` → 3. `-2` → 4. `-3` → 5. `-4` → 6. `-5` → 7. **`-6`**.
Todas son repetibles y no borran datos. Rollbacks: `puntobase-migration-5-rollback.sql`, `-6-rollback.sql`. Tu captura de Supabase mostraba que la **6 aún no estaba aplicada**.

## 6. Pasos exactos para desplegar
1. En CMD: `git apply` del parche, `npm ci`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` (ver instrucciones del parche).
2. Subir la rama, abrir PR a `main` y hacer *Merge*.
3. Supabase: ejecutar la migración 6 **antes** de usar la app nueva.
4. Vercel: agregar `CRON_SECRET` y revisar `VAPID_SUBJECT`; si cambias `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, redespliega.
5. Esperar *Ready*, abrir el sitio, aceptar «Hay una nueva versión» → Actualizar.
6. Repetir las capturas: Supabase (Fig. 4), Lighthouse (Fig. 13), pruebas (Fig. 14), aviso de nueva versión y notificaciones.

## 7. Probar en Android
Chrome → abrir el sitio → «Instalar». Comprobar: icono, abre en pantalla completa, atajos (mantener pulsado el icono), modo avión → ventas se guardan, reconectar → «Sincronizar ahora» y ver que aparece **una** sola vez. Notificaciones: Ajustes → Activar → Probar (app abierta y con «Probar con la app cerrada»).

## 8. Probar en iPhone
Ver `docs/NOTIFICACIONES.md` → «Prueba física en iPhone» (8 pasos con evidencia).

## 9. Lista de verificación para la entrega escolar
- [ ] Parche aplicado, pruebas 172/172, build correcto en tu equipo.
- [ ] Migración 6 aplicada y tablas visibles en Supabase.
- [ ] Sitio en Vercel *Ready* con el commit nuevo; `CRON_SECRET` configurado.
- [ ] Capturas nuevas: Supabase, Lighthouse, pruebas, aviso de actualización.
- [ ] Prueba con un empleado real (no ve Rechazar, Análisis, Bitácora).
- [ ] Push probado en al menos Android o computadora; iPhone si tienes uno (si no, déjalo como pendiente declarado).
- [ ] Documento de publicación actualizado con las capturas finales.

## 10. Pendientes que requieren tu intervención
Todo lo de la clasificación **C y D**: nada de eso se puede comprobar desde este entorno (no hay iPhone, Android, tu Supabase ni tu Vercel). No se declara PuntoBase como «terminada al 100 %»: está **completa en código y pruebas automáticas**, con esa validación externa pendiente.

## 11. Alcance de esta ronda (honestidad)
Barrido automático de 21 rutas × 6 anchos sin desbordes; optimización de rendimiento en laboratorio; ver `INFORME-AUDITORIA.md`, `MANUAL-USUARIO.md` e `INSTALACION-Y-CONFIGURACION.md`. Las funciones ya cubiertas por las rondas anteriores (ventas, caja, apartados, devoluciones, offline) se verificaron de nuevo con la batería completa de pruebas, no con una reescritura.

## Archivos modificados o nuevos respecto a tu ZIP
- app/(app)/audit/page.tsx
- app/(app)/products/page.tsx
- app/(app)/settings/page.tsx
- app/(app)/transfers/page.tsx
- app/(auth)/setup/page.tsx
- app/api/push/status/route.ts
- app/api/push/test/route.ts
- app/api/setup/route.ts
- app/api/store-config/route.ts
- app/api/transfers/route.ts
- components/products/ProductForm.tsx
- components/push/PushToggle.tsx
- components/settings/AccessCodeCard.tsx
- components/settings/PermissionsCard.tsx
- docs/ENTREGA-FINAL.md
- docs/NOTIFICACIONES.md
- docs/ROLES.md
- e2e/pwa.spec.ts
- lib/audit.ts
- lib/permissions.ts
- lib/push-client.ts
- lib/push-payload.ts
- lib/push.ts
- tests/api.test.ts
- tests/push-ios.test.ts
- tests/roles.test.ts
- tsconfig.tsbuildinfo
- worker/index.ts
