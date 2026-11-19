
// Servidor falso con la forma minima de la API REST de Supabase (PostgREST).
// Solo sirve para las pruebas del navegador: permite abrir la app SIN una base real.
// - Tabla "devices": devuelve un dispositivo administrador activo.
// - Cualquier otra tabla: lista vacia. Escrituras: aceptadas sin guardar nada.

import http from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEVICE = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Caja E2E",
  role: "admin",
  is_active: true,
  device_token: "e2e-token",
  last_seen_at: null,
  created_at: new Date().toISOString(),
};

// Datos de ejemplo (solo si STUB_DATA=1).
const NOW = new Date().toISOString();
const LONG = "Playera de algodón orgánico manga larga edición especial aniversario";

const VARIANTS = [
  { id: "v1", product_id: "p1", size_label: "Chica", price: 199.5, stock_qty: 12, low_stock_threshold: 3, cost: 90 },
  { id: "v2", product_id: "p1", size_label: "Grande extra grande", price: 219, stock_qty: 2, low_stock_threshold: 3, cost: 95 },
  { id: "v3", product_id: "p2", size_label: "", price: 45, stock_qty: 0, low_stock_threshold: 5, cost: 20 },
];

const PRODUCTS = [
  {
    id: "p1",
    name: LONG,
    category: "Ropa",
    barcode: "7501000000012",
    image_url: null,
    track_stock: true,
    is_active: true,
    low_stock_alert_enabled: true,
    created_at: NOW,
    variants: VARIANTS.slice(0, 2),
    product_variants: VARIANTS.slice(0, 2),
  },
  {
    id: "p2",
    name: "Café",
    category: "Bebidas",
    barcode: "7501000000029",
    image_url: null,
    track_stock: true,
    is_active: true,
    low_stock_alert_enabled: true,
    created_at: NOW,
    variants: [VARIANTS[2]],
    product_variants: [VARIANTS[2]],
  },
];

const ITEMS = [
  {
    id: "i1",
    sale_id: "s1",
    item_type: "product",
    product_id: "p1",
    variant_id: "v1",
    description: LONG + " (Chica)",
    unit_price: 199.5,
    qty: 2,
    subtotal: 399,
    line_total: 399,
  },
];

const SALES = [
  {
    id: "s1",
    sale_number: 1001,
    total: 399,
    subtotal: 399,
    discount: 0,
    payment_method: "cash",
    payment_status: "paid",
    created_at: NOW,
    customer: { name: "María Fernanda de los Ángeles Ramírez" },
    items: ITEMS,
    sale_items: ITEMS,
    device: { name: "Caja E2E" },
  },
  {
    id: "s2",
    sale_number: 1002,
    total: 219,
    subtotal: 219,
    discount: 0,
    payment_method: "bank_transfer",
    payment_status: "pending",
    created_at: NOW,
    customer: null,
    items: ITEMS,
    sale_items: ITEMS,
    device: { name: "Caja E2E" },
  },
];

const FIXTURES = {
  products: PRODUCTS,
  product_variants: VARIANTS.map((v) => ({
    ...v,
    product: PRODUCTS.find((p) => p.id === v.product_id),
  })),
  categories: [
    { id: "c1", name: "Ropa", is_active: true },
    { id: "c2", name: "Bebidas", is_active: true },
  ],
  sales: SALES,
  sale_items: ITEMS,
  expenses: [
    {
      id: "e1",
      amount: 150.75,
      description: "Bolsas y etiquetas para mostrador y empaque de pedidos grandes",
      category: "Insumos",
      created_at: NOW,
    },
  ],
  layaways: [
    {
      id: "l1",
      folio: "AP-0001",
      total: 500,
      paid: 100,
      status: "active",
      due_date: NOW,
      customer_name: "Juan Pérez",
      created_at: NOW,
      items: [],
      layaway_items: [],
      payments: [],
      layaway_payments: [],
    },
  ],
  customers: [
    { id: "u1", name: "María Fernanda de los Ángeles Ramírez", phone: "5555555555" },
  ],
  audit_log: [
    {
      id: "a1",
      action: "sale.create",
      device_name: "Caja E2E",
      role: "admin",
      entity: "sale",
      entity_id: "s1",
      details: {},
      created_at: NOW,
    },
  ],
  store_config: [
    { id: 1, store_name: "Mi Tienda de Prueba", setup_complete: true },
  ],
};

export function startStub(port = 54321) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    const table = url.pathname.replace("/rest/v1/", "").split("/")[0];

    const wantsObject = String(req.headers.accept ?? "").includes(
      "vnd.pgrst.object",
    );

    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };

    req.resume();

    req.on("end", () => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        return send(req.method === "POST" ? 201 : 204);
      }

      if (table === "devices") {
        return wantsObject ? send(200, DEVICE) : send(200, [DEVICE]);
      }

      if (process.env.STUB_DATA === "1" && FIXTURES[table]) {
        const rows = FIXTURES[table];
        return wantsObject ? send(200, rows[0]) : send(200, rows);
      }

      if (wantsObject) {
        return send(406, {
          code: "PGRST116",
          message: "no rows",
          details: null,
          hint: null,
        });
      }

      return send(200, []);
    });
  });

  return new Promise((resolveServer, reject) => {
    server.once("error", reject);

    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolveServer(server);
    });
  });
}

// Inicio correcto tanto en Windows como en otras plataformas.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.STUB_PORT ?? 54321);

  await startStub(port);

  console.log(`Stub de Supabase en http://127.0.0.1:${port}`);
}
