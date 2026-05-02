 Migration: extend checkout_sales with service lifecycle statuses and fields
-- New statuses: in_progress, task_completed
-- New fields: pre_work_requirement, in_progress_note, post_work_note, in_progress_at, task_completed_at

alter table if exists checkout_sales add column if not exists pre_work_requirement text;
alter table if exists checkout_sales add column if not exists in_progress_note text;
alter table if exists checkout_sales add column if not exists post_work_note text;
alter table if exists checkout_sales add column if not exists in_progress_at timestamptz;
alter table if exists checkout_sales add column if not exists task_completed_at timestamptz;
--
-- Update status check constraint to include new statuses
-- Find and drop the existing status check constraint if it exists
do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'checkout_sales'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%';
  if c_name is not null then
    execute format('alter table checkout_sales drop constraint %I', c_name);
  end if;
end $$;

alter table checkout_sales add constraint checkout_sales_status_chk
  check (status in ('draft', 'committed', 'in_progress', 'task_completed', 'checked_out'));
