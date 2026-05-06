create table if not exists public.account_setup_completions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  completed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.account_setup_completions enable row level security;

drop policy if exists "Users can read their own account setup completion"
  on public.account_setup_completions;
create policy "Users can read their own account setup completion"
  on public.account_setup_completions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own account setup completion"
  on public.account_setup_completions;
create policy "Users can insert their own account setup completion"
  on public.account_setup_completions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own account setup completion"
  on public.account_setup_completions;
create policy "Users can update their own account setup completion"
  on public.account_setup_completions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into public.account_setup_completions (user_id, completed_at)
select
  id,
  timezone('utc', now())
from public.profiles
where (
  age is not null
  or nullif(trim(coalesce(sex, '')), '') is not null
  or height_cm is not null
  or weight_kg is not null
)
on conflict (user_id) do nothing;
