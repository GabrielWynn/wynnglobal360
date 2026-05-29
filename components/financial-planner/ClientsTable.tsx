"use client";

import Link from "next/link";
import { useState } from "react";
import type { FFClient } from "@/lib/financial-planner/fact-find-types";
import { formatDateDisplay } from "@/lib/financial-planner/fact-find-types";

interface ClientsTableProps {
  clients: FFClient[];
}

export default function ClientsTable({ clients }: ClientsTableProps) {
  const [search, setSearch] = useState("");

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q)
    );
  });

  if (clients.length === 0) {
    return (
      <div
        className="text-center py-16 rounded-xl border"
        style={{ borderColor: "var(--wgi-border)", background: "var(--wgi-bg)" }}
      >
        <p className="text-sm font-medium mb-1" style={{ color: "var(--wgi-text)" }}>
          No clients yet
        </p>
        <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
          Create your first client to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        placeholder="Search clients…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm px-4 py-2 rounded-lg border text-sm focus:outline-none"
        style={{
          borderColor: "var(--wgi-border)",
          color: "var(--wgi-text)",
          background: "white",
        }}
      />

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--wgi-bg)", borderBottom: "1px solid var(--wgi-border)" }}>
              {["Name", "Email", "Phone", "Date of Birth", ""].map((h) => (
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
            {filtered.map((client, i) => (
              <tr
                key={client.id}
                style={{
                  background: i % 2 === 0 ? "white" : "var(--wgi-bg)",
                  borderBottom: "1px solid var(--wgi-border)",
                }}
              >
                <td className="px-4 py-3 font-medium" style={{ color: "var(--wgi-text)" }}>
                  {client.last_name}, {client.first_name}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--wgi-text-muted)" }}>
                  {client.email ?? "—"}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--wgi-text-muted)" }}>
                  {client.phone ?? "—"}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--wgi-text-muted)" }}>
                  {formatDateDisplay(client.date_of_birth)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/financial-planner/clients/${client.id}`}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: "var(--wgi-navy)", color: "white" }}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm" style={{ color: "var(--wgi-text-muted)" }}>
            No clients match your search.
          </div>
        )}
      </div>
    </div>
  );
}
