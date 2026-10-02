// ---------------------------------------------------------------------------
// LACRM contact → Risk Matrix answers.
// Dependency-free. A LACRM value is only used when it maps unambiguously to
// a catalogue option; otherwise the field is left blank and the raw value is
// returned as a hint for the analyst. Never guesses.
// ---------------------------------------------------------------------------

import { CFG } from "./config";
import type { AnswerKey, Answers } from "./engine";

/** Structural subset of LacrmContact (lib/risk-matrix/lacrm.ts). */
export interface LacrmContactFields {
  clientNumber: string;
  name: string;
  birthday: string;
  nationality: string;
  countryOfResidence: string;
  pep: string;
  status: string;
  planType: string;
  riskTolerance: string;
}

/** Shape of a LACRM ContactId; anything else is rejected before it reaches a query. */
export const LACRM_CONTACT_ID = /^[A-Za-z0-9_-]{1,50}$/;

export type LacrmHints = Partial<Record<AnswerKey, string>>;

export interface LacrmPrefill {
  prefill: Answers;
  /** Raw LACRM values that had no matching option, keyed by form field. */
  hints: LacrmHints;
}

/** Lower-case, accent-free, single-spaced — for tolerant comparisons. */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const options = (code: string) => CFG.catalogos[code].map((i) => i.valor);
const PAISES = CFG.paises.map((p) => p.pais);

/** Catalogue option equal to `raw` ignoring case and accents, or a known alias. */
function match(raw: string, opts: string[], aliases: Record<string, string> = {}): string | null {
  const n = norm(raw);
  if (!n) return null;
  return opts.find((o) => norm(o) === n) ?? aliases[n] ?? null;
}

const PEP_ALIASES: Record<string, string> = {
  yes: "Sí",
  si: "Sí",
  true: "Sí",
  no: "No",
  false: "No",
  "ex-pep": "Ex PEP",
  "former pep": "Ex PEP",
};

const ESTADO_ALIASES: Record<string, string> = {
  active: "Activo",
  "paid-up": "Paid Up",
  paidup: "Paid Up",
};

const PERFIL_ALIASES: Record<string, string> = {
  cauteloso: "Mayoría A - Cauteloso",
  cautious: "Mayoría A - Cauteloso",
  balanceado: "Mayoría B - Balanceado",
  balanced: "Mayoría B - Balanceado",
  crecimiento: "Mayoría C - Crecimiento",
  growth: "Mayoría C - Crecimiento",
  agresivo: "Mayoría D - Agresivo",
  aggressive: "Mayoría D - Agresivo",
};

/** Accepts only an unambiguous ISO date (YYYY-MM-DD, optionally with a time). */
function isoDate(raw: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  return isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

export function contactToAnswers(c: LacrmContactFields): LacrmPrefill {
  const prefill: Answers = {};
  const hints: LacrmHints = {};

  const put = (key: AnswerKey, raw: string, mapped: string | null) => {
    if (mapped) prefill[key] = mapped;
    else if (raw.trim()) hints[key] = raw.trim();
  };

  if (c.clientNumber) prefill.id = c.clientNumber.slice(0, 200);
  if (c.name) prefill.nombre = c.name.slice(0, 200);

  put("fn", c.birthday, isoDate(c.birthday));
  put("pep", c.pep, match(c.pep, options("¿Es PEP?"), PEP_ALIASES));
  put("nac1", c.nationality, match(c.nationality, PAISES));
  put("dom", c.countryOfResidence, match(c.countryOfResidence, PAISES));
  put("estado", c.status, match(c.status, options("Estado del Plan"), ESTADO_ALIASES));
  put("perfil", c.riskTolerance, match(c.riskTolerance, options("Perfil de Inversionista"), PERFIL_ALIASES));
  put("tipo", c.planType, match(c.planType, options("Tipo de Plan")));

  return { prefill, hints };
}
