-- ============================================================
-- BIRR — database setup
--
-- Paste this whole file into the Supabase SQL editor and run it once.
-- (Supabase dashboard → your project → SQL Editor → New query → Run)
--
-- One row per person. Each person sees their own row and nobody else's —
-- that is enforced by the database, not by the app, so a bug in the app
-- cannot expose one person's money to another.
-- ============================================================

create table if not exists public.ledgers (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  -- the whole ledger: accounts, bills, loan, Ekub, transactions, the lot
  doc        jsonb       not null,
  -- bumped on every write. A write that names a stale revision is rejected,
  -- which is what stops two devices silently overwriting each other.
  rev        bigint      not null default 1 check (rev > 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.ledgers enable row level security;

-- Drop first so re-running this file is safe.
drop policy if exists ledgers_select_own on public.ledgers;
drop policy if exists ledgers_insert_own on public.ledgers;
drop policy if exists ledgers_update_own on public.ledgers;
drop policy if exists ledgers_delete_own on public.ledgers;

create policy ledgers_select_own on public.ledgers
  for select using (auth.uid() = user_id);

create policy ledgers_insert_own on public.ledgers
  for insert with check (auth.uid() = user_id);

create policy ledgers_update_own on public.ledgers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy ledgers_delete_own on public.ledgers
  for delete using (auth.uid() = user_id);

-- The revision must only ever go forward, by exactly one. This is belt and
-- braces behind the app's optimistic lock: even a buggy or hostile client
-- cannot rewind someone's history or skip ahead.
create or replace function public.ledgers_rev_guard()
returns trigger language plpgsql as $$
begin
  if new.rev <> old.rev + 1 then
    raise exception 'ledger revision must advance by exactly one (was %, got %)', old.rev, new.rev
      using errcode = '55000';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists ledgers_rev_guard on public.ledgers;
create trigger ledgers_rev_guard
  before update on public.ledgers
  for each row execute function public.ledgers_rev_guard();
