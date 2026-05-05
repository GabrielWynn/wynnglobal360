"use client";

import Link from "next/link";
import { IconRefresh, IconChevronLeft } from "@tabler/icons-react";

interface Props {
  error:  Error & { digest?: string };
  reset:  () => void;
}

export default function ProfileError({ error, reset }: Props) {
  return (
    <div className="max-w-lg mx-auto px-6 py-20 text-center">
      <p className="text-4xl mb-4">⚠️</p>
      <h1 className="text-xl font-bold mb-2" style={{ color: "var(--wgi-text)" }}>
        Failed to load portfolio
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--wgi-text-muted)" }}>
        {error.message || "An unexpected error occurred while fetching portfolio data."}
      </p>
      <div className="flex justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: "var(--wgi-navy)" }}
        >
          <IconRefresh size={15} />
          Try again
        </button>
        <Link
          href="/model-portfolio"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
        >
          <IconChevronLeft size={15} />
          Back to overview
        </Link>
      </div>
    </div>
  );
}
