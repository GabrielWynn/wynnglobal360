"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Microsoft 4-colour icon
// ---------------------------------------------------------------------------
function MicrosoftIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1"  y="1"  width="8.5" height="8.5" fill="#F25022" />
      <rect x="10.5" y="1"  width="8.5" height="8.5" fill="#7FBA00" />
      <rect x="1"  y="10.5" width="8.5" height="8.5" fill="#00A4EF" />
      <rect x="10.5" y="10.5" width="8.5" height="8.5" fill="#FFB900" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Shared input style
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
// Inner component — uses useSearchParams (must be inside <Suspense>)
// ---------------------------------------------------------------------------
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/advisors";

  const supabase = createBrowserClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  type Mode = "login" | "forgot";
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Supabase redirects here when a reset/invite link is invalid or expired.
  useEffect(() => {
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );
    const errorCode =
      searchParams.get("error_code") ?? hashParams.get("error_code");
    const errorDescription =
      searchParams.get("error_description") ??
      hashParams.get("error_description");
    const success = searchParams.get("success");

    if (success) {
      setSuccessMessage(success.replace(/\+/g, " "));
    }

    if (errorCode === "otp_expired") {
      setMode("forgot");
      setError(
        "This reset link has expired or was already used. Request a new link below — use the latest email only, and click the link once."
      );
    } else if (searchParams.get("error") || hashParams.get("error")) {
      setMode("forgot");
      setError(
        errorDescription?.replace(/\+/g, " ") ??
          "This sign-in link is invalid. Please request a new reset email."
      );
    }

    if (
      errorCode ||
      searchParams.get("error") ||
      hashParams.get("error") ||
      success
    ) {
      window.history.replaceState({}, "", "/login");
    }
  }, [searchParams]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setResetSent(false);
  }

  // ------------------------------------------------------------------
  // Email + password login
  // ------------------------------------------------------------------
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // Refresh session so we have the access_token immediately
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      // Non-blocking: link the IFA row to the authenticated user_id
      fetch("/api/auth/link-ifa", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      }).catch(() => {});

      router.push(redirectTo);
    }

    setLoading(false);
  }

  // ------------------------------------------------------------------
  // Forgot-password / reset
  // ------------------------------------------------------------------
  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Use the current origin so the email link returns to the same deployment
    // the user requested the reset from (localhost, Vercel preview, production).
    const redirectOrigin = window.location.origin || siteUrl;

    const { error: resetError } =
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${redirectOrigin}/reset-password`,
      });

    if (resetError) {
      setError(resetError.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  }

  // ------------------------------------------------------------------
  // Microsoft / Azure OAuth
  // ------------------------------------------------------------------
  async function handleMicrosoftLogin() {
    await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: { redirectTo: `${siteUrl}/advisors` },
    });
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="min-h-screen flex">
      {/* ============================================================
          LEFT PANEL — hidden on mobile, visible lg+
          ============================================================ */}
      <div
        className="hidden lg:flex lg:w-1/2 relative flex-col overflow-hidden"
        style={{ background: "var(--wgi-navy)" }}
      >
        {/* Subtle grid lines */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)
            `,
            backgroundSize: "64px 64px",
          }}
        />

        {/* Radial glow — top-right (gold) */}
        <div
          className="absolute -top-48 -right-48 w-[520px] h-[520px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(200,169,110,0.22) 0%, transparent 65%)",
          }}
        />

        {/* Radial glow — bottom-left (accent blue) */}
        <div
          className="absolute -bottom-36 -left-36 w-96 h-96 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(41,128,217,0.18) 0%, transparent 65%)",
          }}
        />

        {/* Logo */}
        <div className="relative z-10 p-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-invert.png"
            alt="Wynn Global Insurance"
            style={{ height: "48px", width: "auto" }}
          />
        </div>

        {/* Hero text */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-12">
          <p
            className="text-xs font-semibold tracking-widest uppercase mb-6"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            Advisor Hub
          </p>

          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight">
            Transparent.{" "}
            <span style={{ color: "var(--wgi-gold)" }}>Accurate.</span>{" "}
            Advisor Platform.
          </h1>

          <p
            className="mt-6 text-base leading-relaxed max-w-sm"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            Manage clients, commissions, and portfolios from one secure,
            purpose-built workspace.
          </p>
        </div>

        {/* Footer */}
        <div className="relative z-10 p-10">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.28)" }}>
            © {new Date().getFullYear()} Wynn Global Insurance. All rights
            reserved.
          </p>
        </div>
      </div>

      {/* ============================================================
          RIGHT PANEL — full width on mobile, half width lg+
          ============================================================ */}
      <div className="flex-1 flex items-center justify-center px-6 py-14 bg-white">
        <div className="w-full max-w-[400px]">

          {/* Mobile-only logo */}
          <div className="flex justify-center mb-10 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Wynn Global Insurance"
              style={{ height: "40px", width: "auto" }}
            />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2
              className="text-2xl font-bold"
              style={{ color: "var(--wgi-text)" }}
            >
              {mode === "login" ? "Welcome back" : "Reset password"}
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--wgi-text-muted)" }}
            >
              {mode === "login"
                ? "Sign in to your advisor account"
                : "We'll send a reset link to your email address"}
            </p>
          </div>

          {/* Success banner (e.g. after password update) */}
          {successMessage && (
            <div className="mb-5 px-4 py-3 rounded-lg border border-emerald-200 bg-emerald-50">
              <p className="text-sm text-emerald-700">{successMessage}</p>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg border border-red-200 bg-red-50">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Reset-sent success */}
          {resetSent && mode === "forgot" && (
            <div className="mb-5 px-4 py-3 rounded-lg border border-emerald-200 bg-emerald-50">
              <p className="text-sm text-emerald-700">
                Check your inbox — a reset link is on its way.
              </p>
            </div>
          )}

          {/* ── Form ── */}
          <form
            onSubmit={mode === "login" ? handleLogin : handleForgotPassword}
            className="space-y-4"
          >
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--wgi-text)" }}
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputBase}
                style={inputStyle}
              />
            </div>

            {/* Password — login mode only */}
            {mode === "login" && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium"
                    style={{ color: "var(--wgi-text)" }}
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="text-sm font-medium transition-opacity hover:opacity-70"
                    style={{ color: "var(--wgi-accent)" }}
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputBase}
                  style={inputStyle}
                />
              </div>
            )}

            {/* Primary submit button */}
            <button
              type="submit"
              disabled={loading || (resetSent && mode === "forgot")}
              className="w-full mt-1 py-3 px-4 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ background: "var(--wgi-navy)" }}
            >
              {loading
                ? mode === "login"
                  ? "Signing in…"
                  : "Sending…"
                : mode === "login"
                ? "Sign In"
                : "Send reset link"}
            </button>
          </form>

          {/* Back to sign in (forgot mode) */}
          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="mt-4 w-full text-center text-sm transition-opacity hover:opacity-70"
              style={{ color: "var(--wgi-text-muted)" }}
            >
              ← Back to sign in
            </button>
          )}

          {/* Divider + Microsoft SSO — login mode only */}
          {mode === "login" && (
            <>
              <div className="flex items-center gap-4 my-6">
                <div
                  className="flex-1 h-px"
                  style={{ background: "var(--wgi-border)" }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--wgi-text-muted)" }}
                >
                  or
                </span>
                <div
                  className="flex-1 h-px"
                  style={{ background: "var(--wgi-border)" }}
                />
              </div>

              <button
                type="button"
                onClick={handleMicrosoftLogin}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-50"
                style={{
                  borderColor: "var(--wgi-border)",
                  color: "var(--wgi-text)",
                }}
              >
                <MicrosoftIcon />
                Sign in with Microsoft
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export — Suspense required because LoginContent uses useSearchParams
// ---------------------------------------------------------------------------
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
