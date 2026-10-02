/**
 * /api/risk-matrix/cron/review-reminders
 *
 * Weekly reminder email for periodic client reviews — triggered by Vercel
 * Cron every Monday at 13:00 UTC (see vercel.json). Lists clients whose
 * review is overdue or due within REVIEW_NOTICE_DAYS and sends it to every
 * active user who has been given the Risk Matrix app. Nothing is sent when
 * no review is due.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Required env vars: CRON_SECRET, RESEND_API_KEY, RESEND_FROM_EMAIL
 * (a sender on a domain verified in Resend), NEXT_PUBLIC_SITE_URL.
 */

import { NextResponse } from "next/server";
import { EMAIL_FROM, getResendClient } from "@/lib/email/resend";
import { REVIEW_NOTICE_DAYS, addDaysISO, daysBetween, utcTodayISO } from "@/lib/risk-matrix/reviews";
import { fmtDate } from "@/lib/risk-matrix/format";
import { listReviews } from "@/lib/risk-matrix/service";
import type { ClientSummary } from "@/lib/risk-matrix/types";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function isAuthorised(request: Request): boolean {
  const auth = request.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";
  return !!cronSecret && auth === `Bearer ${cronSecret}`;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function renderEmail(overdue: ClientSummary[], upcoming: ClientSummary[], today: string): string {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/risk-matrix/reviews`;
  const td = "padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:13px;color:#1A202C";

  const rows = (list: ClientSummary[], late: boolean) =>
    list
      .map((c) => {
        const days = Math.abs(daysBetween(today, c.next_review_date!));
        const when = late ? `hace ${days} d` : days === 0 ? "hoy" : `en ${days} d`;
        return (
          `<tr><td style="${td};color:#64748B">${esc(c.client_ref)}</td>` +
          `<td style="${td};font-weight:600">${esc(c.name)}</td>` +
          `<td style="${td}">${esc(c.final_classification)}</td>` +
          `<td style="${td};white-space:nowrap${late ? ";color:#B0353B;font-weight:600" : ""}">` +
          `${fmtDate(c.next_review_date)} (${when})</td></tr>`
        );
      })
      .join("");

  const section = (title: string, list: ClientSummary[], late: boolean) =>
    list.length === 0
      ? ""
      : `<p style="margin:20px 24px 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${late ? "#B0353B" : "#64748B"}">${title} (${list.length})</p>
         <table style="width:100%;border-collapse:collapse">${rows(list, late)}</table>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Revisiones de riesgo pendientes</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F8FAFC;margin:0;padding:32px 16px">
  <div style="max-width:600px;margin:0 auto">
    <div style="background:#1B2D45;color:white;padding:24px;border-radius:8px 8px 0 0;border-bottom:3px solid #C8A96E">
      <h1 style="margin:0;font-size:20px;font-weight:700">Risk Matrix · Revisiones</h1>
      <p style="margin:4px 0 0;font-size:13px;opacity:0.8">Evaluación de Riesgo PLAyFT · ${fmtDate(today)}</p>
    </div>
    <div style="background:white;padding:4px 0 16px;border:1px solid #E2E8F0;border-top:none">
      ${section("Revisiones vencidas", overdue, true)}
      ${section(`Próximos ${REVIEW_NOTICE_DAYS} días`, upcoming, false)}
    </div>
    <div style="background:#F1F5F9;padding:16px 24px;border-radius:0 0 8px 8px;border:1px solid #E2E8F0;border-top:none">
      <p style="margin:0;font-size:12px;color:#64748B">
        Para reevaluar a un cliente, abre <a href="${url}" style="color:#2980D9">Revisiones</a> en Wynn Global 360.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function GET(request: Request) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  try {
    const today = utcTodayISO();
    const due = await listReviews(addDaysISO(today, REVIEW_NOTICE_DAYS));
    if (due.length === 0) {
      return NextResponse.json({ sent: false, message: "No reviews due" });
    }

    // Admins can open every app without a user_app_access row, so they are
    // not notified unless they are given Risk Matrix explicitly.
    const { data: grants, error: grantsError } = await supabaseAdmin
      .from("user_app_access")
      .select("ifa_id")
      .eq("app_slug", "risk-matrix");
    if (grantsError) throw new Error(grantsError.message);

    const { data: users, error } = await supabaseAdmin
      .from("ifas")
      .select("email")
      .in("id", (grants ?? []).map((g) => (g as { ifa_id: string }).ifa_id))
      .eq("status", "active");
    if (error) throw new Error(error.message);

    const recipients = (users ?? [])
      .map((u) => (u as { email: string | null }).email?.trim())
      .filter((e): e is string => !!e);
    if (recipients.length === 0) {
      return NextResponse.json({ sent: false, message: "No active Risk Matrix users to notify" });
    }

    const overdue = due.filter((c) => c.next_review_date! < today);
    const upcoming = due.filter((c) => c.next_review_date! >= today);

    const subject =
      overdue.length > 0
        ? `Risk Matrix · ${overdue.length} revisiones vencidas, ${upcoming.length} próximas`
        : `Risk Matrix · ${upcoming.length} revisiones en los próximos ${REVIEW_NOTICE_DAYS} días`;

    const { error: sendError } = await getResendClient().emails.send({
      from: EMAIL_FROM,
      to: recipients,
      subject,
      html: renderEmail(overdue, upcoming, today),
    });
    if (sendError) throw new Error(sendError.message);

    return NextResponse.json({
      sent: true,
      recipients: recipients.length,
      overdue: overdue.length,
      upcoming: upcoming.length,
    });
  } catch (err) {
    console.error("[risk-matrix review-reminders]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reminder failed" },
      { status: 500 }
    );
  }
}
