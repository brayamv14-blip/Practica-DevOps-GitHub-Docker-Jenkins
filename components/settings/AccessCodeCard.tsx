"use client";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

export function AccessCodeCard() {
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = code.trim();
    if (next.length < 6) return toast.error("El código debe tener al menos 6 caracteres.");
    if (next !== confirm.trim()) return toast.error("Los códigos no coinciden.");
    if (!navigator.onLine) return toast.error("Necesitas conexión a internet.");
    if (!window.confirm("¿Cambiar el código de acceso? Los dispositivos ya registrados siguen funcionando; los nuevos usarán el código nuevo.")) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/store-config", { method: "PUT", body: JSON.stringify({ new_access_code: next }) });
      if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "No se pudo cambiar el código.");
      toast.success("Código de acceso actualizado.");
      setCode(""); setConfirm("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5"><KeyRound size={15} aria-hidden /> Código de acceso de la tienda</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-2">
          <p className="text-xs text-muted-foreground">Es el código que se pide para registrar un dispositivo nuevo. Compártelo solo con tu personal.</p>
          <div className="space-y-1">
            <Label htmlFor="new_code" className="text-xs">Código nuevo</Label>
            <Input id="new_code" type="password" autoComplete="new-password" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new_code2" className="text-xs">Repite el código</Label>
            <Input id="new_code2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" className="w-full" disabled={busy}>{busy ? "Guardando…" : "Cambiar código"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
