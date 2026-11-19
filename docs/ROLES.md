# Roles y permisos de PuntoBase

PuntoBase tiene dos roles. El rol vive en el dispositivo (no hay usuarios con contraseña).

| Rol | Cómo se obtiene |
|---|---|
| **Administrador** | El primer dispositivo que configura la tienda. Otro administrador puede ascender a un dispositivo en *Ajustes → Dispositivos y roles*. |
| **Empleado** | Todo dispositivo que se registra después con el código de acceso. |

## Qué puede hacer cada rol

| Área | Acción | Administrador | Empleado |
|---|---|:-:|:-:|
| Ventas | Vender (efectivo y transferencia) | Sí | Sí |
| Ventas | Ver historial y comprobantes | Sí | Sí |
| Ventas | Devolver una venta | Cualquier fecha | Solo ventas del mismo día |
| Transferencias | Confirmar transferencia recibida | Sí | Sí |
| Transferencias | Rechazar transferencia | Sí | **No** |
| Apartados | Crear, abonar y entregar | Sí | Sí |
| Apartados | Cancelar o liberar | Sí | **No** |
| Inventario | Consultar y dar de alta productos | Sí | Sí |
| Inventario | Ajustar existencias (queda en bitácora) | Sí | Sí |
| Inventario | Editar precios, variantes y categorías | Sí | **No** |
| Inventario | Eliminar productos y categorías | Sí | **No** |
| Inventario | Ver y editar costos | Sí | **No** |
| Caja | Registrar gastos | Sí | Sí |
| Caja | Cerrar caja (corte del día) | Sí | **No** |
| Reportes | Reportes de ventas, gastos e inventario | Sí | Sí |
| Reportes | Análisis de ganancias y exportar CSV | Sí | **No** |
| Administración | Bitácora, respaldo, roles, dispositivos, configuración y código de acceso | Sí | **No** |

Esta tabla es la misma que ve cada persona en *Ajustes → Qué puede hacer cada rol*. Sale de una sola fuente (`PERMISSION_MATRIX` en `lib/permissions.ts`) y una prueba automática (`tests/roles.test.ts`) comprueba que coincide con las reglas del servidor.

## Dónde se aplica (defensa en capas)

1. **Servidor, `proxy.ts`**: bloquea con 403 las rutas de administrador antes de llegar a la ruta, aunque alguien llame a la API directamente.
2. **Servidor, cada ruta sensible**: vuelve a comprobar el rol (`forbidUnlessAdmin`). El rechazo de transferencias se comprueba aquí porque depende del cuerpo de la petición.
3. **Interfaz**: oculta o desactiva lo que el rol no puede hacer (botón *Rechazar*, editar/eliminar categorías y productos, costos, cierre de caja, análisis, bitácora). Es comodidad; la seguridad real está en los puntos 1 y 2.
4. **Bitácora**: cada acción relevante guarda quién la hizo y con qué rol (*Ajustes → Bitácora*, solo administrador).

## Administrar el equipo (solo administrador)

- *Ajustes → Dispositivos y roles*: **Hacer admin / Hacer empleado**, **Renombrar**, **Desactivar / Reactivar** (el acceso se pierde de inmediato).
- Siempre debe quedar **al menos un administrador activo**; el servidor lo impide (409).
- Un administrador no puede desactivarse a sí mismo desde la pantalla.
- *Ajustes → Código de acceso de la tienda*: cambia el código que piden los dispositivos nuevos. Los ya registrados siguen funcionando. El código se guarda cifrado y la bitácora registra solo que cambió, nunca su valor.

## Empleado editando un producto

Desde *Inventario → Ajustar* el empleado ve el producto en modo limitado: solo puede cambiar las **existencias** (con motivo). Nombre, precios, variantes, categoría, imagen, costos y eliminar quedan bloqueados.

## Sin la migración 6

Si la base no tiene la columna `role`, todos los dispositivos se comportan como administrador (compatibilidad). Aplica `supabase/puntobase-migration-6.sql` para activar los roles.

## Qué falta por verificar

- Probar con un **empleado real en un teléfono**: registrar un segundo dispositivo, comprobar que no ve *Rechazar*, *Análisis* ni *Bitácora*, y que la API responde 403 si se fuerza.
