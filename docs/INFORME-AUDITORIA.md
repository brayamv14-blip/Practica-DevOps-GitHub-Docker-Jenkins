# PuntoBase — Informe de auditoría final (14-nov-2026)

## 1. Resultados globales (copia limpia, entorno de pruebas sin Supabase/Vercel/dispositivos reales)
| Verificación | Resultado |
|---|---|
| TypeScript | 0 errores |
| Vitest | **172/172**, 13 archivos |
| ESLint | 0 errores |
| Build de producción | Correcto |
| Playwright (Chromium, build real, Supabase simulado) | **7/7** |
| Barrido responsive: 21 rutas × 6 anchos (360–1920 px) | 0 desbordes |
| Migraciones 1–6 en PostgreSQL real (PGlite) + rollback | 14/14 |
| Mutaciones (errores inyectados) | todas detectadas |

## 2. Tabla por módulo
Evidencia = archivo de prueba. «Real» = comprobado con servicios/dispositivos reales (solo lo indicado).
| Módulo | Funciones revisadas | Pruebas | Resultado | Evidencia / pendiente |
|---|---|---|---|---|
| Registro y acceso | primer dispositivo = admin, siguientes = empleado, código ≥6, mensajes en español | roles, e2e | OK | e2e «setup en español» |
| Roles y permisos | matriz, 403 por llamada directa, UI por rol | roles.test (10), e2e | OK. **Corregido:** empleado podía rechazar transferencias | Pendiente: prueba con empleado en teléfono real |
| POS / ventas | cálculo en servidor, stock, cantidades inválidas, idempotencia | process, api, offline | OK | process.test |
| Offline y sincronización | cola Dexie, reintento, sin duplicados, conflictos | offline, conflicts | OK en simulación | Pendiente: Background Sync en dispositivo |
| Inventario/productos | variantes, categorías, empleado solo ajusta stock | catalog-routes, roles | OK | — |
| Existencias | ajustes con bitácora | api | OK | — |
| Transferencias | confirmar/rechazar, sin doble resolución | api, roles | OK | — |
| Apartados | anticipo, saldo, tarea diaria | patch2/3 | OK | Pendiente: `CRON_SECRET` en Vercel |
| Devoluciones | parciales, no exceder lo vendido, venta original intacta | process, patch3 | OK | — |
| Gastos | alta/listado | catalog-routes | OK | — |
| Cierre de caja | sin doble cierre, cifras | reports, patch3 | OK | — |
| Reportes | ingresos netos, devoluciones, CSV | reports, process | OK | **PDF no verificado a fondo** |
| Análisis / Bitácora | solo admin, `store.update` sin guardar el código | roles, api | OK | — |
| Notificaciones push | VAPID subject válido, push siempre visible, renovación, diagnóstico | push-ios (25) | OK en código | **Pendiente: iPhone, Android y escritorio reales** |
| PWA | manifest, SW, página offline, actualización | e2e | OK | Android instalado (Figs. 6–12); iPhone sin probar |
| Seguridad | errores de BD no se filtran (14 rutas), textos en español, rutas sin sesión → 401 | process, api | OK | — |
| Respaldo | cerrar sesión descarga pendientes y aborta si falla | local-export | OK | — |
| Migraciones | 1–6 + rollbacks | migration | OK | **Pendiente: aplicar la 6 en tu Supabase** |
| Rendimiento | escáner, QR y push con carga diferida | Lighthouse laboratorio | Mejora: /products 71→85, /dashboard 71→75 (TBT 930→700 ms) | **El 64 de producción debe re-medirse tras desplegar**; el costo restante es la hidratación de Next |
| Diseño responsive | barra inferior sin cortes, sin desbordes | barrido automático | OK | Pendiente: revisión visual en teléfono real |

## 3. Qué NO se pudo comprobar aquí
Supabase real, Vercel, iPhone, Android (nuevas funciones), cámara/QR físico, Cloudinary, cron, Background Sync, Lighthouse en producción. Pasos exactos: `docs/ENTREGA-FINAL.md` §6–§10 y `docs/NOTIFICACIONES.md`.

## 4. Conclusión honesta
Completa en código y pruebas automáticas; **no se declara terminada al 100 %** hasta cerrar los pendientes externos.
