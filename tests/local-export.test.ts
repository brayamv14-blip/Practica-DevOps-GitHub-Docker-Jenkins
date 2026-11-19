import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { openDb } from "@/lib/db";
import { enqueueSale } from "@/lib/offline-queue";
import { exportPendingData, getLocalStats, clearBrowserCaches } from "@/lib/local-export";
import type { CreateSaleRequest } from "@/types";

const sale = { client_sale_id: "c-1", payment_method: "cash", items: [] } as unknown as CreateSaleRequest;

describe("Almacenamiento local: estadisticas y respaldo de pendientes", () => {
  it("cuenta lo pendiente y exporta ventas sin sincronizar (sin tocar la cola)", async () => {
    const empty = await exportPendingData(new Date("2026-10-23T12:00:00Z"));
    expect(empty.counts).toEqual({ pendingSales: 0, pendingOps: 0 });

    const id = await enqueueSale(sale);
    const stats = await getLocalStats();
    expect(stats.pendingSales).toBe(1);

    const out = await exportPendingData(new Date("2026-10-23T12:00:00Z"));
    expect(out.kind).toBe("pendientes-sin-sincronizar");
    expect(out.exportedAt).toBe("2026-10-23T12:00:00.000Z");
    expect(out.pendingSales[0].localId).toBe(id);
    expect(JSON.stringify(out)).not.toMatch(/device_token|pos_device_token/);

    // Exportar no borra nada.
    expect((await getLocalStats()).pendingSales).toBe(1);
  });

  it("limpiar la cache del navegador NO borra las ventas pendientes", async () => {
    const db = await openDb();
    const before = await db.pending_sales.count();
    await clearBrowserCaches();
    expect(await db.pending_sales.count()).toBe(before);
  });
});

describe("Respaldo automatico antes de borrar datos locales (cerrar sesion)", () => {
  it("descarga un JSON con las ventas pendientes y no borra nada", async () => {
    const created: Blob[] = [];
    const clicks: string[] = [];
    const anchor = { href: "", download: "", click() { clicks.push(this.download); }, remove() {} };
    (globalThis as unknown as { document: unknown }).document = { createElement: () => anchor, body: { appendChild() {} } };
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) => { created.push(b); return "blob:x"; };
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};

    const { downloadPendingBackup } = await import("@/lib/local-export");
    const db = await openDb();
    const before = await db.pending_sales.count();
    expect(before).toBeGreaterThan(0); // la prueba anterior dejo una venta pendiente

    const total = await downloadPendingBackup(new Date("2026-11-12T12:00:00Z"));
    expect(total).toBeGreaterThanOrEqual(1);
    expect(clicks[0]).toBe("puntobase-pendientes-2026-11-12.json");
    const parsed = JSON.parse(await created[0].text());
    expect(parsed.kind).toBe("pendientes-sin-sincronizar");
    expect(parsed.pendingSales.length).toBe(before);
    expect(await db.pending_sales.count()).toBe(before);

    // Sin nada pendiente no se descarga ningun archivo.
    await db.pending_sales.clear();
    await db.pending_ops.clear();
    clicks.length = 0;
    expect(await downloadPendingBackup()).toBe(0);
    expect(clicks).toHaveLength(0);
  });
});
