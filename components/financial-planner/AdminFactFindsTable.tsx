"use client";

import Link from "next/link";
import { useState } from "react";
import type { FFFactFind } from "@/lib/financial-planner/fact-find-types";

interface AdminFactFindsTableProps {
  factFinds: FFFactFind[];
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  in_progress: { bg: "#fef3c7", text: "#92400e", label: "In Progress" },
  completed: { bg: "#d1fae5", text: "#065f46", label: "Completed" },
  abandoned: { bg: "#f3f4f6", text: "#6b7280", label: "Abandoned" },
};

export default function AdminFactFindsTable({ factFinds }: AdminFactFindsTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [langFilter, setLangFilter] = useState<string>("all");

  const filtered = factFinds.filter((ff) => {
    const client = ff.client as { first_name?: string; last_name?: string; email?: string } | undefined;
    const ifa = (ff as { ifa?: { name?: string } }).ifa;
    const q = search.toLowerCase();

    const matchesSearch =
      !q ||
      `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.toLowerCase().includes(q) ||
      (ifa?.name ?? "").toLowerCase().includes(q) ||
      (client?.email ?? "").toLowerCase().includes(q);

    const matchesStatus = statusFilter === "all" || ff.status === statusFilter;
    const matchesLang = langFilter === "all" || ff.language === langFilter;

    return matchesSearch && matchesStatus && matchesLang;
  });

  const selectClass =
    "px-3 py-2 rounded-lg border text-sm focus:outline-none";
  const selectStyle = { borderColor: "var(--wgi-border)", color: "var(--wgi-text)", background: "white" };

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search client or advisor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] max-w-sm px-4 py-2 rounded-lg border text-sm focus:outline-none"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)", background: "white" }}
        />
        <select className={selectClass} style={selectStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="abandoned">Abandoned</option>
        </select>
        <select className={selectClass} style={selectStyle} value={langFilter} onChange={(e) => setLangFilter(e.target.value)}>
          <option value="all">All languages</option>
          <option value="en">English</option>
          <option value="es">Spanish</option>
        </select>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--wgi-bg)", borderBottom: "1px solid var(--wgi-border)" }}>
              {["Client", "IFA", "Status", "Language", "Progress", "Last Updated", ""].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--wgi-text-muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((ff, i) => {
              const client = ff.client as { first_name?: string; last_name?: string } | undefined;
              const ifa = (ff as { ifa?: { name?: string } }).ifa;
              const statusInfo = STATUS_STYLES[ff.status] ?? STATUS_STYLES.in_progress;
              const progress = Array.isArray(ff.completed_section_keys)
                ? ff.completed_section_keys.length
                : 0;

              return (
                <tr
                  key={ff.id}
                  style={{
                    background: i % 2 === 0 ? "white" : "var(--wgi-bg)",
                    borderBottom: "1px solid var(--wgi-border)",
                  }}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: "var(--wgi-text)" }}>
                    {client?.last_name}, {client?.first_name}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--wgi-text-muted)" }}>
                    {ifa?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: statusInfo.bg, color: statusInfo.text }}
                    >
                      {statusInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono uppercase" style={{ color: "var(--wgi-text-muted)" }}>
                      {ff.language}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--wgi-text-muted)" }}>
                    {progress} sections
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                    {new Date(ff.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/financial-planner/admin/fact-finds/${ff.id}`}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                      style={{ background: "var(--wgi-navy)", color: "white" }}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm" style={{ color: "var(--wgi-text-muted)" }}>
            No fact finds match your filters.
          </div>
        )}
      </div>

      <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
        Showing {filtered.length} of {factFinds.length} fact finds
      </p>
    </div>
  );
}
