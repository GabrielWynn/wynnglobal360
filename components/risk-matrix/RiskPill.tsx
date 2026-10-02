export type LevelKey = "bajo" | "medio" | "alto" | "decl" | "pend";

/** Maps a final classification to its --rm-* colour family. */
export function levelKey(final?: string | null): LevelKey {
  if (final === "Bajo") return "bajo";
  if (final === "Medio") return "medio";
  if (final === "Alto") return "alto";
  if (final === "Declinado") return "decl";
  // "Revisión manual", "Pendiente de datos" and anything unknown
  return "pend";
}

export default function RiskPill({ value }: { value?: string | null }) {
  const k = levelKey(value);
  return (
    <span
      className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ color: `var(--rm-${k})`, background: `var(--rm-${k}-bg)` }}
    >
      {value || "—"}
    </span>
  );
}
