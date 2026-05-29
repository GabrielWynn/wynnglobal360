import { supabaseAdmin } from "@/lib/supabase";
import type {
  CreateFinancialPlanPayload,
  FinancialPlanRecord,
  ProjectionSummary,
  UpdateFinancialPlanPayload,
} from "@/lib/financial-planner/types";

const TABLE_NAME = "financial_plans";

export async function listPlansByUser(userId: string): Promise<FinancialPlanRecord[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as FinancialPlanRecord[];
}

export async function getPlanById(planId: string, userId: string): Promise<FinancialPlanRecord | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select("*")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as FinancialPlanRecord | null) ?? null;
}

export async function createPlan(userId: string, payload: CreateFinancialPlanPayload): Promise<FinancialPlanRecord> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .insert({
      user_id: userId,
      title: payload.title.trim(),
      status: "draft",
      currency: payload.currency ?? "USD",
      plan_input: payload.plan_input,
      plan_goals: payload.plan_goals,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as FinancialPlanRecord;
}

export async function updatePlan(
  planId: string,
  userId: string,
  payload: UpdateFinancialPlanPayload
): Promise<FinancialPlanRecord | null> {
  const updates: Record<string, unknown> = {};
  if (payload.title !== undefined) updates.title = payload.title.trim();
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.currency !== undefined) updates.currency = payload.currency;
  if (payload.plan_input !== undefined) updates.plan_input = payload.plan_input;
  if (payload.plan_goals !== undefined) updates.plan_goals = payload.plan_goals;

  if (Object.keys(updates).length === 0) {
    return getPlanById(planId, userId);
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .update(updates)
    .eq("id", planId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as FinancialPlanRecord | null) ?? null;
}

export async function archivePlan(planId: string, userId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from(TABLE_NAME)
    .update({ status: "archived" })
    .eq("id", planId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return true;
}

export function buildProjectionSummary(plan: FinancialPlanRecord): ProjectionSummary {
  const monthlySurplus = plan.plan_input.annual_income / 12 - plan.plan_input.monthly_expenses;
  const emergencyFundTarget = plan.plan_input.monthly_expenses * plan.plan_goals.emergency_fund_months;
  const liquidBase = plan.plan_input.current_savings;
  const emergencyFundGap = Math.max(0, emergencyFundTarget - liquidBase);

  const yearsToTarget =
    monthlySurplus > 0
      ? Number((emergencyFundGap / (monthlySurplus * 12)).toFixed(1))
      : null;

  return {
    emergency_fund_target: emergencyFundTarget,
    emergency_fund_gap: emergencyFundGap,
    monthly_surplus: monthlySurplus,
    years_to_target: yearsToTarget,
  };
}
