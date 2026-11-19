import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { FakeDb, type UniqueRule } from "./helpers/fake-supabase";

const h = vi.hoisted(() => ({
  db: null as unknown as import("./helpers/fake-supabase").FakeDb,
  device: null as null | { id: string; name: string; role?: string },
  afterQueue: [] as (() => unknown)[],
}));

vi.mock("@/lib/supabase/server", () => ({ supabase: { from: (t: string) => h.db.from(t) } }));
vi.mock("@/lib/auth", () => ({
  getDeviceFromCookies: async () => h.device,
  deviceCookieOptions: () => ({}),
  COOKIE_NAME: "pos_device_token",
}));
vi.mock("next/server", async (orig) => {
  const actual = await orig<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => void h.afterQueue.push(fn) };
});
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));

const UNIQUE: UniqueRule[] = [
  { table: "sales", columns: ["sale_number"] },
  { table: "sales", columns: ["client_sale_id"], partial: true },
  { table: "sale_returns", columns: ["client_op_id"], partial: true },
  { table: "push_events", columns: ["event_key"] },
];
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": "7.7.7.7" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const runAfter = async () => { for (const fn of h.afterQueue.splice(0)) await fn(); };
const stock = () => Number(h.db.rows("product_variants")[0].stock_qty);

beforeEach(async () => {
  h.db = new FakeDb(UNIQUE);
  h.db.defaults = { sales: { needs_attention: false } };
  h.device = { id: "dev1", name: "Caja 1", role: "employee" };
  h.afterQueue = [];
  (await import("@/lib/rate-limit")).resetRateLimits();
  h.db.seed("products", [{ id: "p1", name: "Playera", track_stock: true, is_active: true }]);
  h.db.seed("product_variants", [{ id: "v1", product_id: "p1", size_label: "", price: 100, cost: 40, stock_qty: 10, low_stock_threshold: 1 }]);
});

describe("Proceso completo: vender -> ticket -> historial -> reporte -> devolver", () => {
  it("las cifras cuadran en cada paso y la venta original nunca se borra", async () => {
    const { POST: sell } = await import("@/app/api/sales/route");
    const { GET: ticket } = await import("@/app/api/sales/[id]/route");
    const { GET: report } = await import("@/app/api/reports/sales/route");
    const { POST: giveBack } = await import("@/app/api/returns/route");

    // 1) Venta (un empleado puede vender)
    const res = await sell(req("/api/sales", "POST", {
      client_sale_id: "LOCAL-P1",
      payment_method: "cash",
      items: [{ item_type: "product", product_id: "p1", variant_id: "v1", description: "Playera", unit_price: 100, qty: 3 }],
    }));
    expect(res.status).toBe(201);
    expect(stock()).toBe(7);
    const sale = h.db.rows("sales")[0];
    expect(Number(sale.total)).toBe(300);

    // 2) Ticket: mismos datos que la venta
    const t = await (await ticket(req(`/api/sales/${sale.id}`, "GET"), { params: Promise.resolve({ id: String(sale.id) }) })).json();
    expect(t.sale_number).toBe(sale.sale_number);
    expect(Number(t.total)).toBe(300);
    expect(t.items).toHaveLength(1);
    expect(Number(t.items[0].qty)).toBe(3);

    // 3) Historial / reporte
    let r = await (await report(req("/api/reports/sales", "GET"))).json();
    expect(r).toMatchObject({ gross_revenue: 300, net_revenue: 300, cash_revenue: 300, transaction_count: 1, returns_total: 0 });

    // 4) Reintentar el mismo envio no duplica nada
    const retry = await sell(req("/api/sales", "POST", {
      client_sale_id: "LOCAL-P1",
      payment_method: "cash",
      items: [{ item_type: "product", product_id: "p1", variant_id: "v1", description: "Playera", unit_price: 100, qty: 3 }],
    }));
    expect([200, 201]).toContain(retry.status);
    expect(h.db.rows("sales")).toHaveLength(1);
    expect(stock()).toBe(7);

    // 5) Devolucion parcial (mismo dia: el empleado puede)
    const item = h.db.rows("sale_items")[0];
    const back = await giveBack(req("/api/returns", "POST", {
      sale_id: sale.id, reason: "Talla incorrecta", client_op_id: "R-1", items: [{ sale_item_id: item.id, qty: 1 }],
    }));
    expect(back.status).toBe(201);
    expect(stock()).toBe(8);
    expect(h.db.rows("sales")).toHaveLength(1);
    expect(h.db.rows("sale_items")).toHaveLength(1);

    r = await (await report(req("/api/reports/sales", "GET"))).json();
    expect(r).toMatchObject({ gross_revenue: 300, returns_total: 100, net_revenue: 200, cash_revenue: 200, returns_count: 1 });

    // 6) No se puede devolver mas de lo vendido (quedan 2 por devolver)
    const tooMuch = await giveBack(req("/api/returns", "POST", {
      sale_id: sale.id, reason: "Otra", client_op_id: "R-2", items: [{ sale_item_id: item.id, qty: 3 }],
    }));
    expect(tooMuch.status).toBeGreaterThanOrEqual(400);
    expect(stock()).toBe(8);
    await runAfter();
  });

  it("no se vende mas de lo que hay y no se aceptan cantidades invalidas", async () => {
    const { POST: sell } = await import("@/app/api/sales/route");
    const body = (qty: number) => ({
      payment_method: "cash",
      items: [{ item_type: "product", product_id: "p1", variant_id: "v1", description: "Playera", unit_price: 100, qty }],
    });
    expect((await sell(req("/api/sales", "POST", body(11)))).status).toBe(409);
    for (const bad of [0, -2, 1.5, Number.NaN]) {
      expect((await sell(req("/api/sales", "POST", body(bad)))).status, `qty=${bad}`).toBeGreaterThanOrEqual(400);
    }
    expect(h.db.rows("sales")).toHaveLength(0);
    expect(stock()).toBe(10);
  });

  it("sin sesion ninguna de estas rutas responde datos", async () => {
    h.device = null;
    const { POST: sell } = await import("@/app/api/sales/route");
    const { GET: report } = await import("@/app/api/reports/sales/route");
    expect((await sell(req("/api/sales", "POST", {}))).status).toBe(401);
    expect((await report(req("/api/reports/sales", "GET"))).status).toBe(401);
  });
});

describe("Los errores de la base de datos no se filtran al cliente", () => {
  const SECRETO = 'relation "public.products" violates constraint "products_barcode_key" (columna interna)';

  it("GET /api/products, /api/categories y /api/expenses responden un mensaje general y lo detallado solo se registra", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    h.db.failOn = () => ({ message: SECRETO, code: "XX000" });
    const { GET: products } = await import("@/app/api/products/route");
    const { GET: categories } = await import("@/app/api/categories/route");
    const { GET: expenses } = await import("@/app/api/expenses/route");
    for (const [name, call] of [
      ["products", () => products(req("/api/products", "GET"))],
      ["categories", () => categories()],
      ["expenses", () => expenses(req("/api/expenses", "GET"))],
    ] as const) {
      const res = await call();
      const text = await res.text();
      expect(res.status, name).toBe(500);
      expect(text, name).not.toMatch(/relation|constraint|public\.|products_barcode_key|interna/);
      expect(JSON.parse(text).error, name).toMatch(/No se pudo completar/);
    }
    expect(log).toHaveBeenCalled(); // el detalle queda en el registro del servidor
    log.mockRestore();
    h.db.failOn = null;
  });
});
