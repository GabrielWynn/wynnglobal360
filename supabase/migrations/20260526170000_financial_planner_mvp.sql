create table if not exists public.financial_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  currency text not null default 'USD' check (char_length(currency) = 3),
  plan_input jsonb not null default '{}'::jsonb,
  plan_goals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_financial_plans_user_id on public.financial_plans(user_id);
create index if not exists idx_financial_plans_status on public.financial_plans(status);

create or replace function public.set_financial_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_financial_plans_updated_at on public.financial_plans;
create trigger trg_financial_plans_updated_at
before update on public.financial_plans
for each row
execute function public.set_financial_plans_updated_at();

alter table public.financial_plans enable row level security;

drop policy if exists "financial_plans_select_own" on public.financial_plans;
create policy "financial_plans_select_own"
on public.financial_plans
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "financial_plans_insert_own" on public.financial_plans;
create policy "financial_plans_insert_own"
on public.financial_plans
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "financial_plans_update_own" on public.financial_plans;
create policy "financial_plans_update_own"
on public.financial_plans
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "financial_plans_delete_own" on public.financial_plans;
create policy "financial_plans_delete_own"
on public.financial_plans
for delete
to authenticated
using (auth.uid() = user_id);
