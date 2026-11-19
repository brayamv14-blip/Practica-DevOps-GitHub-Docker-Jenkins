# Notificaciones push en PuntoBase (guía y diagnóstico)

## Cómo funciona
1. El dispositivo pide permiso (al tocar **Activar**), se suscribe en el servicio push de su plataforma (Apple, Google, Mozilla…) con la llave pública VAPID y guarda la suscripción en Supabase (`push_subscriptions`).
2. Cuando ocurre un evento (stock bajo, transferencia por confirmar, faltante en el corte…) el servidor envía el mensaje firmado con la llave privada VAPID.
3. El Service Worker recibe el push y **siempre** muestra una notificación; al tocarla abre la pantalla correcta.

El panel está en **Ajustes → Notificaciones push** (y en el Inicio): *Activar / Desactivar / Probar / Ver estado y preferencias*.

## Variables (Vercel → Settings → Environment Variables)
| Variable | Tipo | Nota |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | pública | Se incrusta **al compilar**: si la cambias, vuelve a desplegar. |
| `VAPID_PRIVATE_KEY` | **secreta** | Del MISMO par que la pública. No la compartas. |
| `VAPID_SUBJECT` | servidor | `mailto:tucorreo@dominio-real.com` o `https://tu-sitio.vercel.app`. **No uses `.local`/`localhost`**: Apple responde 403. |

No generes llaves nuevas si ya tienes un par: todos los dispositivos tendrían que volver a activar las notificaciones. Si no tienes `VAPID_SUBJECT` válido, el servidor usa automáticamente `https://<tu-dominio-de-Vercel>`.

## Qué se corrigió en esta versión
- `subject` VAPID inválido (el valor por defecto era `mailto:admin@puntobase.local`, que Apple rechaza) → ahora se valida y se reemplaza por la URL https de producción.
- Un push sin título/datos ya no deja de mostrarse (iOS revoca la suscripción si recibe pushes sin notificación visible).
- Tocar la notificación abre una ventana nueva si no se puede navegar en la abierta.
- Renovación automática de la suscripción (`pushsubscriptionchange`).
- Diagnóstico: plataforma, app instalada, permiso, Service Worker, servicio push (Apple/Google), llave coincidente, formato de llaves, `subject`, y pista por código de error (401/403, 413, 429, 5xx).
- Botones **Probar con la app cerrada (15 s)** y **Reparar suscripción**.
- Mensaje específico para iPhone sin instalar o con iOS anterior a 16.4.

## Interpretar el diagnóstico
| Lo que ves | Causa probable | Qué hacer |
|---|---|---|
| «Faltan las llaves VAPID» | Variable sin configurar o desplegada antes de crearla | Configúrala en Vercel y **vuelve a desplegar** |
| «llaves no coinciden» | Pública y privada de pares distintos | Usa el par correcto en las dos variables y redespliega; luego **Reparar suscripción** en cada dispositivo |
| `subject` no válido | `VAPID_SUBJECT` con `.local`, `localhost` o sin formato mailto/https | Corrígelo en Vercel |
| Prueba: «Apple rechazó… (403)» | `subject` o llaves | Igual que arriba |
| Prueba: «aceptada» pero no aparece | El permiso de iOS/Android está desactivado, modo Concentración/No molestar, o la app no está instalada (iPhone) | Revisa Ajustes del teléfono → Notificaciones → PuntoBase |
| «sin registrar ✗» | Suscripción borrada en el servidor | **Reparar suscripción** |
| Suscripciones «caducadas» (404/410) | La app se desinstaló o se revocó el permiso | Se eliminan solas; vuelve a activar |

*«Aceptada» significa que el servicio push recibió el mensaje; no garantiza que se haya mostrado.*

## Prueba física en iPhone (iOS 16.4 o superior) — **PENDIENTE: la haces tú**
1. En **Safari** abre `https://punto-base-gold.vercel.app` → **Compartir → Añadir a pantalla de inicio** → Añadir.
2. Abre PuntoBase **desde el icono** (no desde Safari). Si abres desde Safari el panel te lo dirá.
3. Ajustes → **Notificaciones push → Activar** → **Permitir**. Debe decir «Notificaciones activadas».
4. **Ver estado y preferencias**: Dispositivo «iPhone/iPad · app instalada ✓», Permiso concedido ✓, Service Worker activo ✓, Servicio push «Apple ✓», Suscripción registrada ✓.
5. Toca **Probar** con la app abierta → debe llegar la notificación.
6. Toca **Probar con la app cerrada (15 s)** y **cierra la app** (desliza hacia arriba) → debe llegar a los ~15 s.
7. Toca la notificación → abre PuntoBase en Inicio.
8. Recuperación: iPhone Ajustes → Notificaciones → PuntoBase → desactiva y vuelve a activar el permiso; en la app pulsa **Reparar suscripción** → **Probar**.

Anota fecha, modelo e iOS y toma capturas de los pasos 4 a 7: son la evidencia para tu reporte. Haz lo mismo en Android (Chrome instalado) y en computadora.

## Pruebas automáticas (qué sí está comprobado)
`tests/push-ios.test.ts` (25 pruebas) ejecuta el Service Worker real con un entorno simulado y valida: mostrar siempre la notificación, abrir la ruta correcta, respaldo si `navigate` falla, renovación de suscripción, `subject`, formato de llaves, error 403 de Apple, suscripciones caducadas, envío diferido, detección de iPhone/iPad/Android. **No sustituye la prueba en un iPhone físico.**
