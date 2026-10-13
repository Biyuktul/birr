-- ============================================================
-- BIRR — PostgreSQL schema for the real app (Supabase)
-- Shared household from day one: two people, one set of money.
-- Not used by the prototype; this is the Phase 3 target.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- households & membership ----------
create table households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  currency     text not null default 'ETB',
  -- Cash never counted as spendable.
  buffer_amount numeric(14,2) not null default 0,
  created_at   timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index on household_members (user_id);

-- ---------- accounts ----------
create table accounts (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  type          text not null check (type in ('bank','mobile','cash')),
  provider      text,                      -- 'CBE', 'telebirr', ...
  sender_ids    text[] not null default '{}',  -- SMS senders that map here
  opening_balance numeric(14,2) not null default 0,
  opening_date  date not null,
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index on accounts (household_id);

-- ---------- transactions ----------
create table transactions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  account_id    uuid not null references accounts(id) on delete cascade,
  occurred_on   date not null,
  -- negative = money out. One signed column, never two.
  amount        numeric(14,2) not null check (amount <> 0),
  category      text,
  note          text,
  -- Two rows share a transfer_group_id; they must net to zero.
  is_transfer   boolean not null default false,
  transfer_group_id uuid,
  source        text not null default 'manual'
                check (source in ('manual','sms','calendar','import')),
  -- what the bank itself claimed the balance was, for reconciliation
  stated_balance numeric(14,2),
  external_ref  text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index on transactions (household_id, occurred_on desc);
create index on transactions (account_id, occurred_on);
create index on transactions (transfer_group_id) where transfer_group_id is not null;
-- the same bank message must never be booked twice
create unique index on transactions (account_id, external_ref)
  where external_ref is not null;

-- ---------- recurring income & bills ----------
create table recurring_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  account_id    uuid not null references accounts(id) on delete cascade,
  kind          text not null check (kind in ('income','bill')),
  name          text not null,
  amount        numeric(14,2) not null check (amount > 0),
  category      text,
  schedule_type text not null default 'monthly'
                check (schedule_type in ('monthly','weekly','irregular')),
  day_of_month  int check (day_of_month between 1 and 31),
  day_of_week   int check (day_of_week between 0 and 6),
  -- income only: can you plan around the date?
  confidence    text check (confidence in ('high','medium','low')),
  -- income only: is the loan repayment already taken out of this figure?
  net_of_loan_deduction boolean not null default false,
  essential     boolean not null default true,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on recurring_items (household_id, kind);

-- One row per occurrence the user has settled, skipped or moved.
create table recurring_overrides (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  item_id       uuid not null references recurring_items(id) on delete cascade,
  original_date date not null,
  shifted_date  date,
  settled       boolean not null default false,
  transaction_id uuid references transactions(id) on delete set null,
  unique (item_id, original_date)
);

-- ---------- loans ----------
create table loans (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  principal     numeric(14,2) not null,
  balance       numeric(14,2) not null,
  annual_rate   numeric(6,4) not null default 0,
  auto_deduct_amount numeric(14,2) not null default 0,
  auto_deduct_day    int check (auto_deduct_day between 1 and 31),
  -- true when payroll takes it before the salary lands
  deducted_from_payroll boolean not null default true,
  opened_on     date,
  created_at    timestamptz not null default now()
);

create table loan_payments (
  id            uuid primary key default gen_random_uuid(),
  loan_id       uuid not null references loans(id) on delete cascade,
  paid_on       date not null,
  amount        numeric(14,2) not null check (amount > 0),
  kind          text not null default 'manual' check (kind in ('manual','payroll')),
  note          text,
  transaction_id uuid references transactions(id) on delete set null
);
create index on loan_payments (loan_id, paid_on);

-- ---------- ekub ----------
create table ekubs (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  account_id    uuid references accounts(id) on delete set null,
  name          text not null,
  contribution_amount numeric(14,2) not null check (contribution_amount > 0),
  frequency     text not null default 'monthly' check (frequency in ('monthly','weekly')),
  total_members int not null check (total_members > 0),
  my_payout_round int not null check (my_payout_round > 0),
  start_date    date not null,
  day_of_month  int check (day_of_month between 1 and 31),
  constraint payout_round_within_cycle check (my_payout_round <= total_members)
);

create table ekub_contributions (
  id            uuid primary key default gen_random_uuid(),
  ekub_id       uuid not null references ekubs(id) on delete cascade,
  round         int not null check (round > 0),
  paid_on       date not null,
  amount        numeric(14,2) not null,
  transaction_id uuid references transactions(id) on delete set null,
  unique (ekub_id, round)
);

-- ---------- budgets ----------
create table budgets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  category      text not null,
  monthly_cap   numeric(14,2) not null check (monthly_cap >= 0),
  unique (household_id, category)
);

-- ---------- relocation / goals ----------
create table goals (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  kind          text not null default 'relocation',
  target_date   date not null,
  -- relocation specifics
  advance_months int,
  new_monthly_rent numeric(14,2),
  deposit        numeric(14,2) default 0,
  moving_cost    numeric(14,2) default 0,
  other_monthly_delta numeric(14,2) default 0,
  created_at    timestamptz not null default now()
);

-- ---------- inbound bank messages ----------
create table pending_messages (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  received_at   timestamptz not null default now(),
  sender        text,
  body          text not null,
  -- everything the parser worked out, kept for tuning the patterns later
  parsed        jsonb,
  confidence    numeric(3,2),
  status        text not null default 'pending'
                check (status in ('pending','accepted','discarded')),
  transaction_id uuid references transactions(id) on delete set null,
  -- never ingest the same message twice
  body_hash     text generated always as (md5(coalesce(sender,'') || body)) stored
);
create unique index on pending_messages (household_id, body_hash);
create index on pending_messages (household_id, status, received_at desc);

-- ============================================================
-- ROW LEVEL SECURITY — a household's money is visible only to
-- the people in that household.
-- ============================================================
create or replace function is_household_member(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from household_members m
    where m.household_id = h and m.user_id = auth.uid()
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'accounts','transactions','recurring_items','recurring_overrides',
    'loans','ekubs','budgets','goals','pending_messages'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format($f$
      create policy %1$s_member_all on %1$I
        for all
        using (is_household_member(household_id))
        with check (is_household_member(household_id))
    $f$, t);
  end loop;
end $$;

-- households / membership have their own shape
alter table households enable row level security;
create policy households_member_select on households
  for select using (is_household_member(id));

alter table household_members enable row level security;
create policy members_self_select on household_members
  for select using (user_id = auth.uid() or is_household_member(household_id));

-- child tables reached through their parent
alter table loan_payments enable row level security;
create policy loan_payments_member_all on loan_payments
  for all using (exists (
    select 1 from loans l where l.id = loan_id and is_household_member(l.household_id)))
  with check (exists (
    select 1 from loans l where l.id = loan_id and is_household_member(l.household_id)));

alter table ekub_contributions enable row level security;
create policy ekub_contributions_member_all on ekub_contributions
  for all using (exists (
    select 1 from ekubs e where e.id = ekub_id and is_household_member(e.household_id)))
  with check (exists (
    select 1 from ekubs e where e.id = ekub_id and is_household_member(e.household_id)));
