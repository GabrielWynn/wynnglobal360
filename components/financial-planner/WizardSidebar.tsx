"use client";

import type { FFSection, FFLanguage } from "@/lib/financial-planner/fact-find-types";
import { getLabel } from "@/lib/financial-planner/fact-find-types";

interface WizardSidebarProps {
  sections: FFSection[];
  currentIndex: number;
  completedKeys: string[];
  language: FFLanguage;
  onNavigate: (index: number) => void;
}

export default function WizardSidebar({
  sections,
  currentIndex,
  completedKeys,
  language,
  onNavigate,
}: WizardSidebarProps) {
  return (
    <nav
      className="w-60 flex-shrink-0 flex flex-col border-r overflow-y-auto"
      style={{ borderColor: "var(--wgi-border)", background: "var(--wgi-bg)" }}
    >
      <div className="px-4 py-4 border-b" style={{ borderColor: "var(--wgi-border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--wgi-text-muted)" }}>
          {language === "es" ? "Secciones" : "Sections"}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--wgi-text-muted)" }}>
          {completedKeys.length}/{sections.length}{" "}
          {language === "es" ? "completadas" : "completed"}
        </p>
      </div>

      <div className="flex flex-col py-2">
        {sections.map((section, index) => {
          const isCurrent = index === currentIndex;
          const isCompleted = completedKeys.includes(section.key);
          const isAccessible = index <= currentIndex || isCompleted;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => isAccessible && onNavigate(index)}
              disabled={!isAccessible}
              className="flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={
                isCurrent
                  ? { background: "var(--wgi-navy)", color: "white" }
                  : { background: "transparent", color: "var(--wgi-text)" }
              }
            >
              <StatusDot completed={isCompleted} current={isCurrent} />
              <span className="flex-1 leading-tight text-xs font-medium truncate">
                {getLabel(section, language)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function StatusDot({
  completed,
  current,
}: {
  completed: boolean;
  current: boolean;
}) {
  if (current) {
    return (
      <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center flex-shrink-0">
        <span className="w-2 h-2 rounded-full" style={{ background: "var(--wgi-navy)" }} />
      </span>
    );
  }

  if (completed) {
    return (
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
        style={{ background: "var(--wgi-gold)", color: "white" }}
      >
        ✓
      </span>
    );
  }

  return (
    <span
      className="w-5 h-5 rounded-full border-2 flex-shrink-0"
      style={{ borderColor: "var(--wgi-border)" }}
    />
  );
}
