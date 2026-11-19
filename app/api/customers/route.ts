import { NextRequest, NextResponse } from "next/server";
import { dbError } from "@/lib/api-error";
import { supabase } from "@/lib/supabase/server";
import { getDeviceFromCookies } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const device = await getDeviceFromCookies();
  if (!device) return NextResponse.json({ error: "No autorizado. Registra este dispositivo." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  let query = supabase.from("customers").select("*").order("name").limit(20);
  if (q) {
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return dbError("customers", error, 500);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const device = await getDeviceFromCookies();
  if (!device) return NextResponse.json({ error: "No autorizado. Registra este dispositivo." }, { status: 401 });

  const { name, phone } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });

  const { data, error } = await supabase
    .from("customers")
    .insert({ name: name.trim(), phone: phone?.trim() || null })
    .select()
    .single();

  if (error) return dbError("customers", error, 500);
  return NextResponse.json(data, { status: 201 });
}
