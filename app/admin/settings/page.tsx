import SettingsPanel from "@/components/admin/SettingsPanel";

// Auth is already verified by app/admin/layout.tsx.
export default function AdminSettingsPage() {
  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
          System Settings
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--wgi-text-muted)" }}>
          Manage platforms, commission types, and platform-wide defaults
        </p>
      </div>

      <SettingsPanel />
    </div>
  );
}
