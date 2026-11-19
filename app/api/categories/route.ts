import { NextRequest, NextResponse } from "next/server";
import { dbError } from "@/lib/api-error";
import { supabase } from "@/lib/supabase/server";
import { getDeviceFromCookies } from "@/lib/auth";

export async function GET() {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("name");
  if (error) return dbError("categories", error, 500);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const device = await getDeviceFromCookies();
    if (!device) return NextResponse.json({ error: "No autorizado. Registra este dispositivo." }, { status: 401 });

    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });

    // Upsert (find or create)
    const { data: existing } = await supabase
      .from("categories")
      .select("*")
      .ilike("name", name.trim())
      .single();

    if (existing) return NextResponse.json(existing);

    const { data, error } = await supabase
      .from("categories")
      .insert({ name: name.trim() })
      .select()
      .single();

    if (error) return dbError("categories", error, 500);
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error del servidor." }, { status: 500 });
  }
}
