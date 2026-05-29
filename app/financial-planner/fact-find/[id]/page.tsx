import { redirect, notFound } from "next/navigation";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";
import {
  getAnswersForFactFind,
  getFactFindById,
  getFormVersionWithContent,
} from "@/lib/financial-planner/fact-find-service";
import FactFindWizard from "@/components/financial-planner/FactFindWizard";

export default async function FactFindWizardPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let ifaRecord: { id: string; role: string } | null = null;
  const { data: byUserId } = await supabaseAdmin
    .from("ifas")
    .select("id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (byUserId) {
    ifaRecord = byUserId as { id: string; role: string };
  } else if (user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas")
      .select("id, role")
      .eq("email", user.email)
      .maybeSingle();
    if (byEmail) ifaRecord = byEmail as { id: string; role: string };
  }
  if (!ifaRecord) redirect("/advisors");

  const ifaId = ifaRecord.role === "admin" ? undefined : ifaRecord.id;
  const factFind = await getFactFindById(params.id, ifaId);
  if (!factFind) notFound();

  if (factFind.status === "completed") {
    redirect(`/financial-planner/admin/fact-finds/${params.id}`);
  }

  const sections = await getFormVersionWithContent(factFind.form_version_id);
  const answers = await getAnswersForFactFind(params.id);

  return (
    <div
      className="h-[calc(100vh-64px)] flex flex-col"
      style={{ background: "var(--wgi-bg)" }}
    >
      {/* Session header */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
        style={{
          borderColor: "var(--wgi-border)",
          background: "var(--wgi-navy)",
          color: "white",
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Fact Find</span>
          {factFind.client && (
            <span className="text-xs opacity-80">
              {(factFind.client as { first_name?: string; last_name?: string }).first_name}{" "}
              {(factFind.client as { first_name?: string; last_name?: string }).last_name}
            </span>
          )}
        </div>
        <span className="text-xs opacity-70 uppercase tracking-wide">
          {factFind.language === "es" ? "Español" : "English"}
        </span>
      </div>

      {/* Wizard */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <FactFindWizard
          factFind={factFind}
          sections={sections}
          initialAnswers={answers}
        />
      </div>
    </div>
  );
}
