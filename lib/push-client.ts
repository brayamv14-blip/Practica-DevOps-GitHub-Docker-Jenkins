export interface PushPlatform {
  os: "ios" | "android" | "desktop";
  /** La app esta abierta desde el icono de la pantalla de inicio (no desde una pestaña). */
  standalone: boolean;
  /** Version mayor de iOS cuando se puede leer del user agent (iPhone); null si no. */
  iosVersion: number | null;
}

export function detectPlatform(ua: string, standalone: boolean, platform = "", maxTouchPoints = 0): PushPlatform {
  // iPadOS 13+ se identifica como Mac con pantalla tactil.
  const isIos = /iPhone|iPad|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  if (isIos) {
    const m = /OS (\d+)[_.](\d+)/.exec(ua);
    return { os: "ios", standalone, iosVersion: m ? Number(m[1]) + Number(m[2]) / 100 : null };
  }
  return { os: /Android/i.test(ua) ? "android" : "desktop", standalone, iosVersion: null };
}

/** iOS admite Web Push desde 16.4 y solo en apps instaladas en la pantalla de inicio. */
export function iosTooOld(p: PushPlatform): boolean {
  return p.os === "ios" && p.iosVersion !== null && p.iosVersion < 16.04;
}

/** Texto cuando el navegador no expone la API de push. */
export function explainUnsupported(p: PushPlatform): string {
  if (p.os === "ios") {
    if (iosTooOld(p)) return "Tu iPhone/iPad tiene una versión de iOS anterior a la 16.4, que no admite notificaciones web. Actualiza iOS.";
    if (!p.standalone) {
      return "En iPhone/iPad las notificaciones solo funcionan con la app instalada: en Safari toca Compartir → «Añadir a pantalla de inicio», abre PuntoBase desde ese icono y activa aquí las notificaciones (requiere iOS 16.4 o superior).";
    }
    return "Este iPhone/iPad no ofrece notificaciones web. Revisa que tenga iOS 16.4 o superior y que Ajustes → Notificaciones → PuntoBase esté permitido.";
  }
  return "Este navegador no admite notificaciones push.";
}

export function hostOfEndpoint(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "desconocido";
  }
}

/** Nombre legible del servicio push segun el host del endpoint. */
export function pushServiceName(host: string): string {
  if (host.includes("push.apple.com")) return "Apple";
  if (host.includes("googleapis.com") || host.includes("fcm")) return "Google (FCM)";
  if (host.includes("mozilla")) return "Mozilla";
  if (host.includes("windows.com") || host.includes("notify.windows")) return "Microsoft";
  return host;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}
