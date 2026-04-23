export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Provides a white, full-viewport shell for all auth pages.
    // Each child page manages its own centering / split-panel layout.
    <div className="min-h-screen bg-white">{children}</div>
  );
}
