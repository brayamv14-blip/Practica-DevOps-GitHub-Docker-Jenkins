# PuntoBase — Manual de usuario

## 1. Instalar la app
- **Android (Chrome):** abre el sitio → menú ⋮ → «Instalar aplicación».
- **iPhone (Safari):** abre el sitio → Compartir → «Agregar a pantalla de inicio». Las notificaciones solo funcionan con la app instalada (iOS 16.4 o mayor).
- **Computadora (Chrome/Edge):** icono de instalar en la barra de direcciones.

## 2. Primer uso
| Situación | Qué hacer |
|---|---|
| Tienda nueva | Escribe tu nombre y crea el código de acceso (mín. 6 caracteres). Este dispositivo queda como **Administrador**. |
| Dispositivo adicional | Escribe tu nombre y el código de la tienda. Entra como **Empleado**. |
Se necesita internet solo para registrar el dispositivo.

## 3. Roles
| Función | Administrador | Empleado |
|---|:-:|:-:|
| Vender, cobrar, imprimir ticket | ✔ | ✔ |
| Ver inventario y ajustar existencias | ✔ | ✔ |
| Crear/editar/eliminar productos y categorías | ✔ | ✖ |
| Devoluciones del día | ✔ | ✔ |
| Gastos, apartados, cierre de caja | ✔ | ✔ |
| Confirmar transferencia | ✔ | ✔ |
| Rechazar transferencia | ✔ | ✖ |
| Análisis, Bitácora, Reportes completos | ✔ | ✖ |
| Cambiar roles / renombrar dispositivos / código de acceso | ✔ | ✖ |
Detalle completo: `docs/ROLES.md` (también visible en Ajustes).

## 4. Módulos
- **Inicio:** ventas del día, alertas de stock bajo, pendientes de sincronizar.
- **Vender (POS):** busca o escanea el producto → agrega al carrito → elige efectivo o transferencia → Cobrar → ticket. Sin internet la venta se guarda en el dispositivo.
- **Inventario:** lista de productos con etiqueta de stock; el administrador crea/edita (variantes, imagen, código QR); el empleado solo ajusta existencias.
- **Existencias / Transferencias:** movimientos y confirmación de pagos por transferencia.
- **Apartados:** anticipo, saldo y fecha; el sistema recuerda los vencidos.
- **Gastos:** registro por categoría.
- **Cierre de caja:** cuenta lo esperado contra lo contado; no permite cerrar dos veces.
- **Reportes:** ventas por rango de fechas, devoluciones descontadas, exportar CSV/PDF.
- **Análisis y Bitácora (admin):** indicadores y registro de quién hizo qué.
- **Ajustes:** notificaciones, permisos, código de acceso, almacenamiento y respaldo.

## 5. Sin conexión
1. Vende normal; aparece «Pendientes».
2. Al volver internet se sincroniza solo, o usa «Sincronizar ahora».
3. Cada venta se envía **una sola vez** (no se duplica aunque reintente).
4. **No cierres sesión con pendientes:** la app descarga un respaldo `.json` antes y se detiene si no puede.

## 6. Notificaciones
Ajustes → Notificaciones → Activar → Probar. En iPhone, instala primero la app. Si falla, usa «Reparar» y revisa `docs/NOTIFICACIONES.md`.

## 7. Problemas frecuentes
| Síntoma | Solución |
|---|---|
| «Hay una nueva versión» | Pulsa Actualizar. |
| Venta pendiente no sube | Revisa internet → Sincronizar ahora; si hay conflicto de stock, aparece marcada para atención. |
| Olvidé el código | Un administrador lo cambia en Ajustes. |
| Sin notificaciones en iPhone | App instalada, iOS ≥ 16.4, permiso concedido en Ajustes de iOS. |
