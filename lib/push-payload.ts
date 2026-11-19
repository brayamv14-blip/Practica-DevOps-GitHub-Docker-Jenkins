export interface PushData {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/**
 * Normaliza el mensaje recibido. Un push SIEMPRE debe terminar en una notificacion visible:
 * en iOS, recibir pushes sin mostrar nada puede hacer que el sistema revoque la suscripcion.
 * Solo se aceptan rutas internas ("/..."), nunca URLs externas.
 */
export function normalizePushData(raw: unknown): PushData {
  const data: PushData = { title: "PuntoBase", body: "", url: "/dashboard" };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (typeof r.title === "string" && r.title.trim()) data.title = r.title.slice(0, 120);
    if (typeof r.body === "string") data.body = r.body.slice(0, 300);
    if (typeof r.url === "string" && r.url.startsWith("/") && !r.url.startsWith("//")) data.url = r.url;
    if (typeof r.tag === "string" && r.tag) data.tag = r.tag.slice(0, 60);
  }
  return data;
}
