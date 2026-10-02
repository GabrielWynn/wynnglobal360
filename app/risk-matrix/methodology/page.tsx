import { Fragment } from "react";
import RiskPill from "@/components/risk-matrix/RiskPill";
import { CFG } from "@/lib/risk-matrix/config";
import { PAISES_DECLINADOS } from "@/lib/risk-matrix/engine";
import { fmtDate, fmtNum } from "@/lib/risk-matrix/format";

export default function MethodologyPage() {
  const N = CFG.escala.niveles;
  const CUT = CFG.escala.cortes_clasificacion;

  const cardStyle = { borderColor: "var(--wgi-border)", background: "white" };
  const h2 = "text-base font-semibold px-5 pt-5 pb-3";
  const th = "px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap";
  const headRow = {
    background: "var(--wgi-bg)",
    borderTop: "1px solid var(--wgi-border)",
    borderBottom: "1px solid var(--wgi-border)",
    color: "var(--wgi-text-muted)",
  };
  const rowBorder = { borderBottom: "1px solid var(--wgi-border)" };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
          Metodología v{CFG.version}
        </h1>
        <p className="text-sm mt-1 max-w-3xl" style={{ color: "var(--wgi-text-muted)" }}>
          Cada respuesta se convierte en puntos según su nivel de riesgo (Bajo {N.Bajo}, Medio{" "}
          {N.Medio}, Alto {N.Alto}). Los puntos se ponderan por sub-factor y por factor para
          obtener un score de 0 a 100. Vigente desde el {fmtDate(CFG.fecha_version)} ·{" "}
          {CFG.tipo_cliente}.
        </p>
      </div>

      <div className="flex flex-col gap-4" style={{ color: "var(--wgi-text)" }}>
        {/* ── Priority order ── */}
        <div className="rounded-xl border px-5 py-5" style={cardStyle}>
          <h2 className="text-base font-semibold mb-3">Orden de prioridad</h2>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm">
            <li>
              <b className="font-semibold">Declinado</b> si alguna nacionalidad, el país de
              domicilio, el de residencia fiscal o algún origen de recursos es{" "}
              {PAISES_DECLINADOS.join(", ")}; o si hay coincidencia en lista de sanciones.
            </li>
            <li>
              <b className="font-semibold">Revisión manual</b> si el cliente es menor de{" "}
              {CFG.bandas.edad[0].desde} años.
            </li>
            <li>
              <b className="font-semibold">Alto</b> si es PEP «Sí», tiene Hallazgos Negativos o
              Compliance eleva el riesgo.
            </li>
            <li>
              <b className="font-semibold">Pendiente de datos</b> si falta información para
              calcular el score.
            </li>
            <li>
              <b className="font-semibold">Clasificación por score</b>: Bajo de 0 a{" "}
              {CUT.Medio - 1}, Medio de {CUT.Medio} a {CUT.Alto - 1}, Alto de {CUT.Alto} a 100.
            </li>
          </ol>
        </div>

        {/* ── Weights ── */}
        <div className="rounded-xl border overflow-hidden" style={cardStyle}>
          <h2 className={h2}>Ponderaciones</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={headRow}>
                  <th className={`${th} text-left`}>Factor / sub-factor</th>
                  <th className={`${th} text-right`}>Ponderación</th>
                  <th className={`${th} text-right`}>Peso efectivo</th>
                </tr>
              </thead>
              <tbody>
                {CFG.factores.map((f) => (
                  <Fragment key={f.factor}>
                    <tr style={{ ...rowBorder, background: "var(--wgi-bg)" }}>
                      <td className="px-4 py-2.5 font-semibold">{f.factor}</td>
                      <td className="rm-num px-4 py-2.5 text-right font-semibold">
                        {fmtNum(f.ponderacion * 100, 0)}%
                      </td>
                      <td />
                    </tr>
                    {f.subfactores.map((s) => (
                      <tr key={s.subfactor} style={rowBorder}>
                        <td className="pl-8 pr-4 py-2.5">{s.subfactor}</td>
                        <td className="rm-num px-4 py-2.5 text-right">
                          {fmtNum(s.ponderacion_interna * 100)}%
                        </td>
                        <td className="rm-num px-4 py-2.5 text-right">
                          {fmtNum(s.ponderacion_efectiva * 100)}%
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Due diligence ── */}
        <div className="rounded-xl border overflow-hidden" style={cardStyle}>
          <h2 className={h2}>Debida diligencia y revisión</h2>
          <table className="w-full text-sm">
            <thead>
              <tr style={headRow}>
                <th className={`${th} text-left`}>Clasificación</th>
                <th className={`${th} text-left`}>Nivel</th>
                <th className={`${th} text-left`}>Revisión</th>
              </tr>
            </thead>
            <tbody>
              {CFG.debida_diligencia.map((d) => (
                <tr key={d.clasificacion} style={rowBorder}>
                  <td className="px-4 py-2.5">
                    <RiskPill value={d.clasificacion} />
                  </td>
                  <td className="px-4 py-2.5">{d.nivel}</td>
                  <td className="px-4 py-2.5" style={{ color: "var(--wgi-text-muted)" }}>
                    {d.revision_meses ? `Cada ${d.revision_meses} meses` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── FX rates ── */}
        <div className="rounded-xl border overflow-hidden" style={cardStyle}>
          <h2 className={h2}>Tipos de cambio</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={headRow}>
                  <th className={`${th} text-left`}>Moneda</th>
                  <th className={`${th} text-right`}>USD por unidad</th>
                  <th className={`${th} text-left`}>Actualizado</th>
                  <th className={`${th} text-left`}>Fuente</th>
                </tr>
              </thead>
              <tbody>
                {CFG.tipos_de_cambio_usd.map((f) => (
                  <tr key={f.moneda} style={rowBorder}>
                    <td className="px-4 py-2.5 font-medium">{f.moneda}</td>
                    <td className="rm-num px-4 py-2.5 text-right">{fmtNum(f.usd_por_unidad, 4)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "var(--wgi-text-muted)" }}>
                      {fmtDate(f.fecha)}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--wgi-text-muted)" }}>
                      {f.fuente}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
