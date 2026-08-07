"use client";

import { useEffect } from "react";

interface SaveToastProps {
  message: string | null;
  onDone: () => void;
}

export default function SaveToast({ message, onDone }: SaveToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, 2200);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  if (!message) return null;

  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white"
      style={{ background: "var(--wgi-navy)" }}
    >
      <span aria-hidden="true">✓</span>
      {message}
    </div>
  );
}
