"use client";

import dynamic from "next/dynamic";

// El panel de notificaciones no es necesario para pintar la pantalla: se carga despues de la hidratacion.
export const PushToggleLazy = dynamic(() => import("./PushToggle").then((m) => m.PushToggle), {
  ssr: false,
  loading: () => <div className="h-[100px] rounded-xl border bg-card" aria-hidden />,
});
