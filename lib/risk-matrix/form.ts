// ---------------------------------------------------------------------------
// Matriz de Riesgo PLAyFT — form definition and answer validation.
// Shared by the evaluation form and the API route.
// ---------------------------------------------------------------------------

import { CFG } from "./config";
import {
  ANSWER_KEYS,
  ELEVAR_A_ALTO,
  FX,
  OTRO,
  OTRO_KEYS,
  UNICO,
  type AnswerKey,
  type Answers,
  type Evaluation,
} from "./engine";

export interface FieldDef {
  k: AnswerKey;
  label: string;
  type: "text" | "date" | "select" | "textarea" | "money";
  opts?: string[];
  req?: boolean | ((a: Answers) => boolean);
  /** Shown as "(opcional)" next to the label. */
  opt?: boolean;
  /** Spans both columns. */
  full?: boolean;
  hint?: string;
  /** Field is only shown (and only required) when this returns true. */
  cond?: (a: Answers) => boolean;
}

export interface SectionDef {
  id: string;
  title: string;
  /** Name of the weighted factor this section feeds, if any. */
  factor?: string;
  fields: FieldDef[];
}

const catOpts = (code: string) => CFG.catalogos[code].map((i) => i.valor);
const PAISES = CFG.paises.map((p) => p.pais);

export const SECTIONS: SectionDef[] = [
  {
    id: "ident",
    title: "Identificación",
    fields: [
      { k: "id", label: "ID Cliente", type: "text", req: true },
      { k: "nombre", label: "Nombre del cliente", type: "text", req: true },
      { k: "fe", label: "Fecha de evaluación", type: "date", req: true },
      { k: "tipo_eval", label: "Tipo de evaluación", type: "select", opts: CFG.listas_auxiliares.tipo_evaluacion, req: true },
    ],
  },
  {
    id: "cli",
    factor: "Cliente",
    title: "Cliente",
    fields: [
      { k: "fn", label: "Fecha de nacimiento", type: "date", req: true, hint: "La edad se calcula a la fecha de evaluación." },
      { k: "pep", label: "¿Es PEP?", type: "select", opts: catOpts("¿Es PEP?"), req: true },
      { k: "hall", label: "Coincidencias en listas / fuentes abiertas", type: "select", opts: catOpts("Coincidencias en listas / fuentes abiertas"), req: true, full: true },
      { k: "civil", label: "Estado civil", type: "select", opts: catOpts("Estado Civil"), req: true },
      { k: "perfil", label: "Perfil de inversionista", type: "select", opts: catOpts("Perfil de Inversionista"), req: true },
      { k: "prof", label: "Profesión", type: "select", opts: catOpts("Profesión"), req: true, full: true },
      { k: "ocup", label: "Ocupación", type: "select", opts: catOpts("Ocupación"), req: true, full: true },
      { k: "act", label: "Actividad económica", type: "select", opts: catOpts("Actividad Económica"), req: true, full: true },
      {
        k: "otro",
        label: "Especificación de «Otro»",
        type: "text",
        full: true,
        req: true,
        cond: (a) => OTRO_KEYS.some((k) => a[k] === OTRO),
        hint: "Describe el valor que no está en la lista.",
      },
    ],
  },
  {
    id: "prod",
    factor: "Producto o Servicio",
    title: "Producto o servicio",
    fields: [
      { k: "tipo", label: "Tipo de plan", type: "select", opts: catOpts("Tipo de Plan"), req: true },
      { k: "estado", label: "Estado del plan", type: "select", opts: catOpts("Estado del Plan"), req: true },
      { k: "monto", label: "Monto del aporte", type: "money", req: true },
      { k: "freq", label: "Frecuencia del aporte", type: "select", opts: catOpts("Frecuencia del Aporte"), req: (a) => a.tipo !== UNICO },
      { k: "metodo", label: "Método de pago", type: "select", opts: catOpts("Método de Pago"), req: true, full: true },
    ],
  },
  {
    id: "geo",
    factor: "Zona Geográfica",
    title: "Zona geográfica",
    fields: [
      { k: "nac1", label: "Nacionalidad", type: "select", opts: PAISES, req: true },
      { k: "nac2", label: "Segunda nacionalidad", type: "select", opts: PAISES, opt: true },
      { k: "pnac", label: "País de nacimiento", type: "select", opts: PAISES, req: true },
      { k: "dom", label: "País de domicilio", type: "select", opts: PAISES, req: true },
      { k: "fis", label: "País de residencia fiscal", type: "select", opts: PAISES, req: true },
      { k: "dest", label: "Destino de recursos", type: "select", opts: PAISES, req: true },
      { k: "o1", label: "Origen de recursos", type: "select", opts: PAISES, req: true },
      { k: "o2", label: "Segundo origen de recursos", type: "select", opts: PAISES, opt: true },
    ],
  },
  {
    id: "canal",
    factor: "Canal de Distribución y Transaccional",
    title: "Canal de distribución y transaccional",
    fields: [
      { k: "cv", label: "Canal de vinculación", type: "select", opts: catOpts("Canal de Vinculación"), req: true },
      { k: "co", label: "Canal de operación", type: "select", opts: catOpts("Canal de Operación"), req: true },
    ],
  },
  {
    id: "comp",
    title: "Compliance Judgment",
    fields: [
      { k: "cj", label: "Juicio de Compliance", type: "select", opts: CFG.listas_auxiliares.compliance_judgment, opt: true, hint: "Solo puede elevar el riesgo a Alto." },
      { k: "cjj", label: "Justificación", type: "textarea", full: true, req: true, cond: (a) => a.cj === ELEVAR_A_ALTO },
    ],
  },
];

export const ALL_FIELDS: FieldDef[] = SECTIONS.flatMap((s) => s.fields);

/** Identification fields are needed to store any evaluation, even a declined one. */
const IDENT_KEYS: AnswerKey[] = ["id", "nombre", "fe", "tipo_eval"];

function isRequired(f: FieldDef, a: Answers): boolean {
  if (f.cond && !f.cond(a)) return false;
  return typeof f.req === "function" ? f.req(a) : !!f.req;
}

/** Required fields that are still empty. */
export function missingFields(a: Answers): FieldDef[] {
  return ALL_FIELDS.filter((f) => isRequired(f, a) && !String(a[f.k] ?? "").trim());
}

/**
 * Missing fields that prevent saving. A declined client can be recorded
 * without completing the questionnaire, but never without identification.
 */
export function blockingFields(a: Answers, x: Evaluation): FieldDef[] {
  const miss = missingFields(a);
  return x.final === "Declinado" ? miss.filter((f) => IDENT_KEYS.includes(f.k)) : miss;
}

// ---------------------------------------------------------------------------
// Server-side sanitising of a submitted answer set
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 200;
const MAX_TEXTAREA = 2000;

export type SanitiseResult =
  | { ok: true; answers: Answers }
  | { ok: false; error: string };

/**
 * Keeps only known keys, trims values and rejects anything that is not a
 * valid option for its field. Does not check for completeness — use
 * blockingFields() for that.
 */
export function sanitiseAnswers(raw: unknown): SanitiseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Respuestas inválidas." };
  }
  const input = raw as Record<string, unknown>;
  const a: Answers = {};

  for (const k of ANSWER_KEYS) {
    const v = input[k];
    if (v == null || v === "") continue;
    if (typeof v !== "string" && typeof v !== "number") {
      return { ok: false, error: `Valor inválido en «${k}».` };
    }
    const s = String(v).trim();
    if (s) a[k] = s;
  }

  for (const f of ALL_FIELDS) {
    const v = a[f.k];
    if (v === undefined) continue;
    if (f.type === "select" && !f.opts!.includes(v)) {
      return { ok: false, error: `Valor inválido en «${f.label}».` };
    }
    if (f.type === "date" && !ISO_DATE.test(v)) {
      return { ok: false, error: `Fecha inválida en «${f.label}».` };
    }
    if (f.type === "money" && !Number.isFinite(Number(v))) {
      return { ok: false, error: `Monto inválido en «${f.label}».` };
    }
    if (f.type === "text" && v.length > MAX_TEXT) {
      return { ok: false, error: `«${f.label}» supera los ${MAX_TEXT} caracteres.` };
    }
    if (f.type === "textarea" && v.length > MAX_TEXTAREA) {
      return { ok: false, error: `«${f.label}» supera los ${MAX_TEXTAREA} caracteres.` };
    }
  }

  if (a.moneda === undefined) a.moneda = "USD";
  if (FX[a.moneda] == null) return { ok: false, error: "Moneda inválida." };

  // Normalise dependent fields so stored answers match what was scored
  if (a.tipo === UNICO) delete a.freq;
  if (a.cj !== ELEVAR_A_ALTO) delete a.cjj;
  if (!OTRO_KEYS.some((k) => a[k] === OTRO)) delete a.otro;

  return { ok: true, answers: a };
}
