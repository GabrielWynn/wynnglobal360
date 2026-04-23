"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconClockExclamation } from "@tabler/icons-react";
import { createBrowserClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TIMEOUT_MS = 27 * 60 * 1000; // 27 minutes

const ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function SessionTimeout() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expired, setExpired] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // ------------------------------------------------------------------
  // Reset the inactivity timer on every user interaction
  // ------------------------------------------------------------------
  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setExpired(true), TIMEOUT_MS);
  }, []);

  // ------------------------------------------------------------------
  // Mount: start timer, attach activity listeners, watch auth state
  // ------------------------------------------------------------------
  useEffect(() => {
    // Kick off the first countdown
    resetTimer();

    // Attach passive listeners — they do not block scroll/paint
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, resetTimer, { passive: true })
    );

    // Redirect on SIGNED_OUT (covers external sign-out, token revocation, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.push("/login");
      }
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, resetTimer)
      );
      subscription.unsubscribe();
    };
    // resetTimer is stable (useCallback []); router and supabase are stable refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Modal action — sign out then redirect
  // SIGNED_OUT handler above will also fire; router.push is idempotent
  // ------------------------------------------------------------------
  async function handleSignInAgain() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  }

  // Nothing to render until the session has expired
  if (!expired) return null;

  // ------------------------------------------------------------------
  // Expired modal — no dismiss option
  // ------------------------------------------------------------------
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm mx-4 bg-white rounded-xl shadow-2xl p-8 text-center">

        {/* Icon badge */}
        <div className="flex justify-center mb-5">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "rgba(200,169,110,0.12)" }}
          >
            <IconClockExclamation
              size={28}
              stroke={1.75}
              style={{ color: "var(--wgi-gold)" }}
            />
          </div>
        </div>

        {/* Title */}
        <h2
          id="session-timeout-title"
          className="text-xl font-bold mb-2"
          style={{ color: "var(--wgi-text)" }}
        >
          Your session has expired
        </h2>

        {/* Message */}
        <p
          className="text-sm leading-relaxed mb-8"
          style={{ color: "var(--wgi-text-muted)" }}
        >
          You have been inactive for 27 minutes. Please sign in again to
          continue.
        </p>

        {/* CTA — no close/dismiss option */}
        <button
          onClick={handleSignInAgain}
          disabled={signingOut}
          className="w-full py-3 px-4 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: "var(--wgi-navy)" }}
        >
          {signingOut ? "Signing out…" : "Sign In Again"}
        </button>
      </div>
    </div>
  );
}
