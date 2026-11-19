/**
 * Roles y permisos. Funciones puras: las usan el proxy (todas las rutas /api, incluso las
 * que no se modificaron), las rutas nuevas y la interfaz.
 *
 *  - admin: todo.
 *  - employee: vender, apartar, abonar, confirmar transferencias, registrar gastos, consultar,
 *    dar de alta productos y ajustar inventario (todo queda en la bitacora). No puede editar/eliminar
 *    productos ni precios, ver costos, cerrar caja, rechazar transferencias, cancelar apartados,
 *    ver analisis/auditoria ni exportar/respaldar. Ver PERMISSION_MATRIX.
 */
export type Role = "admin" | "employee";

export function normalizeRole(value: unknown): Role {
  // Sin columna (migracion 6 pendiente) o valor desconocido: se conserva el comportamiento anterior.
  return value === "employee" ? "employee" : "admin";
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Rutas HTTP que solo puede usar un administrador. */
export function requiresAdmin(method: string, pathname: string): boolean {
  const m = method.toUpperCase();
  const p = pathname.replace(/\/+$/, "");

  // Productos: editar/eliminar el producto, sus variantes (precios) y los costos.
  if (/^\/api\/products\/(?!image$)[^/]+(\/.*)?$/.test(p) && MUTATING.has(m)) return true;
  if (p === "/api/products/cost") return true;
  // Categorias
  if (/^\/api\/categories\/[^/]+$/.test(p) && (m === "PUT" || m === "PATCH" || m === "DELETE")) return true;
  // Caja
  if (p === "/api/cash-register/close" && m === "POST") return true;
  // Equipo, configuracion, respaldo, auditoria y analisis
  if (p === "/api/devices" && MUTATING.has(m)) return true;
  if (p === "/api/store-config" && MUTATING.has(m)) return true;
  if (p === "/api/backup" || p === "/api/audit") return true;
  if (p === "/api/reports/analytics" || p === "/api/reports/export") return true;
  // Apartados: cancelar / liberar
  if (p === "/api/layaways/cancel" && m === "POST") return true;
  return false;
}

/**
 * Matriz de permisos que se muestra en Ajustes y en docs/ROLES.md.
 * `admin` y `employee`: true = puede, false = no puede, string = puede con condicion.
 */
export interface PermissionRow {
  area: string;
  action: string;
  admin: boolean | string;
  employee: boolean | string;
}

export const PERMISSION_MATRIX: PermissionRow[] = [
  { area: "Ventas", action: "Vender en el punto de venta (efectivo y transferencia)", admin: true, employee: true },
  { area: "Ventas", action: "Ver historial y comprobantes", admin: true, employee: true },
  { area: "Ventas", action: "Devolver una venta", admin: "Cualquier fecha", employee: "Solo ventas del mismo día" },
  { area: "Transferencias", action: "Confirmar transferencia recibida", admin: true, employee: true },
  { area: "Transferencias", action: "Rechazar transferencia", admin: true, employee: false },
  { area: "Apartados", action: "Crear apartados, abonar y entregar", admin: true, employee: true },
  { area: "Apartados", action: "Cancelar o liberar un apartado", admin: true, employee: false },
  { area: "Inventario", action: "Consultar productos y existencias", admin: true, employee: true },
  { area: "Inventario", action: "Dar de alta productos", admin: true, employee: true },
  { area: "Inventario", action: "Ajustar existencias (queda en bitácora)", admin: true, employee: true },
  { area: "Inventario", action: "Editar precios, variantes y categorías", admin: true, employee: false },
  { area: "Inventario", action: "Eliminar productos y categorías", admin: true, employee: false },
  { area: "Inventario", action: "Ver y editar costos", admin: true, employee: false },
  { area: "Caja", action: "Registrar gastos", admin: true, employee: true },
  { area: "Caja", action: "Cerrar caja (corte del día)", admin: true, employee: false },
  { area: "Reportes", action: "Ver reportes de ventas, gastos e inventario", admin: true, employee: true },
  { area: "Reportes", action: "Análisis de ganancias y exportar CSV", admin: true, employee: false },
  { area: "Administración", action: "Ver bitácora de actividad", admin: true, employee: false },
  { area: "Administración", action: "Crear respaldo de la información", admin: true, employee: false },
  { area: "Administración", action: "Cambiar roles y desactivar dispositivos", admin: true, employee: false },
  { area: "Administración", action: "Cambiar la configuración de la tienda", admin: true, employee: false },
];

/** Devoluciones: el administrador siempre; un empleado solo ventas del mismo dia de negocio. */
export function canReturn(role: Role, saleDay: string, today: string): boolean {
  return role === "admin" || saleDay === today;
}

/** El flujo anterior de devoluciones se retira: ahora existe /api/returns. */
export function isLegacyRefund(pathname: string): boolean {
  return /^\/api\/sales\/[^/]+\/refund\/?$/.test(pathname);
}
