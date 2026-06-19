"use client";

import { useEffect, useState } from "react";
import { IconBuilding, IconLoader2, IconPlus } from "@tabler/icons-react";

interface Platform {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  platforms: Platform[];
  onCreated: () => void;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function PlatformManager({ platforms: initialPlatforms, onCreated }: Props) {
  const [platforms, setPlatforms] = useState(initialPlatforms);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setPlatforms(initialPlatforms);
  }, [initialPlatforms]);

  async function refreshPlatforms() {
    const res = await fetch("/api/model-portfolio/admin/platforms", { cache: "no-store" });
    const data = await res.json();
    if (Array.isArray(data)) setPlatforms(data);
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/model-portfolio/admin/platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create platform");
        return;
      }

      setSuccess(`${data.platform.name} added — /model-portfolio/${data.platform.slug}`);
      setName("");
      setSlug("");
      setSlugTouched(false);
      setPlatforms((prev) => {
        if (prev.some((p) => p.id === data.platform.id)) return prev;
        return [...prev, data.platform].sort((a, b) => a.name.localeCompare(b.name));
      });
      await refreshPlatforms();
      onCreated();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-2xl border p-6 space-y-5"
      style={{ borderColor: "var(--wgi-border)", background: "white" }}
    >
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--wgi-text)" }}>
          <IconBuilding size={18} />
          Life companies
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--wgi-text-muted)" }}>
          Register a new life company, then add compositions for profiles A–D or A–D+ (including C+ and D+).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {platforms.map((p) => (
          <a
            key={p.id}
            href={`/model-portfolio/${p.slug}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-slate-50"
            style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
          >
            {p.name}
            <span style={{ color: "var(--wgi-text-muted)" }}>({p.slug})</span>
          </a>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <label className="block">
          <span className="text-xs font-semibold" style={{ color: "var(--wgi-text-muted)" }}>
            Company name
          </span>
          <input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. New Life Co"
            required
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--wgi-border)" }}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold" style={{ color: "var(--wgi-text-muted)" }}>
            URL slug
          </span>
          <input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="new-life-co"
            required
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-mono"
            style={{ borderColor: "var(--wgi-border)" }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--wgi-navy)" }}
        >
          {loading ? <IconLoader2 size={15} className="animate-spin" /> : <IconPlus size={15} />}
          Add company
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}
    </div>
  );
}
