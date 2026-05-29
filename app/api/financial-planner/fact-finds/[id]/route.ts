import { NextResponse } from "next/server";
import { requireIFARecord, unauthorised } from "@/lib/auth-guard";
import {
  getAnswersForFactFind,
  getFactFindById,
  getFormVersionWithContent,
} from "@/lib/financial-planner/fact-find-service";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    // Admins can see any fact find; IFAs only see their own
    const ifaId = rec.role === "admin" ? undefined : rec.ifaId;
    const factFind = await getFactFindById(params.id, ifaId);
    if (!factFind) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const url = new URL(request.url);
    const includeAnswers = url.searchParams.get("include") === "answers";
    const includeForm = url.searchParams.get("include") === "form";
    const includeFull = url.searchParams.get("include") === "full";

    if (includeAnswers || includeFull) {
      const answers = await getAnswersForFactFind(params.id);
      if (includeFull) {
        const sections = await getFormVersionWithContent(factFind.form_version_id);
        return NextResponse.json({ fact_find: factFind, answers, sections });
      }
      return NextResponse.json({ fact_find: factFind, answers });
    }

    if (includeForm) {
      const sections = await getFormVersionWithContent(factFind.form_version_id);
      return NextResponse.json({ fact_find: factFind, sections });
    }

    return NextResponse.json({ fact_find: factFind });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
