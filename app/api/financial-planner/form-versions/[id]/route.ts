import { NextResponse } from "next/server";
import { requireAdmin, requireIFARecord, unauthorised } from "@/lib/auth-guard";
import {
  getFormVersionById,
  getFormVersionWithContent,
} from "@/lib/financial-planner/fact-find-service";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const url = new URL(request.url);
    const withContent = url.searchParams.get("include") === "content";

    if (withContent) {
      const sections = await getFormVersionWithContent(params.id);
      const version = await getFormVersionById(params.id);
      if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ version, sections });
    }

    const version = await getFormVersionById(params.id);
    if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ version });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  try {
    const body = await request.json() as { version_name?: string; notes?: string };
    const updates: Record<string, unknown> = {};
    if (body.version_name !== undefined) updates.version_name = body.version_name.trim();
    if (body.notes !== undefined) updates.notes = body.notes;

    const { data, error } = await supabaseAdmin
      .from("fp_form_versions")
      .update(updates)
      .eq("id", params.id)
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ version: data });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
