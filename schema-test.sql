\set ON_ERROR_STOP off
\pset pager off
set session_replication_role = replica;  -- bypass RLS as superuser for the test

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into households (id,name) values ('22222222-2222-2222-2222-222222222222','Test');
insert into household_members (household_id,user_id) values
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111');
insert into accounts (id,household_id,name,type,opening_date) values
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','CBE','bank','2026-10-01');

\echo '--- 1. a zero-amount transaction must be rejected'
insert into transactions (household_id,account_id,occurred_on,amount)
  values ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','2026-10-13',0);

\echo '--- 2. first booking of a bank reference succeeds'
insert into transactions (household_id,account_id,occurred_on,amount,external_ref)
  values ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','2026-10-13',-500,'FT26286XYZ');

\echo '--- 3. the SAME bank reference must not book twice'
insert into transactions (household_id,account_id,occurred_on,amount,external_ref)
  values ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','2026-10-13',-500,'FT26286XYZ');

\echo '--- 4. two transactions with no reference are fine'
insert into transactions (household_id,account_id,occurred_on,amount) values
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','2026-10-13',-100),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','2026-10-13',-100);

\echo '--- 5. the same SMS must not be ingested twice'
insert into pending_messages (household_id,sender,body) values
  ('22222222-2222-2222-2222-222222222222','CBE','debited with ETB 500.00');
insert into pending_messages (household_id,sender,body) values
  ('22222222-2222-2222-2222-222222222222','CBE','debited with ETB 500.00');

\echo '--- 6. an Ekub payout round beyond the member count must be rejected'
insert into ekubs (household_id,name,contribution_amount,total_members,my_payout_round,start_date)
  values ('22222222-2222-2222-2222-222222222222','E',3000,12,13,'2026-08-15');

\echo '--- 7. a valid Ekub is accepted'
insert into ekubs (id,household_id,name,contribution_amount,total_members,my_payout_round,start_date)
  values ('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222','E',3000,12,7,'2026-08-15');

\echo '--- 8. the same Ekub round must not be paid twice'
insert into ekub_contributions (ekub_id,round,paid_on,amount) values
  ('44444444-4444-4444-4444-444444444444',1,'2026-08-15',3000);
insert into ekub_contributions (ekub_id,round,paid_on,amount) values
  ('44444444-4444-4444-4444-444444444444',1,'2026-08-15',3000);

\echo '--- 9. an unknown account type must be rejected'
insert into accounts (household_id,name,type,opening_date) values
  ('22222222-2222-2222-2222-222222222222','X','crypto','2026-10-01');

\echo '--- final counts'
select 'transactions=' || count(*) from transactions;
select 'pending_messages=' || count(*) from pending_messages;
select 'ekub_contributions=' || count(*) from ekub_contributions;
