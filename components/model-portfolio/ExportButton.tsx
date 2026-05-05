"use client";

import { useState, useRef, useEffect } from "react";
import {
  IconDownload,
  IconChevronDown,
  IconLoader2,
  IconFileText,
  IconTable,
} from "@tabler/icons-react";
import type { StandardReturns, HoldingRow, PeriodReturn } from "@/lib/model-portfolio";
import type { AnnualisedReturns } from "@/lib/analytics";
import { formatReturn } from "@/lib/model-portfolio";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportData {
  platformName:      string;
  profileLabel:      string;
  profileName:       string;
  standardReturns:   StandardReturns;
  annualisedReturns: AnnualisedReturns;
  holdings:          HoldingRow[];
  periods:           PeriodReturn[];
  latestPeriodLabel: string;
}

// ---------------------------------------------------------------------------
// PDF generator
// ---------------------------------------------------------------------------

async function generatePDF(d: ExportData) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const NAVY: [number, number, number] = [27, 45, 69];
  const LIGHT: [number, number, number] = [248, 250, 252];
  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

  // ── Page 1 ──────────────────────────────────────────────────────────────

  // Header bar
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 32, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Wynn Global Insurance", 14, 13);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 220);
  doc.text("Model Portfolio — Performance Report", 14, 21);
  doc.setTextColor(255, 255, 255);
  doc.text(today, 196, 21, { align: "right" });

  // Title block
  doc.setTextColor(...NAVY);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(`${d.platformName}  ·  Perfil ${d.profileLabel}`, 14, 45);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(d.profileName, 14, 52);

  // ── Section 1: Performance Summary ──────────────────────────────────────
  doc.setTextColor(...NAVY);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Performance Summary", 14, 63);

  const si   = d.annualisedReturns["Since Inception"];
  const ann2 = d.annualisedReturns["2Y"].annualised;

  const perfBody: [string, string, string][] = [
    ["1M",              formatReturn(d.standardReturns["1M"]),  ""],
    ["3M",              formatReturn(d.standardReturns["3M"]),  ""],
    ["6M",              formatReturn(d.standardReturns["6M"]),  ""],
    ["YTD",             formatReturn(d.standardReturns["YTD"]), ""],
    ["1 Year",          formatReturn(d.standardReturns["1Y"]),  ""],
    ["2 Years",         formatReturn(d.standardReturns["2Y"]),  ann2   !== null ? `${formatReturn(ann2)} p.a.`  : ""],
    ["Since Inception", formatReturn(si.raw),
      si.annualised !== null
        ? `${formatReturn(si.annualised)} p.a. (${si.years.toFixed(1)} yrs)`
        : ""],
  ];

  autoTable(doc, {
    startY: 66,
    head: [["Period", "Total Return", "Annualised"]],
    body: perfBody,
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 9, fontStyle: "bold" },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 35, halign: "right" },
      2: { cellWidth: 60, halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  // ── Section 2: Current Holdings ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let curY = (doc as any).lastAutoTable?.finalY ?? 110;
  curY += 10;

  doc.setTextColor(...NAVY);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Current Holdings", 14, curY);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(
    d.latestPeriodLabel.replace("Portafolio Modelo ", ""),
    196, curY, { align: "right" }
  );

  const sortedHoldings = [...d.holdings].sort((a, b) => b.weight - a.weight);

  autoTable(doc, {
    startY: curY + 4,
    head: [["Fund", "ISIN", "Weight", "Return", "Contribution"]],
    body: sortedHoldings.map((h) => [
      h.fundName,
      h.isin,
      `${(h.weight * 100).toFixed(0)}%`,
      formatReturn(h.returnPct),
      formatReturn(h.weightedReturn),
    ]),
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 82 },
      1: { cellWidth: 32, font: "courier" },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 24, halign: "right" },
      4: { cellWidth: 24, halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  // ── Page 2: Period History ───────────────────────────────────────────────
  doc.addPage();

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Period Performance History", 14, 12);

  const completedPeriods = d.periods.filter((p) => !p.isOpen);

  autoTable(doc, {
    startY: 22,
    head: [["Period", "Start", "End", "Period Return", "Cumulative Return"]],
    body: completedPeriods.map((p) => [
      p.label.replace(/portafolio\s+modelo\s+/i, ""),
      p.startDate,
      p.endDate ?? "—",
      formatReturn(p.portfolioReturn),
      formatReturn(p.cumulativeReturn),
    ]),
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 22, halign: "center" },
      2: { cellWidth: 22, halign: "center" },
      3: { cellWidth: 30, halign: "right" },
      4: { cellWidth: 36, halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  // ── Footer on every page ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    doc.text(
      `Wynn Global Insurance  ·  Confidential  ·  Page ${i} of ${pageCount}`,
      105, 290, { align: "center" }
    );
  }

  const filename = `WGI_${d.platformName.replace(/\s+/g, "_")}_Perfil${d.profileLabel}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

// ---------------------------------------------------------------------------
// Formats a decimal return as a numeric percentage for Excel cells
function fmtPct(v: number | null): number | string {
  return v !== null ? parseFloat((v * 100).toFixed(4)) : "N/A";
}

// ---------------------------------------------------------------------------
// Excel generator
// ---------------------------------------------------------------------------

async function generateExcel(d: ExportData) {
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString("en-GB");

  // ── Sheet 1: Performance Summary ─────────────────────────────────────────
  const si   = d.annualisedReturns["Since Inception"];
  const ann2 = d.annualisedReturns["2Y"].annualised;

  type Row = (string | number)[];
  const summaryRows: Row[] = [
    ["Wynn Global Insurance — Model Portfolio Report"],
    [`Platform: ${d.platformName}`, `Profile: Perfil ${d.profileLabel} (${d.profileName})`],
    [`Generated: ${today}`],
    [],
    ["Period", "Total Return (%)", "Annualised Return (% p.a.)", "Notes"],
    ["1M",  fmtPct(d.standardReturns["1M"]),  "", ""],
    ["3M",  fmtPct(d.standardReturns["3M"]),  "", ""],
    ["6M",  fmtPct(d.standardReturns["6M"]),  "", ""],
    ["YTD", fmtPct(d.standardReturns["YTD"]), "", ""],
    ["1 Year",          fmtPct(d.standardReturns["1Y"]), fmtPct(d.standardReturns["1Y"]),   ""],
    ["2 Years",         fmtPct(d.standardReturns["2Y"]), fmtPct(ann2), ""],
    ["Since Inception", fmtPct(si.raw), fmtPct(si.annualised), `${si.years.toFixed(1)} years`],
  ];

  const summaryWS = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWS["!cols"] = [{ wch: 20 }, { wch: 18 }, { wch: 24 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summaryWS, "Performance Summary");

  // ── Sheet 2: Current Holdings ─────────────────────────────────────────────
  const holdingHeader = [
    "Fund Name", "ISIN", "Weight (%)",
    "Initial Price", "Final Price", "Return (%)", "Contribution (%)",
  ];
  const holdingRows = [...d.holdings]
    .sort((a, b) => b.weight - a.weight)
    .map((h) => [
      h.fundName,
      h.isin,
      parseFloat((h.weight * 100).toFixed(2)),
      h.initialPrice ?? "",
      h.finalPrice   ?? "",
      h.returnPct      !== null ? parseFloat((h.returnPct * 100).toFixed(4))      : "",
      h.weightedReturn !== null ? parseFloat((h.weightedReturn * 100).toFixed(4)) : "",
    ]);

  const holdingsWS = XLSX.utils.aoa_to_sheet([holdingHeader, ...holdingRows]);
  holdingsWS["!cols"] = [
    { wch: 55 }, { wch: 16 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, holdingsWS, "Current Holdings");

  // ── Sheet 3: Period History ───────────────────────────────────────────────
  const histHeader = [
    "Period", "Start Date", "End Date",
    "Period Return (%)", "Cumulative Return (%)",
  ];
  const histRows = d.periods
    .filter((p) => !p.isOpen)
    .map((p) => [
      p.label.replace(/portafolio\s+modelo\s+/i, ""),
      p.startDate,
      p.endDate ?? "",
      parseFloat((p.portfolioReturn  * 100).toFixed(4)),
      parseFloat((p.cumulativeReturn * 100).toFixed(4)),
    ]);

  const histWS = XLSX.utils.aoa_to_sheet([histHeader, ...histRows]);
  histWS["!cols"] = [
    { wch: 42 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, histWS, "Period History");

  const filename = `WGI_${d.platformName.replace(/\s+/g, "_")}_Perfil${d.profileLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExportButton(props: ExportData) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState<"pdf" | "excel" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleExport(type: "pdf" | "excel") {
    setOpen(false);
    setLoading(type);
    try {
      if (type === "pdf") {
        await generatePDF(props);
      } else {
        await generateExcel(props);
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={loading !== null}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-60"
        style={{
          background:   "white",
          borderColor:  "var(--wgi-border)",
          color:        "var(--wgi-text)",
        }}
      >
        {loading ? (
          <IconLoader2 size={15} className="animate-spin" />
        ) : (
          <IconDownload size={15} />
        )}
        {loading === "pdf"
          ? "Generating PDF…"
          : loading === "excel"
          ? "Generating Excel…"
          : "Export"}
        {!loading && <IconChevronDown size={13} />}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1.5 w-48 rounded-xl border shadow-lg overflow-hidden z-20"
          style={{ background: "white", borderColor: "var(--wgi-border)" }}
        >
          <button
            onClick={() => handleExport("pdf")}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-slate-50"
            style={{ color: "var(--wgi-text)" }}
          >
            <IconFileText size={16} className="text-red-500" />
            <div>
              <p className="font-semibold">Download PDF</p>
              <p className="text-[11px]" style={{ color: "var(--wgi-text-muted)" }}>
                Full report with tables
              </p>
            </div>
          </button>

          <div className="h-px" style={{ background: "var(--wgi-border)" }} />

          <button
            onClick={() => handleExport("excel")}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-slate-50"
            style={{ color: "var(--wgi-text)" }}
          >
            <IconTable size={16} className="text-emerald-600" />
            <div>
              <p className="font-semibold">Download Excel</p>
              <p className="text-[11px]" style={{ color: "var(--wgi-text-muted)" }}>
                3 sheets: summary, holdings, history
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
