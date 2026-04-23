"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconUsers, IconShieldCheck, IconSettings } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin/users",    label: "Users",     icon: IconUsers },
  { href: "/admin/audit",    label: "Audit Log",  icon: IconShieldCheck },
  { href: "/admin/settings", label: "Settings",  icon: IconSettings },
] as const;

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed top-16 left-0 w-56 h-[calc(100vh-64px)] bg-white border-r z-30 flex flex-col"
      style={{ borderColor: "var(--wgi-border)" }}
    >
      {/* Section label */}
      <div className="px-5 pt-6 pb-1">
        <p
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "var(--wgi-text-light)" }}
        >
          Administration
        </p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active ? "text-white" : "hover:bg-slate-50"
              )}
              style={
                active
                  ? { background: "var(--wgi-navy)", color: "white" }
                  : { color: "var(--wgi-text)" }
              }
            >
              <Icon size={17} stroke={active ? 2 : 1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer hint */}
      <div className="px-5 py-5 border-t" style={{ borderColor: "var(--wgi-border)" }}>
        <p className="text-[11px]" style={{ color: "var(--wgi-text-light)" }}>
          Admin portal · Wynn Global
        </p>
      </div>
    </aside>
  );
}
