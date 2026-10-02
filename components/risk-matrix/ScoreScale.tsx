import { CFG } from "@/lib/risk-matrix/config";
import { fmtNum } from "@/lib/risk-matrix/format";

interface ScoreScaleProps {
  score: number | null;
  /** Classification implied by the score alone, before priority rules. */
  clasifScore: string | null;
}

/** 0–100 track split at the Medio / Alto cut-offs, with a marker at the score. */
export default function ScoreScale({ score, clasifScore }: ScoreScaleProps) {
  const m = CFG.escala.cortes_clasificacion.Medio;
  const h = CFG.escala.cortes_clasificacion.Alto;
  const pos = score == null ? null : Math.max(0, Math.min(100, score));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
          Score {clasifScore ? `(${clasifScore} por score)` : ""}
        </span>
        <span className="rm-num text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
          {score == null ? "—" : fmtNum(score, 1)}
        </span>
      </div>

      <div
        className="relative flex h-3"
        role="img"
        aria-label={`Escala de 0 a 100 con cortes en ${m} y ${h}`}
      >
        <span className="h-full rounded-l-md opacity-[0.85]" style={{ width: `${m}%`, background: "var(--rm-bajo)" }} />
        <span className="h-full opacity-[0.85]" style={{ width: `${h - m}%`, background: "var(--rm-medio)" }} />
        <span className="h-full rounded-r-md opacity-[0.85]" style={{ width: `${100 - h}%`, background: "var(--rm-alto)" }} />
        {pos != null && (
          <div
            className="rm-marker absolute -top-1.5 w-1 h-6 rounded-sm -translate-x-0.5"
            style={{ left: `${pos}%`, background: "var(--wgi-text)" }}
          />
        )}
      </div>

      <div className="relative h-4 mt-1.5 text-[11px]" style={{ color: "var(--wgi-text-muted)" }}>
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${m}%` }}>{m}</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${h}%` }}>{h}</span>
        <span className="absolute right-0">100</span>
      </div>
    </div>
  );
}
