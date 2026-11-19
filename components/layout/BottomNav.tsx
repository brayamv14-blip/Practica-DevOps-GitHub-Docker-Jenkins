"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useCart } from "@/hooks/useCart";
import { useIsAdmin } from "@/contexts/RoleContext";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Wallet,
  Banknote,
  BarChart2,
  ArrowLeftRight,
  CalendarClock,
  TrendingUp,
  Menu,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/pos", label: "Punto de venta", icon: ShoppingCart },
  { href: "/products", label: "Inventario", icon: Package },
  { href: "/layaways", label: "Apartados", icon: CalendarClock },
  { href: "/expenses", label: "Gastos", icon: Wallet },
  { href: "/transfers", label: "Transferencias", icon: ArrowLeftRight },
  { href: "/eod", label: "Cierre de caja", icon: Banknote },
  { href: "/reports", label: "Reportes", icon: BarChart2 },
  { href: "/analytics", label: "Análisis", icon: TrendingUp, adminOnly: true },
  { href: "/settings", label: "Ajustes", icon: Menu },
];

export function BottomNav() {
  const pathname = usePathname();
  const cart = useCart();
  const cartCount = cart.items.length;
  const isAdmin = useIsAdmin();
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);
  const scroller = useRef<HTMLDivElement>(null);

  // En pantallas angostas la barra se desplaza: se deja visible (centrada) la seccion activa.
  useEffect(() => {
    const box = scroller.current;
    const active = box?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!box || !active) return;
    box.scrollLeft = active.offsetLeft - (box.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);

  return (
    <nav aria-label="Navegación principal" className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-inset-bottom">
      <div ref={scroller} className="flex overflow-x-auto scrollbar-hide px-1 py-1">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          const isPOS = item.href === "/pos";
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center flex-1 shrink-0 min-w-[76px] py-1.5 px-1.5 text-[11px] gap-0.5 rounded-xl transition-colors",
                active
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
                {isPOS && cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-destructive text-destructive-foreground rounded-full min-w-[14px] h-[14px] text-[9px] flex items-center justify-center font-bold px-0.5">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </div>
              <span className="leading-tight text-center whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
