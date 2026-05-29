export type FinancialPlanStatus = "draft" | "active" | "archived";

export interface FinancialPlanInput {
  annual_income: number;
  monthly_expenses: number;
  current_savings: number;
  current_investments: number;
  target_retirement_age: number;
  expected_return_rate: number;
  inflation_rate: number;
}

export interface FinancialPlanGoals {
  emergency_fund_months: number;
  retirement_target_amount: number;
}

export interface FinancialPlanRecord {
  id: string;
  user_id: string;
  title: string;
  status: FinancialPlanStatus;
  currency: string;
  plan_input: FinancialPlanInput;
  plan_goals: FinancialPlanGoals;
  created_at: string;
  updated_at: string;
}

export interface CreateFinancialPlanPayload {
  title: string;
  currency?: string;
  plan_input: FinancialPlanInput;
  plan_goals: FinancialPlanGoals;
}

export interface UpdateFinancialPlanPayload {
  title?: string;
  status?: FinancialPlanStatus;
  currency?: string;
  plan_input?: FinancialPlanInput;
  plan_goals?: FinancialPlanGoals;
}

export interface ProjectionSummary {
  emergency_fund_target: number;
  emergency_fund_gap: number;
  monthly_surplus: number;
  years_to_target: number | null;
}
