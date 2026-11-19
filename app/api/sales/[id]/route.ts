import { NextRequest, NextResponse } from "next/server";
import { dbError } from "@/lib/api-error";
import { supabase } from "@/lib/supabase/server";
import { getDeviceFromCookies } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const device = await getDeviceFromCookies();
    if (!device) return NextResponse.json({ error: "No autorizado. Registra este dispositivo." }, { status: 401 });

    const { id } = await params;
    const { data, error } = await supabase
      .from("sales")
      .select("*, customer:customers(*), device:devices(id,name), items:sale_items(*)")
      .eq("id", id)
      .single();

    if (error) return dbError("sales/[id]", error, 404);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Error del servidor." }, { status: 500 });
  }
}
