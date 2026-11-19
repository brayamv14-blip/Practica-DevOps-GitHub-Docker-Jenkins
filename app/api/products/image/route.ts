import { NextRequest, NextResponse } from "next/server";
import { dbError } from "@/lib/api-error";
import { supabase } from "@/lib/supabase/server";
import { getDeviceFromCookies } from "@/lib/auth";
import { isCloudinaryUrl } from "@/lib/image-url";

// POST /api/products/image  { product_id, image_url | null }  guarda la imagen del producto
export async function POST(req: NextRequest) {
  try {
    const device = await getDeviceFromCookies();
    if (!device) return NextResponse.json({ error: "No autorizado. Registra este dispositivo." }, { status: 401 });

    const { product_id, image_url } = await req.json();
    if (typeof product_id !== "string" || !product_id) {
      return NextResponse.json({ error: "product_id requerido" }, { status: 400 });
    }
    if (image_url !== null && (typeof image_url !== "string" || !isCloudinaryUrl(image_url))) {
      return NextResponse.json({ error: "La imagen debe estar en Cloudinary" }, { status: 400 });
    }

    const { error } = await supabase
      .from("products")
      .update({ image_url, updated_at: new Date().toISOString() })
      .eq("id", product_id);

    if (error) return dbError("products/image", error, 500);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error del servidor." }, { status: 500 });
  }
}
