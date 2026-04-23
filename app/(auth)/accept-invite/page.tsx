"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Shared input style — mirrors login page
// ---------------------------------------------------------------------------
const inputBase =
  "w-full px-4 py-3 rounded-lg border text-sm transition-colors " +
  "focus:outline-none focus:ring-2 focus:ring-offset-0";

const inputStyle: React.CSSProperties = {
  borderColor: "var(--wgi-border)",
  color: "var(--wgi-text)",
  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)",
};

// ---------------------------------------------------------------------------
// Page
// Supabase invite links embed the token in the URL hash (#access_token=…&type=invite).
// The browser client exchanges it automatically and fires SIGNED_IN via
// onAuthStateChange.  We wait for that event, then let the user set a password.
// ---------------------------------------------------------------------------
export default function AcceptInvitePage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  // 'loading'  → waiting for Supabase to exchange the invite hash
  // 'ready'    → session confirmed, show set-password form
  // 'invalid'  → hash missing or token expired
  type Status = "loading" | "ready" | "invalid";
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<Session | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Exchange the invite hash → session
  // Supabase fires SIGNED_IN when #type=invite is processed.
  // ------------------------------------------------------------------
  useEffect(() => {
    // Check for an existing session first (page refresh after hash consumed)
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) {
        setSession(s);
        setStatus("ready");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" && s) {
        setSession(s);
        setStatus("ready");
      }
    });

    // Give Supabase 4 s to process the hash before declaring it invalid
    const timeout = setTimeout(() => {
      setStatus((prev) => (prev === "loading" ? "invalid" : prev));
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Submit — set password then link IFA row
  // ------------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // Refresh session so we have a fresh access_token after updateUser
    const {
      data: { session: fresh },
    } = await supabase.auth.getSession();

    const token = fresh?.access_token ?? session?.access_token;

    // Link the newly-confirmed user_id to their ifas row
    if (token) {
      try {
        await fetch("/api/auth/link-ifa", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
      } catch {
        // Non-blocking — proceed even if linking fails; middleware/login will retry
      }
    }

    router.push("/advisors");
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-14 bg-white">
      <div className="w-full max-w-[400px]">

        {/* Logo */}
        <div className="flex justify-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Wynn Global Insurance"
            style={{ height: "40px", width: "auto" }}
          />
        </div>

        {/* ── Loading state ── */}
        {status === "loading" && (
          <div className="text-center">
            <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
              Verifying your invitation…
            </p>
          </div>
        )}

        {/* ── Invalid / expired invite ── */}
        {status === "invalid" && (
          <div className="text-center space-y-4">
            <div className="px-4 py-3 rounded-lg border border-red-200 bg-red-50">
              <p className="text-sm text-red-700">
                This invitation link is invalid or has expired. Please contact
                your administrator for a new invite.
              </p>
            </div>
            <button
              onClick={() => router.push("/login")}
              className="text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--wgi-accent)" }}
            >
              Back to sign in
            </button>
          </div>
        )}

        {/* ── Ready — set-password form ── */}
        {status === "ready" && (
          <>
            <div className="mb-8">
              <h2
                className="text-2xl font-bold"
                style={{ color: "var(--wgi-text)" }}
              >
                Accept invitation
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--wgi-text-muted)" }}
              >
                Set a password to activate your advisor account.
              </p>
              {/* Show the invited email as a read-only hint */}
              {session?.user.email && (
                <p
                  className="mt-3 text-sm font-medium"
                  style={{ color: "var(--wgi-text)" }}
                >
                  {session.user.email}
                </p>
              )}
            </div>

            {/* Error banner */}
            {error && (
              <div className="mb-5 px-4 py-3 rounded-lg border border-red-200 bg-red-50">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--wgi-text)" }}
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className={inputBase}
                  style={inputStyle}
                />
                {password.length > 0 && password.length < 8 && (
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--wgi-text-muted)" }}
                  >
                    {8 - password.length} more character
                    {8 - password.length !== 1 ? "s" : ""} needed
                  </p>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label
                  htmlFor="confirm"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--wgi-text)" }}
                >
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  className={inputBase}
                  style={inputStyle}
                />
                {confirm.length > 0 && confirm !== password && (
                  <p className="mt-1 text-xs text-red-500">
                    Passwords do not match
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-1 py-3 px-4 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                style={{ background: "var(--wgi-navy)" }}
              >
                {loading ? "Setting up account…" : "Activate account"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
