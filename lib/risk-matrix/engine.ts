// ---------------------------------------------------------------------------
// Matriz de Riesgo PLAyFT — scoring engine.
// Pure functions shared by the form (live preview) and the API route, which
// recomputes the result server-side before saving.
// ---------------------------------------------------------------------------

import { CFG, type Banda, type Riesgo } from "./config";

export const ANSWER_KEYS = [
  "id", "nombre", "fe", "tipo_eval",
  "fn", "pep", "hall", "civil", "perfil", "prof", "ocup", "act", "otro",
  "tipo", "estado", "monto", "moneda", "freq", "metodo",
  "nac1", "nac2", "pnac", "dom", "fis", "dest", "o1", "o2",
  "cv", "co",
  "cj", "cjj",
] as const;

export type AnswerKey = (typeof ANSWER_KEYS)[number];
export type Answers = Partial<Record<AnswerKey, string>>;

export interface FactorScore {
  factor: string;
  peso: number;
  score: number | null;
}

export interface Evaluation {
  edad: number | null;
  menor: boolean;
  edadRango: string | null;
  edadNivel: Riesgo | null;
  freqa: string;
  usd: number | null;
  montoRango: string | null;
  montoNivel: Riesgo | null;
  pts: Record<string, number | null>;
  factores: FactorScore[];
  completo: boolean;
  score: number | null;
  clasifScore: Riesgo | null;
  motivoDecl: string[];
  motivoDisp: string[];
  final: string;
  regla: string;
  dd: string | null;
  meses: number | null;
  proxima: string | null;
  alertas: string[];
  version: string;
}

/** Shape persisted in rm_evaluations.result. */
export interface StoredResult {
  score: number | null;
  clasificacion_score: Riesgo | null;
  final: string;
  regla: string;
  factores: FactorScore[];
  puntos: Record<string, number | null>;
  edad: number | null;
  rango_edad: string | null;
  frecuencia_aplicada: string;
  monto_usd: number | null;
  rango_monto: string | null;
  debida_diligencia: string | null;
  revision_meses: number | null;
  proxima_revision: string | null;
  alertas: string[];
}

// ---------------------------------------------------------------------------
// Lookups derived from the configuration
// ---------------------------------------------------------------------------

const N = CFG.escala.niveles;
const CUT = CFG.escala.cortes_clasificacion;

const catRisk: Record<string, Record<string, Riesgo>> = {};
for (const [code, items] of Object.entries(CFG.catalogos)) {
  catRisk[code] = {};
  items.forEach((i) => (catRisk[code][i.valor] = i.riesgo));
}

const paisRisk: Record<string, Riesgo> = {};
CFG.paises.forEach((p) => (paisRisk[p.pais] = p.riesgo));

export const FX: Record<string, number> = {};
CFG.tipos_de_cambio_usd.forEach((f) => (FX[f.moneda] = f.usd_por_unidad));

/** Countries that force a "Declinado" result. */
export const PAISES_DECLINADOS = CFG.paises
  .filter((p) => p.iso2 !== null && CFG.reglas.declinado.paises_iso.includes(p.iso2))
  .map((p) => p.pais);

export const UNICO = "Aporte Único";
export const ELEVAR_A_ALTO = CFG.reglas.disparo_alto.compliance_judgment;
export const OTRO = "Otro";

/** Fields whose "Otro" option requires a free-text specification. */
export const OTRO_KEYS: AnswerKey[] = [
  "prof", "ocup", "act", "nac1", "nac2", "pnac", "dom", "fis", "o1", "o2", "dest",
];

const SANCIONES = CFG.reglas.declinado.hallazgo;
const ALERTA_DATOS = "Faltan datos para calcular el score";
export { ALERTA_DATOS };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

function band(rows: Banda[], x: number): Banda | null {
  let hit: Banda | null = null;
  rows.forEach((r) => {
    if (x >= r.desde) hit = r;
  });
  return hit;
}

/** Whole years between two ISO dates (YYYY-MM-DD). */
function edad(fn?: string, fe?: string): number | null {
  if (!fn || !fe) return null;
  const a = new Date(fn + "T00:00:00");
  const b = new Date(fe + "T00:00:00");
  if (isNaN(a.getTime()) || isNaN(b.getTime()) || a > b) return null;
  let y = b.getFullYear() - a.getFullYear();
  if (
    b.getMonth() < a.getMonth() ||
    (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())
  ) {
    y--;
  }
  return y;
}

/** Adds months to an ISO date, clamping to the last day of the target month. */
function addMonths(iso: string, months: number): string | null {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function cat(code: string, v?: string): number | null {
  if (!v) return null;
  const r = catRisk[code][v];
  return r ? N[r] : null;
}

function pais(v?: string): number | null {
  if (!v) return null;
  const r = paisRisk[v];
  return r ? N[r] : null;
}

/** Highest risk between a required country and an optional second one. */
function pmax(a?: string, b?: string): number | null {
  if (!a) return null;
  const p = pais(a);
  if (!b) return p;
  const q = pais(b);
  return p == null || q == null ? null : Math.max(p, q);
}

type Derived = Pick<Evaluation, "edadNivel" | "montoNivel" | "freqa">;

// Sub-factor → how its points are obtained
const SUB: Record<string, (a: Answers, x: Derived) => number | null> = {
  "Persona Políticamente Expuesta (PEP)": (a) => cat("¿Es PEP?", a.pep),
  "Coincidencias en listas / fuentes abiertas": (a) =>
    cat("Coincidencias en listas / fuentes abiertas", a.hall),
  "Edad": (_a, x) => (x.edadNivel ? N[x.edadNivel] : null),
  "Estado civil": (a) => cat("Estado Civil", a.civil),
  "Profesión": (a) => cat("Profesión", a.prof),
  "Ocupación": (a) => cat("Ocupación", a.ocup),
  "Actividad Economica": (a) => cat("Actividad Económica", a.act),
  "Perfil de inversionista": (a) => cat("Perfil de Inversionista", a.perfil),
  "Tipo de Plan de inversión": (a) => cat("Tipo de Plan", a.tipo),
  "Estado del Plan": (a) => cat("Estado del Plan", a.estado),
  "Monto del aporte": (_a, x) => (x.montoNivel ? N[x.montoNivel] : null),
  "Frecuencia del aporte": (_a, x) => cat("Frecuencia del Aporte", x.freqa),
  "Metodo de Pago": (a) => cat("Método de Pago", a.metodo),
  "Nacionalidad": (a) => pmax(a.nac1, a.nac2),
  "País de Nacimiento": (a) => pais(a.pnac),
  "País de domicilio": (a) => pais(a.dom),
  "País de residencia fiscal": (a) => pais(a.fis),
  "Origen de recursos": (a) => pmax(a.o1, a.o2),
  "Destino de recursos": (a) => pais(a.dest),
  "Canal de vinculación": (a) => cat("Canal de Vinculación", a.cv),
  "Canal de Operación": (a) => cat("Canal de Operación", a.co),
};

// ---------------------------------------------------------------------------
// evaluate
// ---------------------------------------------------------------------------

export function evaluate(a: Answers): Evaluation {
  const isDecl = (v?: string) => !!v && PAISES_DECLINADOS.includes(v);

  // Edad
  const years = edad(a.fn, a.fe);
  const menor = years != null && years < CFG.bandas.edad[0].desde;
  let edadRango: string | null = null;
  let edadNivel: Riesgo | null = null;
  if (years != null && !menor) {
    const b = band(CFG.bandas.edad, years);
    if (b) {
      edadRango = b.rango;
      edadNivel = b.riesgo;
    }
  } else if (menor) {
    edadRango = "Menor de edad";
  }

  // Frecuencia: forzada a "Aporte Único" si el plan es de aporte único
  const freqa = a.tipo === UNICO ? UNICO : a.freq || "";

  // Monto en USD y su banda
  const monto = parseFloat(a.monto ?? "");
  let usd: number | null = null;
  let montoRango: string | null = null;
  let montoNivel: Riesgo | null = null;
  if (!isNaN(monto) && a.moneda && FX[a.moneda] != null) {
    usd = r2(monto * FX[a.moneda]);
    if (a.tipo && usd > 0) {
      const b = band(
        a.tipo === UNICO
          ? CFG.bandas.monto_aporte_unico_usd
          : CFG.bandas.monto_aporte_regular_usd_por_pago,
        usd
      );
      if (b) {
        montoRango = b.rango;
        montoNivel = b.riesgo;
      }
    }
  }

  // Puntos por sub-factor y score ponderado
  const derived: Derived = { edadNivel, montoNivel, freqa };
  const pts: Record<string, number | null> = {};
  const factores: FactorScore[] = [];
  let completo = true;
  let total = 0;
  for (const f of CFG.factores) {
    let s = 0;
    let ok = true;
    for (const sf of f.subfactores) {
      const p = SUB[sf.subfactor](a, derived);
      pts[sf.subfactor] = p;
      if (p == null) ok = false;
      else s += p * sf.ponderacion_interna;
    }
    factores.push({ factor: f.factor, peso: f.ponderacion, score: ok ? s : null });
    if (!ok) completo = false;
    else total += s * f.ponderacion;
  }
  const score = completo ? r2(total) : null;
  const clasifScore: Riesgo | null =
    score == null
      ? null
      : Math.round(score) >= CUT.Alto
        ? "Alto"
        : Math.round(score) >= CUT.Medio
          ? "Medio"
          : "Bajo";

  // Reglas de prioridad
  const motivoDecl: string[] = [];
  if (isDecl(a.nac1) || isDecl(a.nac2)) motivoDecl.push("Nacionalidad");
  if (isDecl(a.dom)) motivoDecl.push("País de domicilio");
  if (isDecl(a.fis)) motivoDecl.push("País de residencia fiscal");
  if (isDecl(a.o1) || isDecl(a.o2)) motivoDecl.push("Origen de recursos");
  if (a.hall === SANCIONES) motivoDecl.push("Lista de sanciones");

  const motivoDisp: string[] = [];
  if (a.pep === CFG.reglas.disparo_alto.pep) motivoDisp.push("PEP");
  if (a.hall === CFG.reglas.disparo_alto.hallazgos) motivoDisp.push("Hallazgos Negativos");
  if (a.cj === ELEVAR_A_ALTO) motivoDisp.push("Compliance Judgment");

  let final: string;
  let regla: string;
  if (motivoDecl.length) {
    final = "Declinado";
    regla = "Declinado: " + motivoDecl.join("; ");
  } else if (menor) {
    final = "Revisión manual";
    regla = "Revisión manual: cliente menor de edad";
  } else if (motivoDisp.length) {
    final = "Alto";
    regla = "Disparo a Alto: " + motivoDisp.join("; ");
  } else if (!completo) {
    final = "Pendiente de datos";
    regla = "Pendiente: datos incompletos";
  } else {
    final = clasifScore as string;
    regla = "Score calculado";
  }

  const dd = CFG.debida_diligencia.find((d) => d.clasificacion === final);
  const meses = dd ? dd.revision_meses : null;
  const proxima = meses && a.fe ? addMonths(a.fe, meses) : null;

  // Alertas
  const alertas: string[] = [];
  if (!a.id) alertas.push("Falta ID de cliente");
  if (!a.fe) alertas.push("Falta fecha de evaluación");
  if (a.fn && a.fe && a.fn > a.fe) alertas.push("Fecha de nacimiento posterior a la evaluación");
  if (menor) alertas.push("Cliente menor de edad");
  if (OTRO_KEYS.some((k) => a[k] === OTRO) && !a.otro) alertas.push("Especificar valor Otro");
  if (a.tipo && a.tipo !== UNICO && a.freq === UNICO) {
    alertas.push("Frecuencia Aporte Único con plan de Aporte Regular");
  }
  if (!isNaN(monto) && monto <= 0) alertas.push("Monto debe ser mayor a 0");
  if (a.cj === ELEVAR_A_ALTO && !a.cjj) alertas.push("Falta justificación de Compliance");
  if (!completo) alertas.push(ALERTA_DATOS);

  return {
    edad: years,
    menor,
    edadRango,
    edadNivel,
    freqa,
    usd,
    montoRango,
    montoNivel,
    pts,
    factores,
    completo,
    score,
    clasifScore,
    motivoDecl,
    motivoDisp,
    final,
    regla,
    dd: dd ? dd.nivel : null,
    meses,
    proxima,
    alertas,
    version: CFG.version,
  };
}

export function toStoredResult(x: Evaluation): StoredResult {
  return {
    score: x.score,
    clasificacion_score: x.clasifScore,
    final: x.final,
    regla: x.regla,
    factores: x.factores,
    puntos: x.pts,
    edad: x.edad,
    rango_edad: x.edadRango,
    frecuencia_aplicada: x.freqa,
    monto_usd: x.usd,
    rango_monto: x.montoRango,
    debida_diligencia: x.dd,
    revision_meses: x.meses,
    proxima_revision: x.proxima,
    alertas: x.alertas,
  };
}
