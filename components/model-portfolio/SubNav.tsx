"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconLayoutGrid,
  IconChartLine,
  IconArrowsLeftRight,
  IconSettings,
} from "@tabler/icons-react";

interface Props {
  isAdmin: boolean;
}

const NAV: Array<{
  href:   string;
  label:  string;
  icon:   React.ElementType;
  exact?: boolean;
}> = [
  { href: "/model-portfolio",         label: "Overview", icon: IconLayoutGrid,       exact: true },
  { href: "/model-portfolio/compare", label: "Compare",  icon: IconArrowsLeftRight               },
];

const ADMIN_NAV: { href: string; label: string; icon: React.ElementType; exact?: boolean } = {
  href:  "/model-portfolio/admin",
  label: "Admin",
  icon:  IconSettings,
};

export default function ModelPortfolioSubNav({ isAdmin }: Props) {
  const pathname = usePathname();

  const links = isAdmin ? [...NAV, ADMIN_NAV] : NAV;

  return (
    <nav
      className="fixed top-16 left-0 right-0 z-30 h-10 border-b flex items-center px-6 gap-1"
      style={{ background: "white", borderColor: "var(--wgi-border)" }}
    >
      {/* Section label */}
      <span
        className="text-xs font-bold uppercase tracking-widest mr-3"
        style={{ color: "var(--wgi-text-muted)" }}
      >
        Model Portfolio
      </span>

      <div
        className="w-px h-4 mr-3 flex-shrink-0"
        style={{ background: "var(--wgi-border)" }}
      />

      {links.map(({ href, label, icon: Icon, exact }) => {
        const active = exact
          ? pathname === href
          : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: active ? "var(--wgi-navy)" : "transparent",
              color:      active ? "white" : "var(--wgi-text-muted)",
              boxShadow:  active ? "inset 0 -2px 0 var(--wgi-gold)" : undefined,
            }}
          >
            <Icon size={13} stroke={active ? 2.2 : 1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
