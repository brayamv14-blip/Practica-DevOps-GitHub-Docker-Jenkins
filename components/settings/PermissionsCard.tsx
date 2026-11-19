"use client";
import { Check, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSION_MATRIX, type Role } from "@/lib/permissions";

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <span className="inline-flex items-center gap-1 text-green-700"><Check size={14} aria-hidden /><span className="sr-only">Sí</span></span>;
  if (value === false) return <span className="inline-flex items-center gap-1 text-muted-foreground"><X size={14} aria-hidden /><span className="sr-only">No</span></span>;
  return <span className="inline-flex items-center gap-1 text-amber-700 text-xs"><Minus size={12} aria-hidden />{value}</span>;
}

export function PermissionsCard({ role }: { role: Role }) {
  const areas = Array.from(new Set(PERMISSION_MATRIX.map((r) => r.area)));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span>Qué puede hacer cada rol</span>
          <Badge variant="secondary">Tú: {role === "admin" ? "Administrador" : "Empleado"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {areas.map((area) => (
          <div key={area}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{area}</p>
            <table className="w-full text-sm">
              <caption className="sr-only">Permisos de {area}</caption>
              <thead>
                <tr className="text-[11px] text-muted-foreground">
                  <th scope="col" className="sr-only">Acción</th>
                  <th scope="col" className="w-12" aria-label="Administrador"><span aria-hidden>Admin</span></th>
                  <th scope="col" className="w-20">Empleado</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MATRIX.filter((r) => r.area === area).map((r) => (
                  <tr key={r.action} className="border-t">
                    <td className="py-1.5 pr-2 align-top">{r.action}</td>
                    <td className="py-1.5 px-1 w-10 text-center align-top" aria-label="Administrador"><Cell value={r.admin} /></td>
                    <td className="py-1.5 pl-1 w-20 text-center align-top" aria-label="Empleado"><Cell value={r.employee} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">El servidor aplica estas reglas aunque se intente saltar la pantalla.</p>
      </CardContent>
    </Card>
  );
}
