"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconClockHour4, IconX } from "@tabler/icons-react";
import {
  Carousel,
  Card,
  type CardType,
} from "@/components/ui/apple-cards-carousel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  const firstName = name.trim().split(/\s+/)[0] ?? name;
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

// ---------------------------------------------------------------------------
// Reusable badge pills
// ---------------------------------------------------------------------------

const LiveBadge = () => (
  <div className="absolute top-5 right-5">
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500 text-white shadow">
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
      Live
    </span>
  </div>
);

const ComingSoonBadge = () => (
  <div className="absolute top-5 right-5">
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500 text-white shadow">
      Coming Soon
    </span>
  </div>
);

// Coming-soon card interior: translucent overlay + large clock watermark
const ComingSoonOverlay = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
    <IconClockHour4
      size={96}
      stroke={0.8}
      className="text-white/15 select-none"
    />
  </div>
);

// ---------------------------------------------------------------------------
// Card definitions
// ---------------------------------------------------------------------------

function buildCards(navigate: (path: string) => void, showToast: () => void): CardType[] {
  return [
    // ── Card 1: Commission (Live) ────────────────────────────────────────
    {
      category: "Live",
      title: "Commission Management",
      description: "Track IFA commissions, approvals and payment history",
      background: (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #1B2D45 0%, #243b55 55%, #141e30 100%)",
          }}
        />
      ),
      extra: <LiveBadge />,
      onClick: () => navigate("/commission"),
    },

    // ── Card 2: Financial Planner (Live) ────────────────────────────────
    {
      category: "Live",
      title: "Financial Planner",
      description: "Comprehensive financial planning tools for advisors",
      background: (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)",
          }}
        />
      ),
      extra: <LiveBadge />,
      onClick: () => navigate("/financial-planner"),
    },

    // ── Card 3: Model Portfolio (Live) ──────────────────────────────────
    {
      category: "Live",
      title: "Model Portfolio",
      description: "Track portfolio performance across all platforms and profiles",
      background: (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #2d3748 0%, #3d4f6b 50%, #2d3748 100%)",
          }}
        />
      ),
      extra: <LiveBadge />,
      onClick: () => navigate("/model-portfolio"),
    },

    // ── Card 4: AI Chatbot (Coming Soon) ────────────────────────────────
    {
      category: "Coming Soon",
      title: "AI Assistant",
      description: "AI-powered advisory support and insights",
      background: (
        <div className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)",
            }}
          />
          <ComingSoonOverlay />
        </div>
      ),
      extra: <ComingSoonBadge />,
      onClick: showToast,
    },
  ];
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-full bg-slate-900 text-white text-sm shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300">
      <span>{message}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-white/60 hover:text-white transition-colors"
      >
        <IconX size={14} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CarouselHubProps {
  name: string;
  role: "admin" | "ifa";
}

export default function CarouselHub({ name, role: _role }: CarouselHubProps) {
  const router = useRouter();
  const [greeting, setGreeting] = useState(`Welcome, ${name.trim().split(/\s+/)[0]}`);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = { current: null as ReturnType<typeof setTimeout> | null };

  // Update greeting to time-aware version after hydration
  useEffect(() => {
    setGreeting(getGreeting(name));
  }, [name]);

  function showToast() {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast("This feature is coming soon. Stay tuned!");
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }

  const cards = buildCards(router.push, showToast);

  const carouselItems = cards.map((card, i) => (
    <Card key={i} card={card} index={i} layout />
  ));

  return (
    <section
      className="min-h-screen w-full"
      style={{ background: "var(--wgi-bg)" }}
    >
      {/* ── Page header ── */}
      <div className="px-6 md:px-10 pt-10 pb-0 max-w-7xl mx-auto">
        <p
          className="text-2xl md:text-3xl font-bold"
          style={{ color: "var(--wgi-text)" }}
        >
          {greeting}
        </p>
        <p
          className="mt-1 text-sm md:text-base"
          style={{ color: "var(--wgi-text-muted)" }}
        >
          Wynn Global Advisor Platform
        </p>
      </div>

      {/* ── Carousel ── */}
      <Carousel items={carouselItems} />

      {/* ── Coming Soon toast ── */}
      {toast && (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      )}
    </section>
  );
}
