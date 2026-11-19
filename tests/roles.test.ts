import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { FakeDb } from "./helpers/fake-supabase";

const h = vi.hoisted(() => ({
  db: null as unknown as import("./helpers/fake-supabase").FakeDb,
  device: null as null | { id: string; name: string; role?: string },
  afterQueue: [] as (() => unknown)[],
}));

vi.mock("@/lib/supabase/server", () => ({ supabase: { from: (t: string) => h.db.from(t) } }));
vi.mock("@/lib/auth", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth")>();
  return { ...actual, getDeviceFromCookies: async () => h.device };
});
vi.mock("next/server", async (orig) => {
  const actual = await orig<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => void h.afterQueue.push(fn) };
});
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));

import { PERMISSION_MATRIX, requiresAdmin } from "@/lib/permissions";
import { POST as transfersPost } from "@/app/api/transfers/route";
import { PUT as storePut } from "@/app/api/store-config/route";
import { POST as setupPost } from "@/app/api/setup/route";

const R = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const runAfter = async () => { for (const fn of h.afterQueue.splice(0)) await fn(); };

const EMP = { id: "e1", name: "Empleado", role: "employee" };
const ADM = { id: "a1", name: "Admin", role: "admin" };

beforeEach(() => {
  h.db = new FakeDb();
  h.device = ADM;
  h.afterQueue = [];
});

/** Cada fila de la matriz que se aplica por ruta HTTP, con la peticion que la representa. */
const ROUTE_FOR_ACTION: Record<string, [string, string] | null> = {
  "Cancelar o liberar un apartado": ["POST", "/api/layaways/cancel"],
  "Editar precios, variantes y categorías": ["PUT", "/api/products/abc/variants/v1"],
  "Eliminar productos y categorías": ["DELETE", "/api/products/abc"],
  "Ver y editar costos": ["PATCH", "/api/products/cost"],
  "Cerrar caja (corte del día)": ["POST", "/api/cash-register/close"],
  "Análisis de ganancias y exportar CSV": ["GET", "/api/reports/analytics"],
  "Ver bitácora de actividad": ["GET", "/api/audit"],
  "Crear respaldo de la información": ["GET", "/api/backup"],
  "Cambiar roles y desactivar dispositivos": ["PATCH", "/api/devices"],
  "Cambiar la configuración de la tienda": ["PUT", "/api/store-config"],
};

describe("Matriz de permisos: la pantalla, el proxy y la documentacion dicen lo mismo", () => {
  it("toda fila que el empleado NO puede y que se aplica por ruta esta protegida en el proxy", () => {
    for (const [action, route] of Object.entries(ROUTE_FOR_ACTION)) {
      const row = PERMISSION_MATRIX.find((r) => r.action === action);
      expect(row, `fila faltante: ${action}`).toBeDefined();
      expect(row!.employee).toBe(false);
      expect(row!.admin).toBe(true);
      expect(requiresAdmin(route![0], route![1]), action).toBe(true);
    }
  });

  it("las acciones permitidas al empleado no quedan bloqueadas por el proxy", () => {
    const allowed: [string, string][] = [
      ["POST", "/api/sales"], ["POST", "/api/products"], ["POST", "/api/stock/adjust"],
      ["POST", "/api/layaways"], ["POST", "/api/layaways/pay"], ["POST", "/api/layaways/deliver"],
      ["POST", "/api/expenses"], ["POST", "/api/returns"], ["GET", "/api/reports/sales"],
      ["POST", "/api/products/image"],
    ];
    for (const [m, p] of allowed) expect(requiresAdmin(m, p), `${m} ${p}`).toBe(false);
  });

  it("no hay filas duplicadas ni vacias", () => {
    const keys = PERMISSION_MATRIX.map((r) => `${r.area}|${r.action}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(PERMISSION_MATRIX.every((r) => r.area && r.action)).toBe(true);
  });
});

describe("Transferencias: solo el administrador puede rechazar", () => {
  const seedSale = () =>
    h.db.seed("sales", [{ id: "s1", total: 50, payment_method: "bank_transfer", payment_status: "pending" }]);

  it("un empleado recibe 403 al rechazar y la venta sigue pendiente", async () => {
    seedSale();
    h.device = EMP;
    const res = await transfersPost(R("/api/transfers", "POST", { id: "s1", action: "reject", reason: "x" }));
    expect(res.status).toBe(403);
    expect(h.db.rows("sales")[0].payment_status).toBe("pending");
  });

  it("un empleado SI puede confirmar el pago", async () => {
    seedSale();
    h.device = EMP;
    const res = await transfersPost(R("/api/transfers", "POST", { id: "s1" }));
    expect(res.status).toBe(200);
    expect(h.db.rows("sales")[0].payment_status).toBe("paid");
    await runAfter();
  });

  it("sin sesion responde 401", async () => {
    seedSale();
    h.device = null;
    expect((await transfersPost(R("/api/transfers", "POST", { id: "s1", action: "reject" }))).status).toBe(401);
  });
});

describe("Codigo de acceso de la tienda", () => {
  it("un empleado no puede cambiarlo", async () => {
    h.db.seed("store_config", [{ id: 1, access_code: "hash", setup_complete: true }]);
    h.device = EMP;
    expect((await storePut(R("/api/store-config", "PUT", { new_access_code: "nuevo-123456" }))).status).toBe(403);
    expect(h.db.rows("store_config")[0].access_code).toBe("hash");
  });

  it("el administrador lo cambia (se guarda cifrado) y la bitacora no contiene el codigo", async () => {
    h.db.seed("store_config", [{ id: 1, access_code: "hash", setup_complete: true }]);
    const res = await storePut(R("/api/store-config", "PUT", { new_access_code: "nuevo-123456" }));
    expect(res.status).toBe(200);
    const saved = String(h.db.rows("store_config")[0].access_code);
    expect(saved).not.toBe("nuevo-123456");
    expect(saved.startsWith("$2")).toBe(true);
    const log = h.db.rows("audit_log").find((r) => r.action === "store.update");
    expect(log).toBeDefined();
    expect(JSON.stringify(log)).not.toContain("nuevo-123456");
  });

  it("rechaza codigos de menos de 6 caracteres", async () => {
    h.db.seed("store_config", [{ id: 1, access_code: "hash", setup_complete: true }]);
    expect((await storePut(R("/api/store-config", "PUT", { new_access_code: "123" }))).status).toBe(400);
  });
});

describe("Registro de dispositivos", () => {
  it("el primero es administrador y los siguientes entran como empleado; mensajes en espanol", async () => {
    const r1 = await setupPost(R("/api/setup", "POST", { name: "Dueña", access_code: "codigo-seguro" }));
    expect(r1.status).toBe(200);
    expect(h.db.rows("devices")[0].role).toBe("admin");

    const r2 = await setupPost(R("/api/setup", "POST", { name: "Cajero", access_code: "codigo-seguro" }));
    expect(r2.status).toBe(200);
    expect(h.db.rows("devices")[1].role).toBe("employee");

    const bad = await setupPost(R("/api/setup", "POST", { name: "Intruso", access_code: "incorrecto" }));
    expect(bad.status).toBe(401);
    expect((await bad.json()).error).toBe("Código de acceso incorrecto.");
    expect(h.db.rows("devices")).toHaveLength(2);

    const missing = await setupPost(R("/api/setup", "POST", { name: "", access_code: "x" }));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toMatch(/Faltan datos/);
  });
});
