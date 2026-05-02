alter table if exists customers
  add column if not exists credit_days integer not null default 0;

update customers
set credit_days = 0
where credit_days is null;
