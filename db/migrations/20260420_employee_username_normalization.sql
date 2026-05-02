-- Normalize employee usernames and stabilize permission integrity.

-- Step 1: Point permission rows to canonical usernames before any deletes.
with ranked_users as (
  select
    id,
    username,
    lower(trim(username)) as normalized_username,
    row_number() over (
      partition by lower(trim(username))
      order by created_at asc nulls last, id asc
    ) as rn
  from employee_users
),
canonical_users as (
  select normalized_username, username as canonical_username
  from ranked_users
  where rn = 1
)
update employee_page_permissions p
set username = c.canonical_username,
    updated_at = now()
from canonical_users c
where lower(trim(p.username)) = c.normalized_username
  and p.username <> c.canonical_username;

-- Step 2: Remove duplicate employee user rows (case-insensitive duplicates).
with ranked_users as (
  select
    id,
    row_number() over (
      partition by lower(trim(username))
      order by created_at asc nulls last, id asc
    ) as rn
  from employee_users
)
delete from employee_users u
using ranked_users r
where u.id = r.id
  and r.rn > 1;

-- Step 3: Normalize remaining usernames to lowercase canonical form.
update employee_users
set username = lower(trim(username)),
    updated_at = now()
where username <> lower(trim(username));

update employee_page_permissions
set username = lower(trim(username)),
    updated_at = now()
where username <> lower(trim(username));

-- Step 4: Remove duplicate permission rows after normalization.
with ranked_permissions as (
  select
    id,
    row_number() over (
      partition by lower(trim(username)), page_key
      order by created_at asc nulls last, id asc
    ) as rn
  from employee_page_permissions
)
delete from employee_page_permissions p
using ranked_permissions r
where p.id = r.id
  and r.rn > 1;

-- Step 5: Enforce direct username uniqueness and reliable FK linkage.
create unique index if not exists ux_employee_users_username
on employee_users (username);

create unique index if not exists ux_employee_users_username_lower
on employee_users (lower(username));

create unique index if not exists ux_employee_permissions_username_page
on employee_page_permissions (lower(username), page_key);

alter table if exists employee_page_permissions
  drop constraint if exists fk_employee_permissions_user;

alter table if exists employee_page_permissions
  add constraint fk_employee_permissions_user
  foreign key (username) references employee_users (username)
  on update cascade
  on delete cascade;
