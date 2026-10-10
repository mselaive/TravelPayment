"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckSquare, Home, Plus, Settings } from "lucide-react";
import { useApp } from "./app-provider";

const items = [
  { href: "/", label: "Hoy", icon: Home },
  { href: "/days", label: "Días", icon: CalendarDays },
  { href: "/add", label: "Agregar", icon: Plus, primary: true },
  { href: "/pending", label: "Por subir", icon: CheckSquare },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  const { expenses, requests } = useApp();
  const badge = expenses.filter((e) => !e.uploaded).length + requests.length;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          if (primary) {
            return (
              <li key={href} className="flex justify-center">
                <Link
                  href={href}
                  aria-label={label}
                  className="-mt-5 flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg ring-4 ring-bg transition active:scale-95"
                >
                  <Icon className="size-7" strokeWidth={2.5} />
                </Link>
              </li>
            );
          }
          return (
            <li key={href}>
              <Link
                href={href}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <Icon className="size-6" strokeWidth={active ? 2.4 : 2} />
                {label}
                {href === "/pending" && badge > 0 && (
                  <span className="absolute top-1.5 left-1/2 ml-2 min-w-5 rounded-full bg-bad px-1.5 text-center text-[11px] leading-5 font-bold text-white">
                    {badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
