import { NextRequest, NextResponse } from "next/server";
import { dbError } from "@/lib/api-error";
import { supabase } from "@/lib/supabase/server";
import { getDeviceFromCookies } from "@/lib/auth";
import { dayEndISO, dayStartISO } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const device = await getDeviceFromCookies();
    if (!device) return NextResponse.json({ error: "No autorizado. Registra este dispositivo." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = supabase
      .from("stock_adjustments")
      .select("*, product:products(name), variant:product_variants(size_label)")
      .eq("adjustment_type", "manual")
      .order("created_at", { ascending: false })
      .limit(200);

    if (from) query = query.gte("created_at", dayStartISO(from));
    if (to)   query = query.lte("created_at", dayEndISO(to));

    const { data, error } = await query;
    if (error) return dbError("stock/adjustments", error, 500);
    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json({ error: "Error del servidor." }, { status: 500 });
  }
}
