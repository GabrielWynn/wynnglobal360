"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAuthHeaders } from "@/lib/supabase";
import type { FFLanguage } from "@/lib/financial-planner/fact-find-types";

export default function NewFactFindPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get("clientId") ?? "";

  const [language, setLanguage] = useState<FFLanguage | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (!language) {
      setError("Please select a language for this session.");
      return;
    }
    if (!clientId) {
      setError("No client specified.");
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/financial-planner/fact-finds", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, language }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create fact find");
        return;
      }
      router.push(`/financial-planner/fact-find/${data.fact_find.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-16">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
          Start Fact Find Session
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--wgi-text-muted)" }}>
          Choose the language for this session. All form labels, placeholders, and options
          will be shown in the selected language throughout the session.
        </p>
      </div>

      <div
        className="rounded-xl border p-6 flex flex-col gap-5"
        style={{ borderColor: "var(--wgi-border)", background: "white" }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
          Session Language / Idioma de la Sesión
        </p>

        <div className="grid grid-cols-2 gap-4">
          {[
            {
              value: "en" as FFLanguage,
              flag: "🇬🇧",
              title: "English",
              desc: "All questions in English",
            },
            {
              value: "es" as FFLanguage,
              flag: "🇪🇸",
              title: "Español",
              desc: "Todas las preguntas en español",
            },
          ].map(({ value, flag, title, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setLanguage(value);
                setError(null);
              }}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all hover:opacity-90"
              style={
                language === value
                  ? { borderColor: "var(--wgi-navy)", background: "#eff6ff" }
                  : { borderColor: "var(--wgi-border)", background: "var(--wgi-bg)" }
              }
            >
              <span className="text-4xl">{flag}</span>
              <span className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
                {title}
              </span>
              <span className="text-xs text-center" style={{ color: "var(--wgi-text-muted)" }}>
                {desc}
              </span>
              {language === value && (
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: "var(--wgi-navy)" }}
                >
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div
            className="px-4 py-3 rounded-lg text-sm"
            style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleStart}
            disabled={starting || !language}
            className="flex-1 py-3 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--wgi-navy)" }}
          >
            {starting ? "Starting…" : "Start Session →"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-3 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
            style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
