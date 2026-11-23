// Endpoint de salud: lo usan Docker (HEALTHCHECK) y Jenkins para saber si la app arrancó.
// No consulta la base de datos a propósito: solo confirma que el servidor de Next.js responde.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    app: "PuntoBase",
    uptime: Math.round(process.uptime()),
  });
}
