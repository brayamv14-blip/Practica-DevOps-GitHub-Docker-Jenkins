"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import {
  detectPlatform,
  explainUnsupported,
  hostOfEndpoint,
  iosTooOld,
  pushServiceName,
  withTimeout,
  type PushPlatform,
} from "@/lib/push-client";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

type Prefs = { stock: boolean; transfers: boolean; sales: boolean; sync: boolean; cash: boolean };

const PREF_LABELS: Record<keyof Prefs, string> = {
  stock: "Inventario bajo / agotado",
  transfers: "Transferencias",
  sales: "Ventas registradas",
  sync: "Errores de sincronización",
  cash: "Faltantes en el corte",
};

interface Diagnostics {
  vapid: {
    configured: boolean;
    keysMatch: boolean | null;
    publicKeyValid?: boolean | null;
    privateKeyValid?: boolean | null;
    subjectValid?: boolean;
  };
  endpointHost?: string | null;
  subscriptions: { total: number; thisDevice: number };
  registered: boolean;
  prefs: Prefs | null;
  health: { failureCount: number; lastSuccessAt: string | null; lastErrorStatus: number | null } | null;
}

interface TestReport {
  attempted: number;
  accepted: number;
  expired: number;
  failed: number;
  errors: { host: string; status: number | null; message: string; hint?: string }[];
  scheduled?: boolean;
  delaySeconds?: number;
}

/** Espera al Service Worker, pero no se queda colgado si no esta activo. */
function readyWithTimeout(): Promise<ServiceWorkerRegistration> {
  return withTimeout(
    navigator.serviceWorker.ready,
    8000,
    "El Service Worker no está activo. Recarga la aplicación (en desarrollo no hay Service Worker)."
  );
}

interface LocalChecks {
  permission: NotificationPermission;
  serviceWorker: boolean;
  subscription: boolean;
  endpointHost: string | null;
  keyMatches: boolean | null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** Compara la clave con la que se creo la suscripcion con la clave publica actual. */
function sameKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true; // el navegador no la expone: no se puede comparar
  const expected = urlBase64ToUint8Array(publicKey);
  const actual = new Uint8Array(current);
  return expected.length === actual.length && expected.every((b, i) => b === actual[i]);
}

async function saveSubscription(subscription: PushSubscription): Promise<boolean> {
  const res = await apiFetch("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify(subscription.toJSON()),
  });
  return res.ok;
}

export function PushToggle() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [report, setReport] = useState<TestReport | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [platform, setPlatform] = useState<PushPlatform | null>(null);
  const [local, setLocal] = useState<LocalChecks | null>(null);

  const loadDiagnostics = useCallback(async (endpoint?: string) => {
    try {
      const res = await apiFetch("/api/push/status", {
        method: "POST",
        body: JSON.stringify({ endpoint }),
      });
      if (res.ok) setDiag((await res.json()) as Diagnostics);
    } catch {
      // sin conexion: se conserva el ultimo diagnostico
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      setPlatform(detectPlatform(navigator.userAgent, standalone, navigator.platform, navigator.maxTouchPoints));
      const ok =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!ok) {
        setSupported(false);
        return;
      }
      setPermission(Notification.permission);
      setSupported(true);

      try {
        const registration = await readyWithTimeout();
        let subscription = await registration.pushManager.getSubscription();

        // Si la suscripcion se creo con otra clave VAPID, nunca recibira avisos: se renueva.
        if (subscription && PUBLIC_KEY && !sameKey(subscription, PUBLIC_KEY)) {
          await subscription.unsubscribe();
          subscription = null;
        }
        setSubscribed(subscription !== null);
        setLocal({
          permission: Notification.permission,
          serviceWorker: true,
          subscription: subscription !== null,
          endpointHost: subscription ? hostOfEndpoint(subscription.endpoint) : null,
          keyMatches: subscription && PUBLIC_KEY ? sameKey(subscription, PUBLIC_KEY) : null,
        });

        if (subscription && navigator.onLine) {
          await loadDiagnostics(subscription.endpoint);
        } else if (navigator.onLine) {
          await loadDiagnostics();
        }
      } catch {
        // sin Service Worker activo (modo desarrollo)
        setLocal({ permission: Notification.permission, serviceWorker: false, subscription: false, endpointHost: null, keyMatches: null });
      }
    })();
  }, [loadDiagnostics]);

  // Autocuracion: si el navegador tiene suscripcion pero el servidor no (p. ej. se purgo), se vuelve a registrar.
  useEffect(() => {
    if (!subscribed || !diag || diag.registered || !navigator.onLine) return;
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription && (await saveSubscription(subscription))) {
          await loadDiagnostics(subscription.endpoint);
        }
      } catch {
        // se reintentara al abrir de nuevo el panel
      }
    })();
  }, [subscribed, diag, loadDiagnostics]);

  async function enable() {
    if (!PUBLIC_KEY) return;
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        toast.error("No se concedió el permiso de notificaciones.");
        return;
      }

      const registration = await readyWithTimeout();
      const existing = await registration.pushManager.getSubscription();
      if (existing && !sameKey(existing, PUBLIC_KEY)) await existing.unsubscribe();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) as BufferSource,
      });

      if (!(await saveSubscription(subscription))) throw new Error("No se pudo guardar la suscripción");

      setSubscribed(true);
      await loadDiagnostics(subscription.endpoint);
      toast.success("Notificaciones activadas.");
    } catch (error) {
      console.error("[push] activación:", error);
      toast.error("No se pudieron activar las notificaciones. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  /** Crea una suscripcion nueva (misma llave VAPID) y la registra; no cambia las llaves ni borra datos del servidor. */
  async function repair() {
    if (!PUBLIC_KEY) return;
    setBusy(true);
    try {
      if (Notification.permission !== "granted") {
        toast.error("Primero concede el permiso de notificaciones en los ajustes del dispositivo.");
        return;
      }
      const registration = await readyWithTimeout();
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await apiFetch("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: existing.endpoint }) }).catch(() => null);
        await existing.unsubscribe();
      }
      const fresh = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) as BufferSource,
      });
      if (!(await saveSubscription(fresh))) throw new Error("No se pudo guardar la suscripción");
      setSubscribed(true);
      setLocal({
        permission: Notification.permission,
        serviceWorker: true,
        subscription: true,
        endpointHost: hostOfEndpoint(fresh.endpoint),
        keyMatches: sameKey(fresh, PUBLIC_KEY),
      });
      await loadDiagnostics(fresh.endpoint);
      toast.success("Suscripción renovada. Usa «Probar».");
    } catch (error) {
      console.error("[push] reparar:", error);
      toast.error("No se pudo reparar la suscripción. Conéctate e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const res = await apiFetch("/api/push/subscribe", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => null);
        if (!res || !res.ok) {
          toast.error("No se pudo eliminar la suscripción del servidor. Conéctate e inténtalo de nuevo.");
          return;
        }
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setDiag(null);
      setReport(null);
      toast.success("Notificaciones desactivadas.");
    } catch {
      toast.error("No se pudieron desactivar las notificaciones.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePref(key: keyof Prefs, value: boolean) {
    if (!diag?.prefs) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const previous = diag.prefs;
    setDiag({ ...diag, prefs: { ...previous, [key]: value } });
    const res = await apiFetch("/api/push/subscribe", {
      method: "PATCH",
      body: JSON.stringify({ endpoint: subscription.endpoint, prefs: { [key]: value } }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setDiag({ ...diag, prefs: previous });
      toast.error("No se pudo guardar la preferencia.");
    }
  }

  async function sendTest(delaySeconds = 0) {
    setBusy(true);
    setReport(null);
    try {
      const res = await apiFetch("/api/push/test", { method: "POST", body: JSON.stringify({ scope: "device", delaySeconds }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "No se pudo enviar la prueba.");
        return;
      }
      if (json.scheduled) {
        toast.success(`Cierra la app ahora: la notificación llegará en ${json.delaySeconds} s.`);
        return;
      }
      setReport(json as TestReport);
      setShowDetails(true);
      if (json.accepted > 0) {
        toast.success("Prueba enviada: el servicio push la aceptó. Debería aparecer en unos segundos.");
      } else if (json.attempted === 0) {
        toast.error("Este dispositivo no tiene una suscripción registrada en el servidor.");
      } else {
        toast.error("El servicio push no aceptó la prueba. Revisa el detalle.");
      }
      const registration = await readyWithTimeout();
      const subscription = await registration.pushManager.getSubscription();
      await loadDiagnostics(subscription?.endpoint);
    } catch {
      toast.error("Error de conexión al enviar la prueba.");
    } finally {
      setBusy(false);
    }
  }

  if (supported === null) return null;

  let message = "Avisos de inventario bajo, agotados y transferencias por confirmar.";
  if (!supported) {
    message = platform ? explainUnsupported(platform) : "Este navegador no admite notificaciones.";
  } else if (!PUBLIC_KEY) {
    message = "Faltan las llaves VAPID en el servidor para activar las notificaciones.";
  } else if (permission === "denied") {
    message = "Las notificaciones están bloqueadas. Actívalas en los permisos del navegador.";
  } else if (diag?.vapid.keysMatch === false) {
    message =
      "La llave pública y la privada VAPID no coinciden: las notificaciones no llegarán hasta corregirlo en el servidor.";
  } else if (platform && iosTooOld(platform)) {
    message = "Tu iOS es anterior a la 16.4: actualiza para recibir notificaciones.";
  }

  const canUse = supported && !!PUBLIC_KEY && permission !== "denied";

  return (
    <Card>
      <CardContent className="px-3 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm flex items-center gap-1.5">
            {subscribed ? <Bell size={15} className="text-primary" /> : <BellOff size={15} />}
            Notificaciones push
          </p>
          {canUse && (
            <div className="flex gap-2">
              {subscribed && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void sendTest()}>
                  Probar
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void (subscribed ? disable() : enable())}
              >
                {subscribed ? "Desactivar" : "Activar"}
              </Button>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{message}</p>

        {subscribed && diag && (
          <div className="space-y-2">
            <button
              type="button"
              className="text-xs underline underline-offset-2 text-muted-foreground"
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? "Ocultar detalle" : "Ver estado y preferencias"}
            </button>

            {showDetails && (
              <div className="space-y-2 text-xs">
                <ul className="space-y-0.5 text-muted-foreground">
                  {platform && (
                    <li>
                      Dispositivo: {platform.os === "ios" ? "iPhone/iPad" : platform.os === "android" ? "Android" : "Computadora"} ·{" "}
                      {platform.standalone ? "app instalada ✓" : "abierta en el navegador"}
                    </li>
                  )}
                  {local && <li>Permiso del navegador: {local.permission === "granted" ? "concedido ✓" : local.permission === "denied" ? "bloqueado ✗" : "sin responder"}</li>}
                  {local && <li>Service Worker: {local.serviceWorker ? "activo ✓" : "no activo ✗"}</li>}
                  {local?.endpointHost && (
                    <li>Servicio push: {pushServiceName(local.endpointHost)}{local.keyMatches === false ? " · llave distinta ✗" : " ✓"}</li>
                  )}
                  {diag.vapid.subjectValid === false && (
                    <li className="text-red-600">VAPID_SUBJECT no es válido (usa mailto:correo@dominio-real o https://tu-sitio): Apple lo rechaza.</li>
                  )}
                  {(diag.vapid.publicKeyValid === false || diag.vapid.privateKeyValid === false) && (
                    <li className="text-red-600">El formato de las llaves VAPID no es válido.</li>
                  )}
                  <li>Llaves VAPID: {diag.vapid.configured ? (diag.vapid.keysMatch === false ? "no coinciden ✗" : "configuradas ✓") : "faltan ✗"}</li>
                  <li>Suscripción de este dispositivo: {diag.registered ? "registrada ✓" : "sin registrar ✗"}</li>
                  <li>Dispositivos suscritos: {diag.subscriptions.total}</li>
                  {diag.health && diag.health.failureCount > 0 && (
                    <li className="text-red-600">
                      Últimos envíos fallidos: {diag.health.failureCount}
                      {diag.health.lastErrorStatus ? ` (HTTP ${diag.health.lastErrorStatus})` : ""}
                    </li>
                  )}
                </ul>

                {diag.prefs && (
                  <div className="space-y-1">
                    {(Object.keys(PREF_LABELS) as (keyof Prefs)[]).map((key) => (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={diag.prefs![key]}
                          onChange={(e) => void updatePref(key, e.target.checked)}
                        />
                        {PREF_LABELS[key]}
                      </label>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void sendTest(15)}>
                    Probar con la app cerrada (15 s)
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void repair()}>
                    Reparar suscripción
                  </Button>
                </div>

                {report && (
                  <div className="rounded-md border p-2 space-y-0.5">
                    <p>
                      Prueba: {report.accepted} aceptada{report.accepted === 1 ? "" : "s"} de {report.attempted} ·{" "}
                      {report.expired} caducada{report.expired === 1 ? "" : "s"} · {report.failed} con error
                    </p>
                    {report.errors.map((e, i) => (
                      <p key={i} className="text-red-600">
                        {e.host}: {e.message}{e.hint ? ` — ${e.hint}` : ""}
                      </p>
                    ))}
                    <p className="text-muted-foreground">
                      «Aceptada» = el servicio push del navegador recibió el mensaje; no garantiza que se muestre en el teléfono.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
