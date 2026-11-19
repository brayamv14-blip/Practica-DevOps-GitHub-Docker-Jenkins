import { NextRequest, NextResponse, after } from "next/server";
import { getDeviceFromCookies } from "@/lib/auth";
import { claimEvent, getVapidStatus, sendPush } from "@/lib/push";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

// POST /api/push/test  { scope?: "device" | "all", delaySeconds?: 0..20 }
// delaySeconds permite probar con la app cerrada: se responde de inmediato y el envio ocurre despues.
// Envia una notificacion de prueba. Por defecto SOLO al dispositivo que la solicita.
// Requiere dispositivo registrado y esta limitada (1 prueba cada 20 s por dispositivo).
export async function POST(req: NextRequest) {
  const device = await getDeviceFromCookies();
  if (!device) return NextResponse.json({ error: "No autorizado. Registra este dispositivo." }, { status: 401 });

  const vapid = getVapidStatus();
  if (!vapid.configured) {
    return NextResponse.json(
      { error: "Faltan las llaves VAPID en el servidor.", vapid },
      { status: 501 }
    );
  }
  if (vapid.keysMatch === false) {
    return NextResponse.json(
      {
        error:
          "La llave pública VAPID (NEXT_PUBLIC_VAPID_PUBLIC_KEY) no corresponde a la privada (VAPID_PRIVATE_KEY). Regenera el par y vuelve a desplegar.",
        vapid,
      },
      { status: 409 }
    );
  }

  const limit = rateLimit(`push-test:${device.id}`, 1, 20_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Espera ${limit.retryAfterSeconds} s antes de otra prueba.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const scope = body?.scope === "all" ? "all" : "device";

  // Doble proteccion entre instancias: una prueba por dispositivo y por ventana de 20 s.
  const bucket = Math.floor(Date.now() / 20_000);
  if (!(await claimEvent(`test:${device.id}:${bucket}`, "system"))) {
    return NextResponse.json({ error: "Espera unos segundos antes de otra prueba." }, { status: 429 });
  }

  const rawDelay = Number(body?.delaySeconds);
  const delaySeconds = Number.isFinite(rawDelay) ? Math.min(20, Math.max(0, Math.round(rawDelay))) : 0;
  const payload = {
    title: "PuntoBase",
    body: delaySeconds > 0 ? "Prueba con la app cerrada: ¡llegó! ✓" : "Las notificaciones están activas ✓",
    url: "/dashboard",
    tag: "test",
  };
  const options = { category: "system" as const, onlyDeviceId: scope === "device" ? device.id : undefined };

  if (delaySeconds > 0) {
    after(async () => {
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
      const delayed = await sendPush(payload, options);
      console.log(`[push test] envío diferido: ${delayed.accepted}/${delayed.attempted} aceptadas.`);
    });
    return NextResponse.json({
      vapid,
      scope,
      scheduled: true,
      delaySeconds,
      note: `Cierra la app: la notificación se enviará en ${delaySeconds} s.`,
    });
  }

  const result = await sendPush(payload, options);

  return NextResponse.json({
    vapid,
    scope,
    attempted: result.attempted,
    accepted: result.accepted,
    expired: result.expired,
    failed: result.failed,
    errors: result.errors,
    note: "«accepted» significa que el servicio push del navegador aceptó el mensaje; no confirma que se haya mostrado en el teléfono.",
  });
}
