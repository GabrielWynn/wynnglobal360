"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconUsers,
  IconClipboardPlus,
  IconBellRinging,
  IconBook,
} from "@tabler/icons-react";

const NAV: Array<{
  href: string;
  label: string;
  icon: React.ElementType;
  isActive: (pathname: string) => boolean;
}> = [
  {
    href: "/risk-matrix",
    label: "Clientes",
    icon: IconUsers,
    isActive: (p) => p === "/risk-matrix" || p.startsWith("/risk-matrix/clients"),
  },
  {
    href: "/risk-matrix/new",
    label: "Nueva evaluación",
    icon: IconClipboardPlus,
    isActive: (p) => p.startsWith("/risk-matrix/new"),
  },
  {
    href: "/risk-matrix/reviews",
    label: "Revisiones",
    icon: IconBellRinging,
    isActive: (p) => p.startsWith("/risk-matrix/reviews"),
  },
  {
    href: "/risk-matrix/methodology",
    label: "Metodología",
    icon: IconBook,
    isActive: (p) => p.startsWith("/risk-matrix/methodology"),
  },
];

interface Props {
  /** Reviews overdue or due within the notice window. */
  reviewsDue: number;
}

export default function RiskMatrixSubNav({ reviewsDue }: Props) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed top-16 left-0 right-0 z-30 h-10 border-b flex items-center px-6 gap-1 overflow-x-auto"
      style={{ background: "white", borderColor: "var(--wgi-border)" }}
    >
      {/* Section label */}
      <span
        className="text-xs font-bold uppercase tracking-widest mr-3 whitespace-nowrap"
        style={{ color: "var(--wgi-text-muted)" }}
      >
        Risk Matrix
      </span>

      <div
        className="w-px h-4 mr-3 flex-shrink-0"
        style={{ background: "var(--wgi-border)" }}
      />

      {NAV.map(({ href, label, icon: Icon, isActive }) => {
        const active = isActive(pathname);
        const badge = href === "/risk-matrix/reviews" && reviewsDue > 0 ? reviewsDue : null;

        return (
          <Link
            key={href}
            href={href}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
            style={{
              background: active ? "var(--wgi-navy)" : "transparent",
              color: active ? "white" : "var(--wgi-text-muted)",
              boxShadow: active ? "inset 0 -2px 0 var(--wgi-gold)" : undefined,
            }}
          >
            <Icon size={13} stroke={active ? 2.2 : 1.75} />
            {label}
            {badge != null && (
              <span
                className="rm-num ml-0.5 px-1.5 rounded-full text-[10px] font-bold leading-4 text-white"
                style={{ background: "#B0353B" }}
                aria-label={`${badge} revisiones pendientes`}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
