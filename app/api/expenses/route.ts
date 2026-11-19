import { NextRequest, NextResponse } from "next/server";
import { dbError } from "@/lib/api-error";
import { supabase } from "@/lib/supabase/server";
import { getDeviceFromCookies } from "@/lib/auth";
import { ensureOpenCashRegister } from "@/lib/cash-register";

export async function GET(req: NextRequest) {
  const device = await getDeviceFromCookies();
  if (!device) return NextResponse.json({ error: "No autorizado. Registra este dispositivo." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  let query = supabase
    .from("expenses")
    .select("*, device:devices(id,name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error, count } = await query;
  if (error) return dbError("expenses", error, 500);
  return NextResponse.json({ data, count });
}

export async function POST(req: NextRequest) {
  const device = await getDeviceFromCookies();
  if (!device) return NextResponse.json({ error: "No autorizado. Registra este dispositivo." }, { status: 401 });

  const { description, amount } = await req.json();
  if (!description?.trim()) return NextResponse.json({ error: "La descripción es obligatoria." }, { status: 400 });
  if (amount == null || amount <= 0) return NextResponse.json({ error: "Escribe un monto válido." }, { status: 400 });

  const { data, error } = await supabase
    .from("expenses")
    .insert({ description: description.trim(), amount, device_id: device.id })
    .select("*, device:devices(id,name)")
    .single();

  if (error) return dbError("expenses", error, 500);

  await ensureOpenCashRegister();

  return NextResponse.json(data, { status: 201 });
}
