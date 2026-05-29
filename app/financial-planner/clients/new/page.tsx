import ClientForm from "@/components/financial-planner/ClientForm";

export default function NewClientPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: "var(--wgi-text)" }}>
          New Client
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--wgi-text-muted)" }}>
          Create a client profile to start a Fact Find session.
        </p>
      </div>

      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--wgi-border)", background: "white" }}
      >
        <ClientForm />
      </div>
    </div>
  );
}
