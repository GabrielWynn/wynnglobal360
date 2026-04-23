"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";

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
// No Suspense needed — this page does not call useSearchParams.
// Supabase embeds the recovery token in the URL hash (#access_token=…),
// which is never sent to the server and processed entirely client-side.
// ---------------------------------------------------------------------------
export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  // 'loading'  → waiting for Supabase to exchange the hash token
  // 'ready'    → recovery session confirmed, show form
  // 'invalid'  → hash missing or token expired
  type Status = "loading" | "ready" | "invalid";
  const [status, setStatus] = useState<Status>("loading");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ------------------------------------------------------------------
  // Listen for the PASSWORD_RECOVERY event that Supabase fires when it
  // processes the #access_token in the URL.  Also check for an existing
  // session in case the page is refreshed after the hash is consumed.
  // ------------------------------------------------------------------
  useEffect(() => {
    // Check whether a recovery session is already present (page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStatus("ready");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setStatus("ready");
      }
    });

    // If Supabase never fires PASSWORD_RECOVERY after 4 s, the link is invalid
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
  // Submit
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

    setSuccess(true);
    // Sign out the recovery session so the user starts fresh
    await supabase.auth.signOut();
    setTimeout(() => {
      router.push("/login?success=Password+updated+successfully");
    }, 1500);
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
              Verifying your reset link…
            </p>
          </div>
        )}

        {/* ── Invalid / expired link ── */}
        {status === "invalid" && (
          <div className="text-center space-y-4">
            <div className="px-4 py-3 rounded-lg border border-red-200 bg-red-50">
              <p className="text-sm text-red-700">
                This reset link is invalid or has expired. Please request a new
                one.
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

        {/* ── Ready — show form ── */}
        {status === "ready" && (
          <>
            <div className="mb-8">
              <h2
                className="text-2xl font-bold"
                style={{ color: "var(--wgi-text)" }}
              >
                Set new password
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--wgi-text-muted)" }}
              >
                Choose a strong password for your account.
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="mb-5 px-4 py-3 rounded-lg border border-red-200 bg-red-50">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Success banner */}
            {success && (
              <div className="mb-5 px-4 py-3 rounded-lg border border-emerald-200 bg-emerald-50">
                <p className="text-sm text-emerald-700">
                  Password updated! Redirecting to sign in…
                </p>
              </div>
            )}

            {!success && (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New password */}
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: "var(--wgi-text)" }}
                  >
                    New password
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
                  {/* Inline strength hint */}
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
                  {/* Inline match hint */}
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
                  {loading ? "Updating…" : "Update password"}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
