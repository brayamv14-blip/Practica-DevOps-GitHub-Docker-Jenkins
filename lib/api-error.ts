import { NextResponse } from "next/server";

interface DbErrorLike {
  message?: string;
  code?: string;
}

/**
 * Respuesta de error para fallos de la base de datos.
 * El detalle tecnico (tablas, columnas, restricciones) se registra solo en el servidor;
 * al cliente solo llega un mensaje general en espanol.
 */
export function dbError(context: string, error: DbErrorLike | null | undefined, status = 500) {
  console.error(`[${context}]`, error?.code ?? "", error?.message ?? error);
  const message =
    status === 404
      ? "No se encontró el registro."
      : status === 409
        ? "La operación entra en conflicto con datos existentes."
        : "No se pudo completar la operación. Inténtalo de nuevo.";
  return NextResponse.json({ error: message }, { status });
}
