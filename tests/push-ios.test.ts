import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createECDH } from "node:crypto";
import { NextRequest } from "next/server";
import { FakeDb, type UniqueRule } from "./helpers/fake-supabase";

const h = vi.hoisted(() => ({
  db: null as unknown as import("./helpers/fake-supabase").FakeDb,
  device: null as null | { id: string; name: string },
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

import webpush from "web-push";
import { hintForStatus, isValidVapidSubject, resolveVapidSubject, getVapidStatus, sendPush } from "@/lib/push";
import { normalizePushData } from "@/lib/push-payload";
import { detectPlatform, explainUnsupported, iosTooOld, pushServiceName, withTimeout } from "@/lib/push-client";

const sendMock = webpush.sendNotification as unknown as ReturnType<typeof vi.fn>;
const setVapid = webpush.setVapidDetails as unknown as ReturnType<typeof vi.fn>;
const UNIQUE: UniqueRule[] = [
  { table: "push_events", columns: ["event_key"] },
  { table: "push_subscriptions", columns: ["endpoint"] },
];
const b64 = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function pair() {
  const e = createECDH("prime256v1"); e.generateKeys();
  // web-push siempre entrega la privada en 32 bytes; Node puede omitir el cero inicial.
  const priv = Buffer.from(e.getPrivateKey().toString("hex").padStart(64, "0"), "hex");
  return { pub: b64(e.getPublicKey()), priv: b64(priv) };
}
const req = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
const sub = (over: Record<string, unknown> = {}) => ({
  device_id: "dev1", endpoint: "https://web.push.apple.com/" + Math.random().toString(36).slice(2),
  p256dh: "p".repeat(20), auth: "a".repeat(12), prefs: null, failure_count: 0, ...over,
});

const savedEnv = { ...process.env };
beforeEach(async () => {
  h.db = new FakeDb(UNIQUE);
  h.device = { id: "dev1", name: "iPhone" };
  h.afterQueue = [];
  (await import("@/lib/rate-limit")).resetRateLimits(); // el modulo vigente (otras pruebas hacen resetModules)
  sendMock.mockReset(); sendMock.mockResolvedValue({ statusCode: 201 });
  setVapid.mockReset();
  const k = pair();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = k.pub;
  process.env.VAPID_PRIVATE_KEY = k.priv;
  process.env.VAPID_SUBJECT = "mailto:dueno@ejemplo.com";
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
});
afterEach(() => { process.env = { ...savedEnv }; });

describe("VAPID: subject y formato de llaves (Apple rechaza subjects invalidos)", () => {
  it("valida subjects", () => {
    for (const ok of ["mailto:ana@ejemplo.com", "https://punto-base-gold.vercel.app"]) expect(isValidVapidSubject(ok), ok).toBe(true);
    for (const bad of ["", undefined, "mailto:admin@puntobase.local", "mailto:a@localhost", "http://sitio.com", "https://localhost:3000", "ana@ejemplo.com", "mailto:sin-arroba", "mailto:a@b.invalid"])
      expect(isValidVapidSubject(bad as string), String(bad)).toBe(false);
  });

  it("si VAPID_SUBJECT es invalido usa la URL https de produccion de Vercel", () => {
    process.env.VAPID_SUBJECT = "mailto:admin@puntobase.local";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "punto-base-gold.vercel.app";
    expect(resolveVapidSubject()).toBe("https://punto-base-gold.vercel.app");
    expect(getVapidStatus().subjectValid).toBe(true);
  });

  it("sin alternativa valida lo reporta como invalido en el diagnostico", () => {
    process.env.VAPID_SUBJECT = "mailto:admin@puntobase.local";
    expect(getVapidStatus().subjectValid).toBe(false);
    delete process.env.VAPID_SUBJECT;
    expect(getVapidStatus().subjectValid).toBe(false);
  });

  it("detecta el formato de las llaves y nunca expone la privada", () => {
    const s = getVapidStatus();
    expect(s).toMatchObject({ configured: true, keysMatch: true, publicKeyValid: true, privateKeyValid: true, subjectValid: true });
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "clave-corta";
    expect(getVapidStatus().publicKeyValid).toBe(false);
    expect(JSON.stringify(getVapidStatus())).not.toContain(process.env.VAPID_PRIVATE_KEY!);
  });

  it("sendPush firma con el subject efectivo", async () => {
    vi.resetModules();
    process.env.VAPID_SUBJECT = "mailto:admin@puntobase.local";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "punto-base-gold.vercel.app";
    h.db.seed("push_subscriptions", [sub()]);
    const fresh = await import("@/lib/push");
    await fresh.sendPush({ title: "t", body: "b" }, { category: "system" });
    expect(setVapid).toHaveBeenCalledWith("https://punto-base-gold.vercel.app", expect.any(String), expect.any(String));
  });
});

describe("Errores del servicio push de Apple", () => {
  it("403 de Apple conserva la suscripcion y explica que revisar", async () => {
    h.db.seed("push_subscriptions", [sub({ id: "s1" })]);
    sendMock.mockRejectedValue(Object.assign(new Error("BadJwtToken"), { statusCode: 403 }));
    const r = await sendPush({ title: "t", body: "b" }, { category: "system" });
    expect(r).toMatchObject({ attempted: 1, accepted: 0, failed: 1, expired: 0 });
    expect(r.errors[0].host).toBe("web.push.apple.com");
    expect(r.errors[0].hint).toMatch(/Apple.*VAPID_SUBJECT/);
    expect(h.db.rows("push_subscriptions")).toHaveLength(1);
    expect(h.db.rows("push_subscriptions")[0].last_error_status).toBe(403);
  });

  it("410 elimina solo la suscripcion caducada", async () => {
    h.db.seed("push_subscriptions", [sub({ id: "a" }), sub({ id: "b" })]);
    sendMock.mockImplementationOnce(async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); });
    const r = await sendPush({ title: "t", body: "b" }, { category: "system" });
    expect(r.expired).toBe(1);
    expect(r.accepted).toBe(1);
    expect(h.db.rows("push_subscriptions")).toHaveLength(1);
  });

  it("pistas por codigo", () => {
    expect(hintForStatus(403, "fcm.googleapis.com")).toMatch(/VAPID/);
    expect(hintForStatus(429, "x")).toMatch(/espera/i);
    expect(hintForStatus(503, "x")).toMatch(/temporal/i);
    expect(hintForStatus(null, "x")).toMatch(/respuesta/i);
    expect(hintForStatus(201, "x")).toBeUndefined();
  });
});

describe("Prueba con la app cerrada (envio diferido)", () => {
  it("responde de inmediato, limita el retardo a 20 s y envia solo despues", async () => {
    h.db.seed("push_subscriptions", [sub()]);
    const { POST } = await import("@/app/api/push/test/route");
    const res = await POST(req("/api/push/test", { delaySeconds: 999 }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ scheduled: true, delaySeconds: 20 });
    expect(sendMock).not.toHaveBeenCalled();
    expect(h.afterQueue).toHaveLength(1);
  });

  it("el envio diferido llega solo al dispositivo que lo pidio", async () => {
    vi.useFakeTimers();
    try {
      h.db.seed("push_subscriptions", [sub(), sub({ device_id: "otro" })]);
      const { POST } = await import("@/app/api/push/test/route");
      await POST(req("/api/push/test", { delaySeconds: 3 }));
      const pending = h.afterQueue[0]() as Promise<void>;
      await vi.advanceTimersByTimeAsync(3000);
      await pending;
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(sendMock.mock.calls[0][1] as string).body).toMatch(/app cerrada/);
    } finally { vi.useRealTimers(); }
  });

  it("sin delay se comporta como antes y exige sesion", async () => {
    const { POST } = await import("@/app/api/push/test/route");
    h.device = null;
    expect((await POST(req("/api/push/test", { delaySeconds: 5 }))).status).toBe(401);
  });
});

describe("Cliente: iPhone, instalacion y mensajes", () => {
  const IPHONE_17 = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
  const IPHONE_15 = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
  it("detecta iPhone, iPad (se identifica como Mac), Android y escritorio", () => {
    expect(detectPlatform(IPHONE_17, true)).toMatchObject({ os: "ios", standalone: true, iosVersion: 17.04 });
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", false, "MacIntel", 5).os).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", false, "MacIntel", 0).os).toBe("desktop");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 7)", false).os).toBe("android");
  });
  it("iPhone sin instalar: explica como instalarla; iOS viejo: pide actualizar", () => {
    expect(explainUnsupported(detectPlatform(IPHONE_17, false))).toMatch(/Añadir a pantalla de inicio/);
    const old = detectPlatform(IPHONE_15, true);
    expect(iosTooOld(old)).toBe(true);
    expect(explainUnsupported(old)).toMatch(/16\.4/);
    expect(iosTooOld(detectPlatform(IPHONE_17, true))).toBe(false);
  });
  it("nombra el servicio push y no se cuelga esperando al Service Worker", async () => {
    expect(pushServiceName("web.push.apple.com")).toBe("Apple");
    expect(pushServiceName("fcm.googleapis.com")).toBe("Google (FCM)");
    await expect(withTimeout(new Promise(() => {}), 20, "sin SW")).rejects.toThrow("sin SW");
    await expect(withTimeout(Promise.resolve(7), 20, "x")).resolves.toBe(7);
  });
});

describe("normalizePushData: un push siempre produce una notificacion visible", () => {
  it("usa valores por defecto con datos faltantes o corruptos", () => {
    for (const bad of [null, undefined, "texto", 5, {}, { title: "" }, { title: 42, body: {} }])
      expect(normalizePushData(bad)).toMatchObject({ title: expect.stringMatching(/\S/), url: "/dashboard" });
  });
  it("solo acepta rutas internas y recorta textos", () => {
    expect(normalizePushData({ url: "https://malo.com" }).url).toBe("/dashboard");
    expect(normalizePushData({ url: "//malo.com" }).url).toBe("/dashboard");
    expect(normalizePushData({ url: "/transfers", title: "T", body: "x".repeat(1000), tag: "k" }))
      .toMatchObject({ url: "/transfers", title: "T", tag: "k" });
    expect(normalizePushData({ body: "x".repeat(1000) }).body.length).toBe(300);
  });
});

// ── El Service Worker real, ejecutado con un entorno simulado ───────────────
describe("Service Worker (worker/index.ts)", () => {
  type Handler = (e: unknown) => void;
  let handlers: Record<string, Handler>;
  let shown: { title: string; options?: Record<string, unknown> }[];
  let opened: string[];
  let subscribeCalls: unknown[];

  beforeEach(async () => {
    handlers = {}; shown = []; opened = []; subscribeCalls = [];
    vi.resetModules();
    const fakeSelf = {
      addEventListener: (type: string, fn: Handler) => { handlers[type] = fn; },
      registration: {
        showNotification: async (title: string, options?: Record<string, unknown>) => { shown.push({ title, options }); },
        pushManager: {
          getSubscription: async () => null,
          subscribe: async (o: unknown) => { subscribeCalls.push(o); return { toJSON: () => ({ endpoint: "https://web.push.apple.com/nuevo", keys: { p256dh: "p", auth: "a" } }) }; },
        },
      },
      clients: { matchAll: async () => [] as unknown[], openWindow: async (u: string) => { opened.push(u); } },
      location: { origin: "https://app.test" },
    };
    vi.stubGlobal("self", fakeSelf);
    await import("../worker/index");
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const run = async (type: string, event: Record<string, unknown>) => {
    let p: Promise<unknown> = Promise.resolve();
    handlers[type]({ ...event, waitUntil: (x: Promise<unknown>) => { p = x; } });
    await p;
  };

  it("registra los manejadores de push, clic, renovacion y sync", () => {
    for (const t of ["push", "notificationclick", "pushsubscriptionchange", "sync"]) expect(handlers[t], t).toBeTypeOf("function");
  });

  it("muestra la notificacion con el titulo y la ruta recibidos", async () => {
    await run("push", { data: { json: () => ({ title: "Transferencia", body: "Por confirmar", url: "/transfers", tag: "t1" }), text: () => "" } });
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("Transferencia");
    expect(shown[0].options).toMatchObject({ body: "Por confirmar", tag: "t1", data: { url: "/transfers" } });
  });

  it("aunque el mensaje venga vacio o sea texto plano, SIEMPRE muestra una notificacion", async () => {
    await run("push", { data: null });
    await run("push", { data: { json: () => { throw new Error("no es json"); }, text: () => "Hola" } });
    await run("push", { data: { json: () => ({ title: 7, url: "https://malo.com" }), text: () => "" } });
    expect(shown).toHaveLength(3);
    expect(shown.every((n) => n.title.length > 0)).toBe(true);
    expect(shown[1].options?.body).toBe("Hola");
    expect(shown[2].options).toMatchObject({ data: { url: "/dashboard" } });
  });

  it("si showNotification falla con opciones, reintenta con un aviso minimo", async () => {
    let calls = 0;
    (self as unknown as { registration: { showNotification: unknown } }).registration.showNotification = async (title: string, o?: Record<string, unknown>) => {
      calls++; if (calls === 1) throw new Error("icono invalido"); shown.push({ title, options: o });
    };
    await run("push", { data: { json: () => ({ title: "X", body: "y" }), text: () => "" } });
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("PuntoBase");
  });

  it("al tocar la notificacion abre la ruta correcta", async () => {
    const close = vi.fn();
    await run("notificationclick", { notification: { close, data: { url: "/transfers" } } });
    expect(close).toHaveBeenCalled();
    expect(opened).toEqual(["https://app.test/transfers"]);
  });

  it("si navegar en la ventana abierta falla (iOS), abre una ventana nueva", async () => {
    (self as unknown as { clients: { matchAll: unknown } }).clients.matchAll = async () => [
      { url: "https://app.test/pos", focus: async () => {}, navigate: async () => { throw new Error("no se puede navegar"); }, postMessage() {} },
    ];
    await run("notificationclick", { notification: { close() {}, data: { url: "/dashboard" } } });
    expect(opened).toEqual(["https://app.test/dashboard"]);
  });

  it("con la app abierta enfoca y navega sin abrir otra ventana; ignora rutas externas", async () => {
    const nav = vi.fn(async () => {});
    (self as unknown as { clients: { matchAll: unknown } }).clients.matchAll = async () => [
      { url: "https://app.test/pos", focus: async () => {}, navigate: nav, postMessage() {} },
    ];
    await run("notificationclick", { notification: { close() {}, data: { url: "https://malo.com/x" } } });
    expect(nav).toHaveBeenCalledWith("https://app.test/dashboard");
    expect(opened).toEqual([]);
  });

  it("al renovarse la suscripcion se vuelve a suscribir con la misma llave y se registra en el servidor", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const key = new Uint8Array([4, 1, 2, 3]).buffer;
    await run("pushsubscriptionchange", { oldSubscription: { options: { applicationServerKey: key } } });
    expect(subscribeCalls).toEqual([{ userVisibleOnly: true, applicationServerKey: key }]);
    expect(fetchMock).toHaveBeenCalledWith("/api/push/subscribe", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.endpoint).toBe("https://web.push.apple.com/nuevo");
  });

  it("sin la llave anterior no inventa una: espera a que la app lo renueve", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await run("pushsubscriptionchange", { oldSubscription: null });
    expect(subscribeCalls).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
