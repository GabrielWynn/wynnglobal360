"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconLogout, IconSettings } from "@tabler/icons-react";
import { createBrowserClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns up to 2 uppercase initials from a display name. */
function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join("");
}

interface IFAProfile {
  name: string;
  role: "admin" | "ifa";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Navbar() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [profile, setProfile] = useState<IFAProfile | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // ------------------------------------------------------------------
  // Fetch the IFA profile once the browser session is available
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || cancelled) return;

      const { data } = await supabase
        .from("ifas")
        .select("name, role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (data && !cancelled) {
        setProfile({ name: data.name, role: data.role });
      }
    }

    loadProfile();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Sign out
  // ------------------------------------------------------------------
  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-40 h-16 bg-white shadow-sm flex items-center px-6 border-b"
      style={{ borderColor: "var(--wgi-border)" }}
    >
      {/* ── Logo ── */}
      <Link href="/advisors" className="flex-shrink-0 flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Wynn Global Insurance"
          style={{ height: "36px", width: "auto" }}
        />
      </Link>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Right side ── */}
      <div className="flex items-center gap-3">

        {/* Admin panel link — only for admins */}
        {profile?.role === "admin" && (
          <Link
            href="/admin"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-90"
            style={{ background: "var(--wgi-navy)", color: "white" }}
          >
            <IconSettings size={13} stroke={2} />
            Admin Panel
          </Link>
        )}

        {/* Name + avatar — visible once profile loads */}
        {profile ? (
          <div className="flex items-center gap-3">
            {/* Name / role label (hidden on small screens) */}
            <div className="hidden sm:block text-right">
              <p
                className="text-sm font-medium leading-tight"
                style={{ color: "var(--wgi-text)" }}
              >
                {profile.name}
              </p>
              {profile.role === "admin" && (
                <p
                  className="text-xs leading-tight"
                  style={{ color: "var(--wgi-text-muted)" }}
                >
                  Administrator
                </p>
              )}
            </div>

            {/* Avatar circle */}
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold text-white select-none"
              style={{ background: "var(--wgi-navy)" }}
              title={profile.name}
            >
              {getInitials(profile.name)}
            </div>
          </div>
        ) : (
          /* Skeleton placeholder while loading */
          <div className="flex items-center gap-3">
            <div className="hidden sm:block space-y-1.5">
              <div className="h-3 w-24 rounded bg-slate-100 animate-pulse" />
              <div className="h-2.5 w-16 rounded bg-slate-100 animate-pulse" />
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-100 animate-pulse" />
          </div>
        )}

        {/* Vertical divider */}
        <div
          className="w-px h-6 flex-shrink-0"
          style={{ background: "var(--wgi-border)" }}
        />

        {/* Sign out button */}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          title="Sign out"
          className="flex items-center gap-2 text-sm transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ color: "var(--wgi-text-muted)" }}
        >
          <IconLogout size={17} stroke={1.75} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </nav>
  );
}
