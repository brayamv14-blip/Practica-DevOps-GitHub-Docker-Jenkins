"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

export default function SetupPage() {
  const router = useRouter();
  const [isFirstSetup, setIsFirstSetup] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    apiFetch("/api/setup")
      .then((r) => r.json())
      .then((d) => setIsFirstSetup(!d.setup_complete))
      .catch(() => setLoadError(true));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !accessCode.trim()) return toast.error("Completa todos los campos.");
    if (isFirstSetup && accessCode.length < 6) {
      return toast.error("El código de acceso debe tener al menos 6 caracteres.");
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/setup", {
        method: "POST",
        body: JSON.stringify({
          access_code: accessCode,
          name: name.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.error ?? "No se pudo completar el registro.");

      toast.success(isFirstSetup ? "Tienda configurada. Este dispositivo es administrador." : "Dispositivo registrado.");
      router.replace("/dashboard");
    } catch {
      toast.error("Sin conexión: necesitas internet para registrar el dispositivo.");
    } finally {
      setLoading(false);
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <p role="alert" className="text-sm text-muted-foreground">
            No se pudo conectar. Para registrar este dispositivo necesitas internet.
          </p>
          <Button onClick={() => window.location.reload()}>Reintentar</Button>
        </div>
      </div>
    );
  }

  if (isFirstSetup === null) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Cargando…</p></div>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border p-6 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">PuntoBase</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isFirstSetup ? "Configuración inicial de la tienda" : "Registrar este dispositivo"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Tu nombre</Label>
            <Input
              id="name"
              autoComplete="name"
              placeholder="Ej. María"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="access_code">{isFirstSetup ? "Crea el código de acceso" : "Código de acceso de la tienda"}</Label>
            <Input
              id="access_code"
              type={showCode ? "text" : "password"}
              autoComplete={isFirstSetup ? "new-password" : "off"}
              placeholder={isFirstSetup ? "Mínimo 6 caracteres" : "Escribe el código de la tienda"}
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              required
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              <input type="checkbox" checked={showCode} onChange={(e) => setShowCode(e.target.checked)} className="h-4 w-4" />
              Mostrar código
            </label>
          </div>

          <p className="text-xs text-muted-foreground bg-muted rounded-lg p-2" role="note">
            {isFirstSetup
              ? "Este primer dispositivo será el administrador. Los demás dispositivos entrarán como empleado y tú podrás cambiar su rol en Ajustes."
              : "Este dispositivo entrará como empleado. Un administrador puede cambiar su rol en Ajustes. Pídele el código de acceso."}
          </p>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Procesando…" : isFirstSetup ? "Configurar tienda" : "Registrar dispositivo"}
          </Button>
        </form>
      </div>
    </div>
  );
}
